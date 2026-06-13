'use client';

import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/useSession';
import { fetchApi } from '@/lib/api';
import { Table, TableHead, TableHeader, TableRow, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { toast } from 'sonner';
import type { CreateScanResponse, ScanConfigurationListItem } from '@/lib/types';

interface ScanRunSummary {
  newLeads: number;
  duplicateLeads: number;
  connectorResults: {
    sourceId: string;
    outcome: string;
    itemsFetched: number;
    error?: string;
  }[];
}

export default function ScansPage() {
  const queryClient = useQueryClient();
  const { data: sessionData, isLoading: isSessionLoading } = useSession();
  const teamId = sessionData?.session.teamId;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newScanForm, setNewScanForm] = useState({
    source: 'google',
    keywords: '',
    location: '',
    schedule: 'Run Now'
  });
  const [scanProgress, setScanProgress] = useState(0);
  const [isScanProgressVisible, setIsScanProgressVisible] = useState(false);
  const [scanProgressStatus, setScanProgressStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (!isScanProgressVisible || scanProgressStatus !== 'running') return;

    const interval = window.setInterval(() => {
      setScanProgress((current) => {
        if (current >= 95) return current;
        if (current < 35) return current + 4;
        if (current < 70) return current + 2;
        return current + 1;
      });
    }, 700);

    return () => window.clearInterval(interval);
  }, [isScanProgressVisible, scanProgressStatus]);

  const { data: scansData, isLoading: isScansLoading } = useQuery({
    queryKey: ['scans', teamId],
    queryFn: () => fetchApi<ScanConfigurationListItem[]>(`/api/teams/${teamId}/scans`),
    enabled: !!teamId,
  });

  const createScanMutation = useMutation({
    mutationFn: async (formData: typeof newScanForm) => {
      const backendPayload = {
        keywords: formData.keywords.split(',').map(k => k.trim()).filter(Boolean),
        niche: formData.keywords.trim(),
        location: formData.location.trim() || undefined,
        sourceIds: [formData.source],
        aiEnabled: false,
        scheduleIntervalMinutes: formData.schedule === 'Daily' ? 1440 : formData.schedule === 'Weekly' ? 10080 : undefined
      };

      const res = await fetchApi<CreateScanResponse>(`/api/teams/${teamId}/scans`, {
        method: 'POST',
        body: JSON.stringify(backendPayload),
      });
      setScanProgress((current) => Math.max(current, 45));

      const scan = res.configuration;

      if (formData.schedule === 'Run Now' && scan?.id) {
        // Trigger run immediately
        setScanProgress((current) => Math.max(current, 65));
        const summary = await fetchApi<ScanRunSummary>(`/api/teams/${teamId}/scans/${scan.id}/run`, {
          method: 'POST',
          body: JSON.stringify({})
        });
        return summary;
      }
      return null;
    },
    onMutate: () => {
      setIsScanProgressVisible(true);
      setScanProgressStatus('running');
      setScanProgress(8);
    },
    onSuccess: (summary) => {
      void queryClient.invalidateQueries({ queryKey: ['scans', teamId] });
      setScanProgress(100);
      setScanProgressStatus('success');
      if (summary) {
        const connectorError = summary.connectorResults.find((result) => result.outcome !== 'ok');
        const totalSaved = summary.newLeads + summary.duplicateLeads;
        if (connectorError) {
          toast.error(`[SCAN_CONNECTOR_${connectorError.sourceId.toUpperCase()}_FAILED] ${connectorError.sourceId} gagal: ${connectorError.error ?? connectorError.outcome}`);
        } else if (totalSaved === 0) {
          toast.warning('Scan selesai, tapi tidak ada lead yang ditemukan dari source ini.');
        } else {
          toast.success(`Scan selesai: ${summary.newLeads} lead baru, ${summary.duplicateLeads} duplicate.`);
        }
      } else {
        toast.success('Scan configuration berhasil disimpan.');
      }
      setNewScanForm({ source: 'google', keywords: '', location: '', schedule: 'Run Now' });
      window.setTimeout(() => {
        setIsModalOpen(false);
        setIsScanProgressVisible(false);
        setScanProgressStatus('idle');
        setScanProgress(0);
      }, 800);
    },
    onError: (err: unknown) => {
      setScanProgressStatus('error');
      toast.error(err instanceof Error ? err.message : '[SCAN_SAVE_AND_RUN_FAILED] Scan gagal dijalankan. Coba lagi sebentar lagi.');
    },
  });

  const runMutation = useMutation({
    mutationFn: async (configId: string) => {
      return fetchApi<ScanRunSummary>(`/api/teams/${teamId}/scans/${configId}/run`, { method: 'POST', body: JSON.stringify({}) });
    },
    onSuccess: (summary) => {
      const connectorError = summary.connectorResults.find((result) => result.outcome !== 'ok');
      const totalSaved = summary.newLeads + summary.duplicateLeads;
      if (connectorError) {
        toast.error(`[SCAN_CONNECTOR_${connectorError.sourceId.toUpperCase()}_FAILED] ${connectorError.sourceId} gagal: ${connectorError.error ?? connectorError.outcome}`);
      } else if (totalSaved === 0) {
        toast.warning('Scan selesai, tapi tidak ada lead yang ditemukan dari source ini.');
      } else {
        toast.success(`Scan selesai: ${summary.newLeads} lead baru, ${summary.duplicateLeads} duplicate.`);
      }
    }
  });

  if (isSessionLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-2 h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
          <Skeleton className="mb-4 h-6 w-32" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <tbody>
                <TableSkeleton columns={7} />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }
  if (!teamId) return <div className="p-4">Error: No active team session.</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-strong-950">Recent Scans</h2>
          <Button onClick={() => setIsModalOpen(true)}>New Scan</Button>
        </div>
        {isScansLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <tbody>
                <TableSkeleton columns={7} />
              </tbody>
            </table>
          </div>
        ) : (
          <Table className="border-0 rounded-none">
            <TableHeader>
              <TableRow className="border-b-0 bg-bg-weak-50 hover:bg-bg-weak-50">
                <TableHead className="rounded-l-lg font-normal text-text-sub-600">Target / Keywords</TableHead>
                <TableHead className="font-normal text-text-sub-600">Source</TableHead>
                <TableHead className="font-normal text-text-sub-600">Schedule</TableHead>
                <TableHead className="font-normal text-text-sub-600">Status</TableHead>
                <TableHead className="font-normal text-text-sub-600">Leads Found</TableHead>
                <TableHead className="font-normal text-text-sub-600">Created At</TableHead>
                <TableHead className="rounded-r-lg font-normal text-text-sub-600">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <tbody>
              {(!scansData || scansData.length === 0) ? (
                <TableRow>
                  <TableCell className="text-center py-8" colSpan={7}>
                    No scans found. Create one to start generating leads.
                  </TableCell>
                </TableRow>
              ) : (
                scansData.map((scan) => (
                  <TableRow key={scan.id} className="hover:bg-[#fcfcfd]">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-text-strong-950">{scan.keywords.join(', ') || '-'}</span>
                        <span className="text-xs text-text-soft-400">{scan.location ?? 'Any location'}</span>
                      </div>
                    </TableCell>
                    <TableCell>{scan.sourceIds.join(', ') || '-'}</TableCell>
                    <TableCell>{scan.schedule ? `Every ${scan.schedule.intervalMinutes} mins` : 'Run Now'}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={scan.aiEnabled ? 'success' : 'neutral'}
                      >
                        {scan.aiEnabled ? 'AI Enabled' : 'AI Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">-</span>
                    </TableCell>
                    <TableCell className="text-sm text-text-soft-400">
                      {scan.createdAt ? new Date(scan.createdAt).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="primary" 
                        size="sm"
                        disabled={runMutation.isPending}
                        onClick={() => runMutation.mutate(scan.id)}
                      >
                        {runMutation.isPending ? 'Running...' : 'Run Again'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </tbody>
          </Table>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          if (createScanMutation.isPending) return;
          setIsModalOpen(false);
        }}
        title="Create New Scan"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} disabled={createScanMutation.isPending}>Cancel</Button>
            <Button 
              onClick={() => createScanMutation.mutate(newScanForm)} 
              disabled={!newScanForm.keywords.trim() || createScanMutation.isPending}
            >
              {createScanMutation.isPending 
                ? 'Creating...' 
                : newScanForm.schedule === 'Run Now' ? 'Run Scan' : 'Save Config'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-strong-950">Source</label>
            <Select 
              value={newScanForm.source}
              onChange={(e) => setNewScanForm({ ...newScanForm, source: e.target.value })}
              options={[
                { label: 'Google API', value: 'google' },
                { label: 'Scrap Worker Pribadi (OSM)', value: 'google-scraper' },
                { label: 'Threads', value: 'threads' },
                { label: 'LinkedIn', value: 'linkedin' },
                { label: 'Instagram', value: 'instagram' },
              ]}
            />
          </div>
          
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-strong-950">Keywords / Niche</label>
            <Input 
              placeholder="e.g. B2B SaaS Founders"
              value={newScanForm.keywords}
              onChange={(e) => setNewScanForm({ ...newScanForm, keywords: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-strong-950">Location (Optional)</label>
            <Input 
              placeholder="e.g. San Francisco, CA"
              value={newScanForm.location}
              onChange={(e) => setNewScanForm({ ...newScanForm, location: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-strong-950">Schedule</label>
            <Select 
              value={newScanForm.schedule}
              onChange={(e) => setNewScanForm({ ...newScanForm, schedule: e.target.value })}
              options={[
                { label: 'Run Now (Once)', value: 'Run Now' },
                { label: 'Daily', value: 'Daily' },
                { label: 'Weekly', value: 'Weekly' },
              ]}
            />
          </div>

          {isScanProgressVisible && (
            <div className="rounded-xl border border-stroke-soft-200 bg-bg-weak-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-strong-950">
                    {scanProgressStatus === 'error'
                      ? 'Scraping failed'
                      : scanProgressStatus === 'success'
                        ? 'Scraping complete'
                        : 'Scraping in progress'}
                  </p>
                  <p className="mt-1 text-xs text-text-soft-400">
                    {newScanForm.schedule === 'Run Now' ? 'Fetching leads and saving results.' : 'Saving scan configuration.'}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-primary-base">{scanProgress}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-white-0">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    scanProgressStatus === 'error' ? 'bg-[#fb3748]' : 'bg-primary-base'
                  }`}
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
