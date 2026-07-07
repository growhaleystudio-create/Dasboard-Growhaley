'use client';

import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/useSession';
import { fetchApi } from '@/lib/api';
import {
  deterministicLeadScore,
  leadBand,
  LEAD_BAND_META,
  leadStarRating,
  sourceLabelFor,
  sourceUrlFor,
  websiteStatusFor,
  websiteStatusLabelFor,
  websiteUrlFor,
  whatsappTargetFor,
} from '@/lib/leadDisplay';
import { AlignLeadTable, type AlignLead } from '@/components/leads/AlignLeadTable';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Radio } from '@/components/ui/Radio';
import { toast } from 'sonner';
import { Pagination } from '@/components/ui/Pagination';
import { PageHeaderSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { AlertTriangle, Download, Plus, RefreshCcw, Search, Sparkles, Star } from 'lucide-react';
import type { LeadScoreBreakdown, LeadStatus, WhatsAppVerificationStatus } from '@leads-generator/shared';
import type { LeadListItem, PageResponse } from '@/lib/types';

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function scoreDimensionLabel(key: keyof Pick<LeadScoreBreakdown, 'businessValueScore' | 'websiteNeedScore' | 'reachabilityScore' | 'confidenceScore'>) {
  switch (key) {
    case 'businessValueScore':
      return 'Business Value';
    case 'websiteNeedScore':
      return 'Digital Gap';
    case 'reachabilityScore':
      return 'Reachability';
    case 'confidenceScore':
      return 'Confidence';
    default:
      return key;
  }
}

function parseAiAnalysis(lead: LeadListItem) {
  const score = lead.aiIntentScore;
  const starRating = score === null ? null : Math.max(1, Math.min(5, Math.round(score / 20)));
  const insight = lead.aiInsight ?? '';
  const reasonMatch =
    /Alasan:\s*(.*?)(?:\s+Pain points:|\s+UX flow:|\s+UX visual:|\s+Performance issues:|\s+Solusi performa:|\s+Sales angle:|\s+Angle:|$)/i.exec(insight) ??
    /^\d+\s+stars?:\s*(.*?)(?:\s+Confidence:|\s+Pain points:|\s+Angle:|$)/i.exec(insight);
  const confidenceMatch = /Confidence:\s*(\d+)%/i.exec(insight);
  const painMatch = /Pain points:\s*(.*?)(?:\s+UX flow:|\s+UX visual:|\s+Performance issues:|\s+Solusi performa:|\s+Sales angle:|\s+Angle:|$)/i.exec(insight);
  const uxFlowMatch = /UX flow:\s*(.*?)(?:\s+UX visual:|\s+Performance issues:|\s+Solusi performa:|\s+Sales angle:|\s+Angle:|$)/i.exec(insight);
  const uxVisualMatch = /UX visual:\s*(.*?)(?:\s+Performance issues:|\s+Solusi performa:|\s+Sales angle:|\s+Angle:|$)/i.exec(insight);
  const performanceIssuesMatch = /Performance issues:\s*(.*?)(?:\s+Solusi performa:|\s+Sales angle:|\s+Angle:|$)/i.exec(insight);
  const performanceSolutionsMatch = /Solusi performa:\s*(.*?)(?:\s+Sales angle:|\s+Angle:|$)/i.exec(insight);
  const angleMatch = /(?:Sales angle|Angle):\s*(.*)$/i.exec(insight);
  const toList = (value: string | undefined) =>
    value
      ?.split(';')
      .map((item) => item.trim())
      .filter((item) => Boolean(item) && !/\bunknown\b|not explicitly stated|likely unknown|tidak diketahui/i.test(item)) ?? [];

  return {
    starRating,
    confidence: confidenceMatch ? Number(confidenceMatch[1]) : null,
    reason: reasonMatch?.[1]?.trim() ?? (insight.length > 0 ? insight : null),
    painPoints: toList(painMatch?.[1]),
    uxFlow: uxFlowMatch?.[1]?.trim() ?? null,
    uxVisual: uxVisualMatch?.[1]?.trim() ?? null,
    performanceIssues: toList(performanceIssuesMatch?.[1]),
    performanceSolutions: toList(performanceSolutionsMatch?.[1]),
    angle: angleMatch?.[1]?.trim() ?? null,
  };
}

const UNAVAILABLE_REASONS: Record<string, { title: string; desc: string; code: string }> = {
  timeout: {
    title: 'Waktu Analisis Habis (Timeout)',
    desc: 'Koneksi ke server Gemini/Website habis waktu (batas 30 detik terlampaui). Ini biasanya terjadi jika website lead lambat merespon.',
    code: 'ERR_AI_TIMEOUT_30S'
  },
  provider_error: {
    title: 'Gangguan API Gemini (Internal Server Error)',
    desc: 'Server AI Google mengembalikan respon error. Pastikan API key Anda valid, aktif, dan billing Google Cloud tidak ditangguhkan (misal: dunning deny).',
    code: 'ERR_GEMINI_PROVIDER_403_OR_500'
  },
  malformed_output: {
    title: 'Format Output Tidak Valid',
    desc: 'Model AI menghasilkan output teks yang tidak sesuai dengan struktur data aplikasi. Silakan jalankan ulang pemindaian.',
    code: 'ERR_AI_JSON_MALFORMED'
  },
  quota_exceeded: {
    title: 'Batas Kuota Terlampaui (Rate Limit)',
    desc: 'Limit panggilan API Gemini per menit atau per hari di Google AI Studio Anda telah habis. Harap tunggu beberapa saat sebelum mencoba lagi.',
    code: 'ERR_GEMINI_QUOTA_429'
  },
  budget_exceeded: {
    title: 'Anggaran Bulanan AI Habis',
    desc: 'Tim Anda telah melampaui batas anggaran panggilan AI bergulir (30-day rolling budget) yang dikonfigurasi di menu Settings.',
    code: 'ERR_TEAM_BUDGET_EXCEEDED'
  },
  api_key_missing: {
    title: 'Gemini API Key Belum Dikonfigurasi',
    desc: 'Kunci API Gemini tidak ditemukan untuk workspace tim Anda. Harap masuk ke halaman Settings -> AI Configuration untuk memasukkan kunci API.',
    code: 'ERR_GEMINI_API_KEY_MISSING'
  }
};

function PendingProgress() {
  const [progress, setProgress] = useState(10);
  const [currentStep, setCurrentStep] = useState('Menghubungkan ke profil Lead...');

  useEffect(() => {
    const steps = [
      { threshold: 25, text: 'Mengambil konten website & analisis elemen UX...' },
      { threshold: 55, text: 'Mengevaluasi UX visual & performa via Gemini 2.5 Flash Lite...' },
      { threshold: 80, text: 'Menghitung rating konversi & identifikasi pain points...' },
      { threshold: 95, text: 'Menyusun rekomendasi sales angle & pendekatan negosiasi...' }
    ];

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return 95;
        const next = prev + Math.floor(Math.random() * 8) + 3;
        
        // Update step text based on progress
        const activeStep = steps.find(s => next < s.threshold);
        if (activeStep) {
          setCurrentStep(activeStep.text);
        } else {
          setCurrentStep('Menyelesaikan analisis...');
        }
        
        return next;
      });
    }, 800);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="rounded-xl border border-[#d8e5ff] bg-alpha-primary-10 p-5 flex flex-col gap-4 shadow-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary-base">
          <Sparkles className="animate-spin text-primary-base" size={18} />
          <span className="text-sm font-semibold text-text-strong-950">Proses Analisis AI Sedang Berjalan</span>
        </div>
        <span className="text-xs font-bold text-primary-base bg-alpha-primary-10 px-2.5 py-0.5 rounded-full">{progress}%</span>
      </div>
      
      {/* Progress Bar */}
      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-primary-base to-[#007fb9] rounded-full transition-all duration-500 ease-out" 
          style={{ width: `${progress}%` }} 
        />
      </div>

      <p className="text-xs text-text-soft-400 font-medium italic animate-pulse">
        {currentStep}
      </p>
    </div>
  );
}

function AiAnalysisCard({ lead }: { lead: LeadListItem }) {
  const analysis = parseAiAnalysis(lead);
  const scoringBreakdown = lead.scoringBreakdown;
  const starRating = leadStarRating(lead);

  if (lead.aiState === 'pending') {
    return <PendingProgress />;
  }

  if (lead.aiState === 'unavailable') {
    const reasonKey = lead.aiUnavailableReason ?? 'provider_error';
    const reasonInfo = UNAVAILABLE_REASONS[reasonKey] ?? {
      title: 'Pemindaian AI Gagal',
      desc: 'Terjadi kesalahan sistem yang tidak diketahui saat menjalankan analisis AI.',
      code: `ERR_UNKNOWN_${reasonKey.toUpperCase()}`
    };

    return (
      <div className="rounded-xl border border-[#ffd5d8] bg-[#fff7f7] p-5 flex flex-col gap-3 shadow-none">
        <div className="flex flex-wrap items-center gap-2 text-[#b42318]">
          <span className="text-sm font-bold">{reasonInfo.title}</span>
          <Badge className="bg-[#ffd5d8] text-[#b42318] border-none text-[10px] font-mono px-2 py-0.5 rounded">
            {reasonInfo.code}
          </Badge>
        </div>
        <p className="text-sm text-text-sub-600 leading-relaxed">
          {reasonInfo.desc}
        </p>
        <p className="text-xs text-text-soft-400">
          Tip: Periksa halaman AI Settings untuk memverifikasi kunci API Anda atau coba jalankan ulang scan setelah beberapa saat.
        </p>
      </div>
    );
  }

  if (lead.aiState !== 'success') {
    return (
      <div className="space-y-4">
        {scoringBreakdown && (
          <div className="rounded-xl border border-stroke-soft-200 bg-bg-white-0 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-soft-400">Lead Score Summary</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-2xl font-bold text-text-strong-950">{scoringBreakdown.finalScore}</span>
                  <span className="text-sm text-text-soft-400">/100</span>
                  {(() => {
                    const band = leadBand(scoringBreakdown.finalScore);
                    return band ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LEAD_BAND_META[band].className}`}>
                        {LEAD_BAND_META[band].label}
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>
              <div className="text-sm text-text-sub-600 sm:text-right">
                <p>Base score {scoringBreakdown.baseScore}</p>
                <p>Modifier ×{scoringBreakdown.confidenceModifier.toFixed(2)}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {([
                'businessValueScore',
                'websiteNeedScore',
                'reachabilityScore',
                'confidenceScore',
              ] as const).map((key) => (
                <div key={key} className="rounded-ui border border-stroke-soft-200 bg-bg-subtle p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-soft-400">
                    {scoreDimensionLabel(key)}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-text-strong-950">
                    {scoringBreakdown[key]}
                    <span className="ml-1 text-xs font-normal text-text-soft-400">/100</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="rounded-xl border border-stroke-soft-200 bg-bg-weak-50 p-4">
          <p className="text-sm font-medium text-text-strong-950">Belum ada insight AI</p>
          <p className="mt-1 text-sm text-text-sub-600">
            Score deterministic sudah bisa dihitung terpisah. Jalankan generate AI insight untuk mendapatkan ringkasan, UX, performa, pain points, dan pendekatan sales.
          </p>
        </div>
      </div>
    );
  }

  const displayStarRating = starRating ?? analysis.starRating ?? 1;

  return (
    <div className="rounded-panel border border-stroke-soft-200 bg-bg-white-0 p-5 shadow-none flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stroke-soft-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-soft-400">Lead Rating</p>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex items-center gap-0.5 text-[#f6a609]">
              {[1, 2, 3, 4, 5].map((item) => (
                <Star
                  key={item}
                  size={16}
                  fill={item <= displayStarRating ? 'currentColor' : 'none'}
                  className={item <= displayStarRating ? '' : 'text-text-disabled-300'}
                />
              ))}
            </div>
            <span className="text-sm font-semibold text-text-strong-950">{displayStarRating}/5 Bintang</span>
          </div>
        </div>
        <div className="hidden sm:block h-8 w-[1px] bg-stroke-soft-200" />
        <div className="flex items-center justify-between sm:justify-end gap-3">
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-soft-400">Lead Score</p>
            <div className="flex items-baseline gap-0.5 justify-end">
              <span className="text-xl font-bold text-primary-accent">{deterministicLeadScore(lead) ?? '-'}</span>
              <span className="text-xs text-text-soft-400">/100</span>
            </div>
            {(() => {
              const band = leadBand(deterministicLeadScore(lead));
              return band ? (
                <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LEAD_BAND_META[band].className}`}>
                  {LEAD_BAND_META[band].label}
                </span>
              ) : null;
            })()}
          </div>
          {analysis.confidence !== null && (
            <div className="rounded-ui bg-bg-accent-soft border border-primary-accent/10 px-2.5 py-1 shrink-0">
              <p className="text-[11px] font-semibold text-primary-accent">{analysis.confidence}% confidence</p>
            </div>
          )}
        </div>
      </div>

      {scoringBreakdown && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([
            'businessValueScore',
            'websiteNeedScore',
            'reachabilityScore',
            'confidenceScore',
          ] as const).map((key) => (
            <div key={key} className="rounded-ui border border-stroke-soft-200 bg-bg-subtle p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-soft-400">{scoreDimensionLabel(key)}</p>
              <p className="mt-1 text-lg font-semibold text-text-strong-950">
                {scoringBreakdown[key]}
                <span className="ml-1 text-xs font-normal text-text-soft-400">/100</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {analysis.reason && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-soft-400">Alasan Utama</p>
          <p className="mt-1 text-sm leading-relaxed text-text-strong-950 font-medium">{analysis.reason}</p>
        </div>
      )}

      {analysis.painPoints.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-soft-400">Pain Points Teridentifikasi</p>
          <div className="mt-2 flex flex-col gap-2">
            {analysis.painPoints.map((item) => (
              <div key={item} className="flex items-start gap-2 text-sm text-text-sub-600">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#f79009]" />
                <span className="leading-tight">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Boolean(analysis.uxFlow ?? analysis.uxVisual) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {analysis.uxFlow && (
            <div className="rounded-ui border border-stroke-soft-200 bg-bg-subtle p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-soft-400 mb-1">UX Flow</p>
              <p className="text-sm leading-relaxed text-text-strong-950">{analysis.uxFlow}</p>
            </div>
          )}
          {analysis.uxVisual && (
            <div className="rounded-ui border border-stroke-soft-200 bg-bg-subtle p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-soft-400 mb-1">UX Visual</p>
              <p className="text-sm leading-relaxed text-text-strong-950">{analysis.uxVisual}</p>
            </div>
          )}
        </div>
      )}

      {(analysis.performanceIssues.length > 0 || analysis.performanceSolutions.length > 0) && (
        <div className="rounded-ui border border-stroke-soft-200 bg-bg-weak-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-sub-600 mb-2">Analisa Performa</p>
          {analysis.performanceIssues.length > 0 && (
            <div className="mt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-soft-400">Issue</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-sm leading-relaxed text-text-strong-950">
                {analysis.performanceIssues.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {analysis.performanceSolutions.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-soft-400">Solusi</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-sm leading-relaxed text-text-strong-950">
                {analysis.performanceSolutions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {analysis.angle && (
        <div className="rounded-ui bg-bg-accent-soft border-l-[3px] border-primary-base p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-accent mb-1.5 flex items-center gap-1.5">
            <Sparkles size={13} className="text-primary-accent" />
            Recommended Sales Angle
          </p>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-strong-950 font-medium">
            {analysis.angle}
          </p>
        </div>
      )}
    </div>
  );
}

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const { data: sessionData, isLoading: isSessionLoading } = useSession();
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [ratingFilter, setRatingFilter] = useState('All');
  const [websiteFilter, setWebsiteFilter] = useState('All');
  const [aiStatusFilter, setAiStatusFilter] = useState('All');
  const [whatsappVerificationFilter, setWhatsappVerificationFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [selectedLead, setSelectedLead] = useState<LeadListItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [draftStatus, setDraftStatus] = useState<LeadStatus | null>(null);
  const [draftWhatsAppStatus, setDraftWhatsAppStatus] = useState<WhatsAppVerificationStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const teamId = sessionData?.session.teamId;

  // Query Leads
  const { data: leadsData, isLoading: isLeadsLoading, error } = useQuery({
    queryKey: ['leads', teamId, search, statusFilter, ratingFilter, websiteFilter, aiStatusFilter, whatsappVerificationFilter, dateFrom, dateTo, page, pageSize],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter !== 'All') params.append('status', statusFilter);
      if (ratingFilter !== 'All') params.append('rating', ratingFilter);
      if (websiteFilter !== 'All') params.append('website', websiteFilter);
      if (aiStatusFilter !== 'All') params.append('aiStatus', aiStatusFilter);
      if (whatsappVerificationFilter !== 'All') params.append('whatsappVerification', whatsappVerificationFilter);
      if (dateFrom) params.append('start', new Date(`${dateFrom}T00:00:00.000Z`).toISOString());
      if (dateTo) params.append('end', new Date(`${dateTo}T23:59:59.999Z`).toISOString());
      params.append('page', page.toString());
      params.append('pageSize', pageSize.toString());
      return fetchApi<PageResponse<LeadListItem>>(`/api/teams/${teamId}/leads?${params.toString()}`);
    },
    enabled: !!teamId,
    refetchInterval: selectedLead?.aiState === 'pending' ? 2000 : false,
  });

  useEffect(() => {
    if (!selectedLead || !leadsData?.items) return;
    const updatedLead = leadsData.items.find((item) => item.id === selectedLead.id);
    if (updatedLead) {
      setSelectedLead(updatedLead);
    }
  }, [leadsData?.items, selectedLead?.id]);

  // Mutate Status
  const statusMutation = useMutation({
    mutationFn: (newStatus: string) => {
      if (!teamId || !selectedLead) throw new Error('No lead selected');
      return fetchApi(`/api/teams/${teamId}/leads/${selectedLead.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads', teamId] });
      setSelectedLead((prev) => prev ? { ...prev, status: statusMutation.variables as LeadStatus } : prev);
    }
  });


  const whatsappVerificationMutation = useMutation({
    mutationFn: ({ leadId, status }: { leadId: string; status: WhatsAppVerificationStatus }) => {
      if (!teamId) throw new Error('No active team');
      return fetchApi<LeadListItem>(`/api/teams/${teamId}/leads/${leadId}/whatsapp-verification`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: (updatedLead, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['leads', teamId] });
      setSelectedLead((prev) => prev && prev.id === variables.leadId ? updatedLead : prev);
      toast.success(
        variables.status === 'registered'
          ? 'WhatsApp ditandai terdaftar.'
          : variables.status === 'not_registered'
            ? 'WhatsApp ditandai tidak terdaftar.'
            : 'Status verifikasi WhatsApp direset.',
      );
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : '[LEAD_WHATSAPP_VERIFICATION_FAILED] Gagal memperbarui status verifikasi WhatsApp.');
    }
  });

  // Mutate Notes
  const noteMutation = useMutation({
    mutationFn: (body: string) => {
      if (!teamId || !selectedLead) throw new Error('No lead selected');
      return fetchApi(`/api/teams/${teamId}/leads/${selectedLead.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads', teamId] });
    }
  });

  // Mutate AI Reanalyze
  const recomputeScoreMutation = useMutation({
    mutationFn: () => {
      if (!teamId || !selectedLead) throw new Error('No lead selected');
      return fetchApi<{ leadId: string; scoringState: 'completed' }>(
        `/api/teams/${teamId}/ai/leads/${selectedLead.id}/recompute-score`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads', teamId] });
      toast.success('Score deterministic berhasil dihitung ulang.');
    },
    onError: (err: unknown) => {
      toast.error(
        err instanceof Error
          ? err.message
          : '[LEAD_SCORE_RECOMPUTE_FAILED] Gagal menghitung ulang score lead.',
      );
    },
  });

  const regenerateAiInsightMutation = useMutation({
    mutationFn: () => {
      if (!teamId || !selectedLead) throw new Error('No lead selected');
      return fetchApi<{ leadId: string; aiState: LeadListItem['aiState'] }>(
        `/api/teams/${teamId}/ai/leads/${selectedLead.id}/regenerate-ai-insight`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      );
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['leads', teamId] });
      setSelectedLead((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        delete next.aiInsight;
        delete next.aiUnavailableReason;
        return {
          ...next,
          aiState: data.aiState,
          aiIntentScore: null,
        };
      });
      toast.success('Generate AI insight telah masuk antrean.');
    },
    onError: (err: unknown) => {
      toast.error(
        err instanceof Error
          ? err.message
          : '[LEAD_AI_INSIGHT_REGENERATE_FAILED] Gagal memulai generate AI insight.',
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (leadId: string) => {
      if (!teamId) throw new Error('No active team');
      return fetchApi(`/api/teams/${teamId}/leads/${leadId}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmed: true }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads', teamId] });
    },
  });

  if (isSessionLoading) {
    return (
      <div className="flex w-full flex-col gap-5 pb-12">
        <PageHeaderSkeleton />
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-2 h-4 w-64" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:flex">
              <Skeleton className="h-10 w-full sm:w-24" />
              <Skeleton className="h-10 w-full sm:w-28" />
            </div>
          </div>
          <div className="rounded-2xl border border-stroke-soft-200 bg-white p-4 shadow-none">
            <Skeleton className="h-10 w-full" />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-white p-3 shadow-none sm:p-4">
            <AlignLeadTable leads={[]} isLoading />
          </div>
        </div>
      </div>
    );
  }
  if (!teamId) return <div className="p-4">Error: No active team session.</div>;

  const formatDate = (value: Date | string | undefined) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  };

  const tableLeads: AlignLead[] = (leadsData?.items ?? []).map((lead) => {
    const whatsappNumber = typeof lead.whatsappNumber === 'string' ? lead.whatsappNumber : null;

    return {
      id: lead.id,
      name: lead.name ?? 'Unknown',
      contact: lead.publicContact ?? 'No contact',
      whatsappUrl: whatsappTargetFor(lead),
      whatsappNumber,
      whatsappVerificationStatus: lead.whatsappVerificationStatus,
      location: lead.location ?? 'Unknown location',
      niche: lead.matchedKeywords.join(', ') || 'General',
      dateFound: formatDate(lead.discoveredAt ?? lead.createdAt),
      sourceLabel: sourceLabelFor(lead),
      sourceUrl: sourceUrlFor(lead),
      websiteStatus: websiteStatusFor(lead),
      status: lead.status,
      score: deterministicLeadScore(lead),
    };
  });

  const buildLeadParams = (exportAll = false) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (statusFilter !== 'All') params.append('status', statusFilter);
    if (ratingFilter !== 'All') params.append('rating', ratingFilter);
    if (websiteFilter !== 'All') params.append('website', websiteFilter);
    if (aiStatusFilter !== 'All') params.append('aiStatus', aiStatusFilter);
    if (whatsappVerificationFilter !== 'All') params.append('whatsappVerification', whatsappVerificationFilter);
    if (dateFrom) params.append('start', new Date(`${dateFrom}T00:00:00.000Z`).toISOString());
    if (dateTo) params.append('end', new Date(`${dateTo}T23:59:59.999Z`).toISOString());
    params.append('page', exportAll ? '0' : page.toString());
    params.append('pageSize', exportAll ? String(Math.max(leadsData?.total ?? 1000, pageSize)) : pageSize.toString());
    return params;
  };

  const exportToExcel = async () => {
    if (!teamId || isExporting) return;

    setIsExporting(true);
    try {
      const params = buildLeadParams(true);
      const exportData = await fetchApi<PageResponse<LeadListItem>>(`/api/teams/${teamId}/leads?${params.toString()}`);
          const rows = exportData.items.map((lead) => [
            lead.name ?? 'Unknown',
            lead.publicContact ?? 'No contact',
            lead.location ?? 'Unknown location',
            lead.matchedKeywords.join(', ') || 'General',
            formatDate(lead.discoveredAt ?? lead.createdAt),
            sourceLabelFor(lead),
            websiteStatusLabelFor(lead),
            lead.status,
            deterministicLeadScore(lead) ?? '',
          ]);

      const headers = ['Lead Name', 'Contact', 'Location', 'Niche', 'Date Found', 'Source', 'Website', 'Status', 'Lead Score'];
      const worksheet = `
        <html>
          <head><meta charset="utf-8" /></head>
          <body>
            <table>
              <thead>
                <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${rows
                  .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
                  .join('')}
              </tbody>
            </table>
          </body>
        </html>
      `;
      const blob = new Blob([worksheet], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `leads-export-${new Date().toISOString().slice(0, 10)}.xls`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export leads', error);
      window.alert(error instanceof Error ? error.message : '[LEADS_EXPORT_FAILED] Failed to export leads. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const openLead = (leadId: string) => {
    const lead = leadsData?.items.find((item) => item.id === leadId);
    if (!lead) return;
    setSelectedLead(lead);
    setNewNote('');
    setDraftStatus(lead.status);
    setDraftWhatsAppStatus(lead.whatsappVerificationStatus || 'unchecked');
    setIsModalOpen(true);
  };

  const handleSaveChanges = async () => {
    if (!selectedLead) return;
    setIsSaving(true);
    const promises = [];
    
    try {
      if (draftStatus && draftStatus !== selectedLead.status) {
        promises.push(statusMutation.mutateAsync(draftStatus));
      }
      
      if (draftWhatsAppStatus && draftWhatsAppStatus !== (selectedLead.whatsappVerificationStatus || 'unchecked')) {
        promises.push(whatsappVerificationMutation.mutateAsync({ leadId: selectedLead.id, status: draftWhatsAppStatus }));
      }
      
      if (newNote.trim()) {
        promises.push(noteMutation.mutateAsync(newNote));
      }
      
      if (promises.length > 0) {
        await Promise.all(promises);
        toast.success('Changes saved successfully');
      }
      
      setNewNote('');
      setIsModalOpen(false);
    } catch {
      // Errors are already handled by toast in the mutation callbacks
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-5 pb-12">


      {/* Sub Header & Actions */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-text-strong-950">Acquired Leads</h2>
            <p className="text-sm text-text-soft-400">Display all scraped leads and their details.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:shrink-0 sm:items-center">
            <Button variant="secondary" leftIcon={<Download size={16} />} onClick={exportToExcel} disabled={isExporting} className="w-full sm:w-auto">
              {isExporting ? 'Exporting...' : 'Export'}
            </Button>
            <Button variant="primary" leftIcon={<Plus size={16} />} className="w-full sm:w-auto">
              New Lead
            </Button>
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl border border-stroke-soft-200 bg-white p-4 shadow-none sm:grid-cols-2 xl:grid-cols-6">
          <Select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(0);
            }}
            options={[
              { label: 'All statuses', value: 'All' },
              { label: 'New', value: 'New' },
              { label: 'Reviewed', value: 'Reviewed' },
              { label: 'Contacted', value: 'Contacted' },
              { label: 'Qualified', value: 'Qualified' },
              { label: 'Converted', value: 'Converted' },
              { label: 'Rejected', value: 'Rejected' },
            ]}
          />
          <Select
            value={ratingFilter}
            onChange={(event) => {
              setRatingFilter(event.target.value);
              setPage(0);
            }}
            options={[
              { label: 'All ratings', value: 'All' },
              { label: '5 stars', value: '5' },
              { label: '4 stars', value: '4' },
              { label: '3 stars', value: '3' },
              { label: '2 stars', value: '2' },
              { label: '1 star', value: '1' },
            ]}
          />
          <Select
            value={websiteFilter}
            onChange={(event) => {
              setWebsiteFilter(event.target.value);
              setPage(0);
            }}
            options={[
              { label: 'All websites', value: 'All' },
              { label: 'Have website', value: 'have_website' },
              { label: "Don't have website", value: 'no_website' },
            ]}
          />
          <Select
            value={aiStatusFilter}
            onChange={(event) => {
              setAiStatusFilter(event.target.value);
              setPage(0);
            }}
            options={[
              { label: 'All AI statuses', value: 'All' },
              { label: 'Not analyzed', value: 'none' },
              { label: 'Pending', value: 'pending' },
              { label: 'Success', value: 'success' },
              { label: 'Unavailable', value: 'unavailable' },
            ]}
          />
          <Select
            value={whatsappVerificationFilter}
            onChange={(event) => {
              setWhatsappVerificationFilter(event.target.value);
              setPage(0);
            }}
            options={[
              { label: 'All WA statuses', value: 'All' },
              { label: 'Unchecked', value: 'unchecked' },
              { label: 'Registered', value: 'registered' },
              { label: 'Not registered', value: 'not_registered' },
            ]}
          />
          <DatePicker

            value={dateFrom}
            placeholder="Start date"
            onChange={(nextValue) => {
              setDateFrom(nextValue);
              setPage(0);
            }}
          />
          <DatePicker
            value={dateTo}
            placeholder="End date"
            onChange={(nextValue) => {
              setDateTo(nextValue);
              setPage(0);
            }}
          />
        </div>

        {/* Table Area */}
        <div className="mt-2 flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:max-w-[320px]">
              <Input
                placeholder="Search leads..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                leftIcon={<Search size={16} />}
                rightIcon={<span className="rounded border border-[#e2e4e9] bg-bg-weak-50 px-1.5 py-0.5 text-[10px] font-medium text-text-soft-400">⌘1</span>}
              />
            </div>
            <Select
              value={String(pageSize)}
              wrapperClassName="w-full sm:w-[124px]"
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
              options={[
                { label: '10', value: '10' },
                { label: '15', value: '15' },
                { label: '20', value: '20' },
              ]}
            />
          </div>
          <AlignLeadTable
            leads={tableLeads}
            isLoading={isLeadsLoading}
            error={error ? 'Failed to load leads' : undefined}
            onOpenLead={openLead}
            onOpenWhatsApp={(leadId) => {
              const lead = leadsData?.items.find((item) => item.id === leadId);
              if (!lead) return;
              const whatsappTarget = whatsappTargetFor(lead);
              if (!whatsappTarget) return;
              window.open(whatsappTarget, '_blank', 'noopener,noreferrer');
            }}
            onSetWhatsappVerification={(leadId, status) => {
              whatsappVerificationMutation.mutate({ leadId, status });
            }}
            onDeleteLead={(leadId) => {
              if (window.confirm('Delete this lead?')) {
                deleteMutation.mutate(leadId);
              }
            }}
          />
          {!error && !isLeadsLoading && (
              <div className="mt-4 px-1">
                <Pagination 
                  currentPage={page + 1} 
                  totalPages={Math.max(1, Math.ceil((leadsData?.total ?? 0) / (leadsData?.pageSize ?? 25)))}
                  onPageChange={(p) => setPage(p - 1)}
                  totalItems={leadsData?.total ?? 0}
                />
              </div>
          )}
        </div>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title="Lead Details"
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Close</Button>
            <Button 
              onClick={handleSaveChanges} 
              disabled={(!newNote.trim() && draftStatus === selectedLead?.status && draftWhatsAppStatus === (selectedLead?.whatsappVerificationStatus || 'unchecked')) || isSaving} 
              loading={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </>
        }
      >
        {selectedLead && (
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left Column - Business Info & Settings */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold text-text-soft-400 uppercase tracking-wider mb-1">Name</p>
                  <p className="text-text-strong-950 font-bold text-lg">{selectedLead.name ?? 'Unknown'}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold text-text-soft-400 uppercase tracking-wider mb-1.5">Contact Info</p>
                  <div className="rounded-ui border border-stroke-soft-200 p-4 bg-bg-subtle flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-text-strong-950 font-bold text-base">{selectedLead.publicContact ?? 'N/A'}</p>
                        {(() => {
                          const whatsappTarget = whatsappTargetFor(selectedLead);
                          if (!whatsappTarget) return null;

                          return (
                            <a href={whatsappTarget} target="_blank" rel="noreferrer" className="mt-1 inline-block text-primary-base hover:underline text-xs font-medium break-all">
                              WhatsApp Link: {typeof selectedLead.whatsappNumber === 'string' ? selectedLead.whatsappNumber : whatsappTarget}
                            </a>
                          );
                        })()}
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        className="bg-[#22c55e] hover:bg-[#16a34a] border-[#22c55e] text-white shrink-0 shadow-sm disabled:border-stroke-soft-200 disabled:bg-bg-weak-50 disabled:text-text-disabled-300"
                        onClick={() => {
                          const whatsappTarget = whatsappTargetFor(selectedLead);
                          if (!whatsappTarget) return;
                          window.open(whatsappTarget, '_blank', 'noopener,noreferrer');
                        }}
                        disabled={!whatsappTargetFor(selectedLead)}
                      >
                        Open WhatsApp
                      </Button>
                    </div>
                    
                    <div className="border-t border-stroke-soft-200/60 pt-3">
                      <p className="text-xs font-semibold text-text-soft-400 mb-2">WhatsApp Verification Status</p>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                        <Radio 
                          name="wa-status" 
                          label="Unchecked" 
                          value="unchecked" 
                          checked={!draftWhatsAppStatus || draftWhatsAppStatus === 'unchecked'} 
                          onChange={(e) => {
                            if (e.target.checked) setDraftWhatsAppStatus('unchecked');
                          }} 
                        />
                        <Radio 
                          name="wa-status" 
                          label="Registered" 
                          value="registered" 
                          checked={draftWhatsAppStatus === 'registered'} 
                          onChange={(e) => {
                            if (e.target.checked) setDraftWhatsAppStatus('registered');
                          }} 
                        />
                        <Radio 
                          name="wa-status" 
                          label="Not Registered" 
                          value="not_registered" 
                          checked={draftWhatsAppStatus === 'not_registered'} 
                          onChange={(e) => {
                            if (e.target.checked) setDraftWhatsAppStatus('not_registered');
                          }} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="sm:col-span-1">
                  <p className="text-xs font-semibold text-text-soft-400 uppercase tracking-wider mb-1">Niche / Keywords</p>
                  <p className="text-text-strong-950 font-medium text-sm">{selectedLead.matchedKeywords?.join(', ') || 'N/A'}</p>
                </div>
                <div className="sm:col-span-1">
                  <p className="text-xs font-semibold text-text-soft-400 uppercase tracking-wider mb-1">Website</p>
                  {websiteUrlFor(selectedLead) ? (
                    <a href={websiteUrlFor(selectedLead) ?? undefined} target="_blank" rel="noreferrer" className="text-primary-base hover:underline font-medium break-all text-sm">
                      {websiteUrlFor(selectedLead)}
                    </a>
                  ) : (
                    <p className="font-semibold text-state-danger-base text-sm">No business website detected</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold text-text-soft-400 uppercase tracking-wider mb-1">Location</p>
                  <p className="text-text-strong-950 font-medium text-sm leading-relaxed">{selectedLead.location ?? 'N/A'}</p>
                </div>
                <div className="sm:col-span-1">
                  <p className="text-xs font-semibold text-text-soft-400 uppercase tracking-wider mb-1">AI State</p>
                  <div className="mt-1">
                    <Badge variant={selectedLead.aiState === 'success' ? 'success' : selectedLead.aiState === 'pending' ? 'neutral' : 'error'} badgeStyle="light">
                      {selectedLead.aiState}
                    </Badge>
                  </div>
                </div>
                <div className="sm:col-span-1">
                  <p className="text-xs font-semibold text-text-soft-400 uppercase tracking-wider mb-1">Lead Score</p>
                  <p className="text-text-strong-950 font-semibold text-sm">
                    {deterministicLeadScore(selectedLead) ?? '-'}
                    <span className="ml-1 text-xs font-normal text-text-soft-400">/100</span>
                  </p>
                </div>
              </div>

              <div className="border-t border-stroke-soft-200 pt-4">
                <p className="text-xs font-semibold text-text-soft-400 uppercase tracking-wider mb-2">Change Status</p>
                <Select 
                  value={draftStatus ?? selectedLead.status}
                  onChange={(e) => setDraftStatus(e.target.value as LeadStatus)}
                  disabled={isSaving}
                  options={[
                    { label: 'New', value: 'New' },
                    { label: 'Reviewed', value: 'Reviewed' },
                    { label: 'Contacted', value: 'Contacted' },
                    { label: 'Qualified', value: 'Qualified' },
                    { label: 'Converted', value: 'Converted' },
                    { label: 'Rejected', value: 'Rejected' },
                  ]}
                />
              </div>

              <div className="border-t border-stroke-soft-200 pt-4">
                <p className="text-xs font-semibold text-text-soft-400 uppercase tracking-wider mb-2">Add Note</p>
                <Textarea 
                  placeholder="Enter details about this lead..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            {/* Right Column - AI Analysis & Action */}
            <div className="lg:col-span-7 flex flex-col gap-5 border-t lg:border-t-0 lg:border-l border-stroke-soft-200 pt-5 lg:pt-0 lg:pl-6">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-text-soft-400 uppercase tracking-wider">Lead Score & AI Insight</p>
                  {selectedLead.aiAnalyzedAt && (
                    <p className="text-xs text-text-soft-400">
                      Updated {formatDate(selectedLead.aiAnalyzedAt)}
                    </p>
                  )}
                </div>
                <AiAnalysisCard lead={selectedLead} />
              </div>

              <div className="border-t border-stroke-soft-200 pt-4">
                  <p className="text-xs font-semibold text-text-soft-400 uppercase tracking-wider mb-2">Lead Scoring & Insight Actions</p>

                <div className="rounded-ui border border-primary-accent/10 bg-bg-accent-soft p-4">
                  <p className="text-sm text-primary-accent font-medium">
                    Hitung score deterministic dan generate insight AI secara terpisah.
                  </p>
                  {selectedLead.scoringBreakdown && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border border-stroke-soft-200 bg-white/80 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wider text-text-soft-400">Final</p>
                        <p className="text-sm font-semibold text-text-strong-950">{selectedLead.scoringBreakdown.finalScore}/100</p>
                      </div>
                      <div className="rounded-lg border border-stroke-soft-200 bg-white/80 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wider text-text-soft-400">Base</p>
                        <p className="text-sm font-semibold text-text-strong-950">{selectedLead.scoringBreakdown.baseScore}/100</p>
                      </div>
                      <div className="rounded-lg border border-stroke-soft-200 bg-white/80 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wider text-text-soft-400">Modifier</p>
                        <p className="text-sm font-semibold text-text-strong-950">×{selectedLead.scoringBreakdown.confidenceModifier.toFixed(2)}</p>
                      </div>
                    </div>
                  )}
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <Button
                      variant="secondary"
                      className="sm:flex-1"
                      leftIcon={<RefreshCcw size={15} />}
                      onClick={() => recomputeScoreMutation.mutate()}
                      loading={recomputeScoreMutation.isPending}
                    >
                      {recomputeScoreMutation.isPending ? 'Recomputing...' : 'Recompute Score'}
                    </Button>
                    <Button
                      className="sm:flex-1"
                      leftIcon={<Sparkles size={15} />}
                      onClick={() => regenerateAiInsightMutation.mutate()}
                      loading={regenerateAiInsightMutation.isPending}
                      disabled={selectedLead.aiState === 'pending'}
                    >
                      {regenerateAiInsightMutation.isPending ? 'Queueing Insight...' : 'Generate AI Insight'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
