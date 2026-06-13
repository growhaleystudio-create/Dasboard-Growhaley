'use client';

import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/useSession';
import { fetchApi } from '@/lib/api';
import { sourceLabelFor, sourceUrlFor, websiteStatusFor } from '@/lib/leadDisplay';
import { AlignLeadTable, type AlignLead } from '@/components/leads/AlignLeadTable';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { toast } from 'sonner';
import { Pagination } from '@/components/ui/Pagination';
import { PageHeaderSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { Download, Plus, Search, Sparkles, Star } from 'lucide-react';
import type { LeadStatus } from '@leads-generator/shared';
import type { LeadListItem, PageResponse } from '@/lib/types';

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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
    <div className="rounded-xl border border-[#d8e5ff] bg-alpha-primary-10 p-5 flex flex-col gap-4 shadow-sm">
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
      <div className="rounded-xl border border-[#ffd5d8] bg-[#fff7f7] p-5 flex flex-col gap-3 shadow-sm">
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

  if (lead.aiState !== 'success' || analysis.starRating === null) {
    return (
      <div className="rounded-xl border border-stroke-soft-200 bg-bg-weak-50 p-4">
        <p className="text-sm font-medium text-text-strong-950">Belum ada analisis AI</p>
        <p className="mt-1 text-sm text-text-sub-600">
          Jalankan AI scoring untuk menghasilkan potensi konversi, UX, performa, pain points, dan pendekatan sales.
        </p>
      </div>
    );
  }

  const starRating = analysis.starRating;

  return (
    <div className="rounded-xl border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-soft-400">Potensi Konversi</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex items-center gap-0.5 text-[#f6a609]">
              {[1, 2, 3, 4, 5].map((item) => (
                <Star
                  key={item}
                  size={18}
                  fill={item <= starRating ? 'currentColor' : 'none'}
                  className={item <= starRating ? '' : 'text-text-disabled-300'}
                />
              ))}
            </div>
            <span className="text-sm font-medium text-text-strong-950">{starRating}/5 Bintang</span>
          </div>
        </div>
        <div className="rounded-lg bg-alpha-primary-10 px-3 py-2 text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-primary-base">AI Score</p>
          <p className="text-lg font-semibold text-primary-base">{lead.aiIntentScore}/100</p>
          {analysis.confidence !== null && (
            <p className="text-xs text-text-sub-600">{analysis.confidence}% confidence</p>
          )}
        </div>
      </div>

      {analysis.reason && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-soft-400">Alasan Utama</p>
          <p className="mt-1 text-sm leading-5 text-text-strong-950">{analysis.reason}</p>
        </div>
      )}

      {analysis.painPoints.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-soft-400">Pain Points Teridentifikasi</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {analysis.painPoints.map((item) => (
              <span key={item} className="rounded-full border border-stroke-soft-200 bg-bg-weak-50 px-2.5 py-1 text-xs font-medium text-text-sub-600">
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {Boolean(analysis.uxFlow ?? analysis.uxVisual) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {analysis.uxFlow && (
            <div className="rounded-lg border border-stroke-soft-200 bg-bg-white-0 p-3">
              <p className="text-xs font-medium uppercase tracking-wider text-text-soft-400">UX Flow</p>
              <p className="mt-1 text-sm leading-5 text-text-strong-950">{analysis.uxFlow}</p>
            </div>
          )}
          {analysis.uxVisual && (
            <div className="rounded-lg border border-stroke-soft-200 bg-bg-white-0 p-3">
              <p className="text-xs font-medium uppercase tracking-wider text-text-soft-400">UX Visual</p>
              <p className="mt-1 text-sm leading-5 text-text-strong-950">{analysis.uxVisual}</p>
            </div>
          )}
        </div>
      )}

      {(analysis.performanceIssues.length > 0 || analysis.performanceSolutions.length > 0) && (
        <div className="mt-4 rounded-lg border border-stroke-soft-200 bg-bg-weak-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-text-soft-400">Analisa Performa</p>
          {analysis.performanceIssues.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-text-sub-600">Issue</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-sm leading-5 text-text-strong-950">
                {analysis.performanceIssues.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {analysis.performanceSolutions.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-text-sub-600">Solusi</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-sm leading-5 text-text-strong-950">
                {analysis.performanceSolutions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {analysis.angle && (
        <div className="mt-4 rounded-lg bg-bg-weak-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-text-soft-400">Recommended Sales Angle</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-text-strong-950">{analysis.angle}</p>
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
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [selectedLead, setSelectedLead] = useState<LeadListItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const teamId = sessionData?.session.teamId;

  // Query Leads
  const { data: leadsData, isLoading: isLeadsLoading, error } = useQuery({
    queryKey: ['leads', teamId, search, statusFilter, ratingFilter, websiteFilter, aiStatusFilter, dateFrom, dateTo, page, pageSize],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter !== 'All') params.append('status', statusFilter);
      if (ratingFilter !== 'All') params.append('rating', ratingFilter);
      if (websiteFilter !== 'All') params.append('website', websiteFilter);
      if (aiStatusFilter !== 'All') params.append('aiStatus', aiStatusFilter);
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
      setNewNote('');
      setIsModalOpen(false);
    }
  });

  // Mutate AI Reanalyze
  const aiReanalyzeMutation = useMutation({
    mutationFn: () => {
      if (!teamId || !selectedLead) throw new Error('No lead selected');
      return fetchApi<{ leadId: string; aiState: LeadListItem['aiState'] }>(`/api/teams/${teamId}/ai/leads/${selectedLead.id}/reanalyze`, {
        method: 'POST',
        body: JSON.stringify({})
      });
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
      toast.success('Pekerjaan analisis AI telah antre di latar belakang!');
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : '[LEAD_AI_REANALYZE_FAILED] Gagal memulai analisis AI. Silakan hubungi admin.');
    }
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
          <div className="rounded-2xl border border-stroke-soft-200 bg-white p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
            <Skeleton className="h-10 w-full" />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-white p-3 shadow-[0px_1px_2px_rgba(10,13,20,0.03)] sm:p-4">
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

  const tableLeads: AlignLead[] = (leadsData?.items ?? []).map((lead) => ({
    id: lead.id,
    name: lead.name ?? 'Unknown',
    contact: lead.publicContact ?? 'No contact',
    location: lead.location ?? 'Unknown location',
    niche: lead.matchedKeywords.join(', ') || 'General',
    dateFound: formatDate(lead.discoveredAt ?? lead.createdAt),
    sourceLabel: sourceLabelFor(lead),
    sourceUrl: sourceUrlFor(lead),
    websiteStatus: websiteStatusFor(lead),
    status: lead.status,
    score: lead.aiIntentScore ?? lead.score,
  }));

  const buildLeadParams = (exportAll = false) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (statusFilter !== 'All') params.append('status', statusFilter);
    if (ratingFilter !== 'All') params.append('rating', ratingFilter);
    if (websiteFilter !== 'All') params.append('website', websiteFilter);
    if (aiStatusFilter !== 'All') params.append('aiStatus', aiStatusFilter);
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
        websiteStatusFor(lead),
        lead.status,
        lead.aiIntentScore ?? lead.score ?? '',
      ]);
      const headers = ['Lead Name', 'Contact', 'Location', 'Niche', 'Date Found', 'Source', 'Website', 'Status', 'AI Score'];
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
    setIsModalOpen(true);
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

        <div className="grid gap-3 rounded-2xl border border-stroke-soft-200 bg-white p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)] sm:grid-cols-2 xl:grid-cols-6">
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
        <div className="mt-2 overflow-hidden rounded-2xl border border-stroke-soft-200 bg-white shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
          <div className="flex flex-col gap-3 border-b border-stroke-soft-200 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
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
          <div className="p-3 sm:p-4">
          <AlignLeadTable
            leads={tableLeads}
            isLoading={isLeadsLoading}
            error={error ? 'Failed to load leads' : undefined}
            onOpenLead={openLead}
            onDeleteLead={(leadId) => {
              if (window.confirm('Delete this lead?')) {
                deleteMutation.mutate(leadId);
              }
            }}
          />
          </div>
          {!error && !isLeadsLoading && (
              <div className="border-t border-stroke-soft-200 px-1 py-4 sm:px-6">
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
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Close</Button>
            <Button onClick={() => noteMutation.mutate(newNote)} disabled={!newNote.trim() || noteMutation.isPending}>
              {noteMutation.isPending ? 'Saving...' : 'Save Note'}
            </Button>
          </>
        }
      >
        {selectedLead && (
          <div className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-text-soft-400 uppercase tracking-wider mb-1">Name</p>
                <p className="text-text-strong-950 font-medium">{selectedLead.name ?? 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-soft-400 uppercase tracking-wider mb-1">Contact Info</p>
                <p className="text-text-strong-950 font-medium">{selectedLead.publicContact ?? 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-soft-400 uppercase tracking-wider mb-1">Location</p>
                <p className="text-text-strong-950 font-medium">{selectedLead.location ?? 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-soft-400 uppercase tracking-wider mb-1">AI State</p>
                <p className="text-text-strong-950 font-medium capitalize">{selectedLead.aiState}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-soft-400 uppercase tracking-wider mb-1">Niche / Keywords</p>
                <p className="text-text-strong-950 font-medium">{selectedLead.matchedKeywords?.join(', ') || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-soft-400 uppercase tracking-wider mb-1">Website</p>
                {websiteStatusFor(selectedLead) === 'have website' && selectedLead.profileUrl ? (
                  <a href={selectedLead.profileUrl} target="_blank" rel="noreferrer" className="text-primary-base hover:underline break-all">
                    {selectedLead.profileUrl}
                  </a>
                ) : (
                  <p className="font-medium text-[#f97316]">Belum punya website bisnis</p>
                )}
              </div>
            </div>

            <div className="border-t border-stroke-soft-200 pt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-text-soft-400 uppercase tracking-wider">AI Potential Analysis</p>
                {selectedLead.aiAnalyzedAt && (
                  <p className="text-xs text-text-soft-400">
                    Updated {formatDate(selectedLead.aiAnalyzedAt)}
                  </p>
                )}
              </div>
              <AiAnalysisCard lead={selectedLead} />
            </div>

            <div className="border-t border-stroke-soft-200 pt-4">
              <p className="text-xs font-medium text-text-soft-400 uppercase tracking-wider mb-2">Change Status</p>
              <Select 
                value={selectedLead.status}
                onChange={(e) => statusMutation.mutate(e.target.value)}
                disabled={statusMutation.isPending}
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
              <p className="text-xs font-medium text-text-soft-400 uppercase tracking-wider mb-2">Add Note</p>
              <Textarea 
                placeholder="Enter details about this lead..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
            </div>

            <div className="border-t border-stroke-soft-200 pt-4">
              <p className="text-xs font-medium text-text-soft-400 uppercase tracking-wider mb-2">AI Analyzer</p>
              <div className="bg-alpha-primary-10 p-4 rounded-xl flex items-center justify-between">
                <p className="text-sm text-primary-base font-medium">
                  {selectedLead.aiState === 'success' ? 'Re-analyze this lead for fresh insights' : 'Analyze this lead using AI'}
                </p>
                <Button 
                  size="sm" 
                  onClick={() => aiReanalyzeMutation.mutate()} 
                  disabled={aiReanalyzeMutation.isPending}
                >
                  {aiReanalyzeMutation.isPending ? 'Analyzing...' : 'Run AI Scan'}
                </Button>
              </div>
            </div>

          </div>
        )}
      </Modal>
    </div>
  );
}
