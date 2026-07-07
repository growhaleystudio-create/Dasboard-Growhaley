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
import { PageHeader } from '@/components/ui/PageHeader';
import { Search } from 'lucide-react';
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

  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('All');

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

  const filteredScans = React.useMemo(() => {
    return (scansData ?? []).filter((scan) => {
      const keywordsStr = scan.keywords.join(', ').toLowerCase();
      const locationStr = (scan.location ?? '').toLowerCase();
      const query = search.toLowerCase();
      const matchesSearch = keywordsStr.includes(query) || locationStr.includes(query);
      const matchesSource = sourceFilter === 'All' || scan.sourceIds.includes(sourceFilter);
      return matchesSearch && matchesSource;
    });
  }, [scansData, search, sourceFilter]);

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
        <div className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-bg-white-0 shadow-none">
          <div className="p-4 border-b border-stroke-soft-200">
            <Skeleton className="mb-4 h-6 w-32" />
          </div>
          <Table className="border-0 shadow-none">
            <tbody>
              <TableSkeleton columns={7} />
            </tbody>
          </Table>
        </div>
      </div>
    );
  }
  if (!teamId) return <div className="p-4">Error: No active team session.</div>;

  return (
    <div className="flex w-full flex-col gap-5 pb-12">
      {/* Sub Header & Actions */}
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Recent Scans"
          description="Manage and run keyword-based scraping jobs to discover new leads."
          actions={<Button onClick={() => setIsModalOpen(true)}>New Scan</Button>}
        />

        {/* Filter Bar */}
        <div className="grid gap-3 rounded-2xl border border-stroke-soft-200 bg-white p-4 shadow-none sm:grid-cols-2 xl:grid-cols-6">
          <Select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            options={[
              { label: 'All sources', value: 'All' },
              { label: 'Google Maps', value: 'google' },
              { label: 'Instagram', value: 'instagram' },
              { label: 'LinkedIn', value: 'linkedin' },
            ]}
          />
        </div>
      </div>

      {/* Table Area */}
      <div className="mt-2 flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-[320px]">
            <Input
              placeholder="Search scans by keyword or location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search size={16} />}
            />
          </div>
        </div>
        {isScansLoading ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Target / Keywords</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Leads Found</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <tbody>
              <TableSkeleton columns={7} />
            </tbody>
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Target / Keywords</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Leads Found</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <tbody>
              {filteredScans.length === 0 ? (
                <TableRow>
                  <TableCell className="text-center py-8" colSpan={7}>
                    No scans found matching your search.
                  </TableCell>
                </TableRow>
              ) : (
                filteredScans.map((scan) => (
                  <TableRow key={scan.id}>
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
                        size="md"
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
