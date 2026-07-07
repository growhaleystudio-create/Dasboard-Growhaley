'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { PageHeaderSkeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { useSession } from '@/lib/useSession';
import { AppError, fetchApi } from '@/lib/api';
import type {
  ConnectorListItem,
  CreateGoogleMapsScrapeSessionResponse,
  GoogleMapsScrapeSessionResponse,
  GoogleMapsScrapeSessionStatus,
} from '@/lib/types';
import { KeyRound, Loader2, Plug, Trash2 } from 'lucide-react';
import { useExtensionBridge } from '@/lib/extension/bridge';

const preferredConnectors = ['google', 'google-scraper', 'threads', 'linkedin', 'instagram'];
const ACTIVE_CAPTURE_STATUSES: GoogleMapsScrapeSessionStatus[] = ['waiting_browser', 'collecting_results', 'importing'];

export default function ConnectorsPage() {
  const queryClient = useQueryClient();
  const { data: sessionData, isLoading: isSessionLoading } = useSession();
  const teamId = sessionData?.session.teamId;
  const [selectedConnector, setSelectedConnector] = useState<ConnectorListItem | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [scrapeOpen, setScrapeOpen] = useState(false);
  const [scrapeKeyword, setScrapeKeyword] = useState('');
  const [scrapeLocation, setScrapeLocation] = useState('');
  const [scrapeSuccessMessage, setScrapeSuccessMessage] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const { installed: extensionInstalled, sendCaptureSession } = useExtensionBridge();

  const connectorsQuery = useQuery({
    queryKey: ['connectors', teamId],
    queryFn: () => fetchApi<ConnectorListItem[]>(`/api/teams/${teamId}/connectors`),
    enabled: !!teamId,
  });

  const scrapeSessionQuery = useQuery({
    queryKey: ['google-maps-scrape-session', teamId, activeSessionId],
    queryFn: () =>
      fetchApi<GoogleMapsScrapeSessionResponse>(
        `/api/teams/${teamId}/connectors/scrape/session/${activeSessionId}`,
      ),
    enabled: !!teamId && !!activeSessionId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return 2000;
      return ACTIVE_CAPTURE_STATUSES.includes(status) ? 2000 : false;
    },
  });

  const activateMutation = useMutation({
    mutationFn: ({ sourceId, apiKey }: { sourceId: string; apiKey: string }) =>
      fetchApi(`/api/teams/${teamId}/connectors/${sourceId}/activate`, {
        method: 'POST',
        body: JSON.stringify({ apiKey }),
      }),
    onSuccess: () => {
      setApiKey('');
      setSelectedConnector(null);
      void queryClient.invalidateQueries({ queryKey: ['connectors', teamId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (sourceId: string) =>
      fetchApi(`/api/teams/${teamId}/connectors/${sourceId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['connectors', teamId] });
    },
  });

  const scrapeMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/teams/${teamId}/connectors/scrape`, {
        method: 'POST',
        body: JSON.stringify({
          keyword: scrapeKeyword,
          ...(scrapeLocation.trim() ? { location: scrapeLocation } : {}),
        }),
      }),
    onSuccess: () => {
      setScrapeSuccessMessage(
        `Scrape "${scrapeKeyword}"${
          scrapeLocation ? ` di ${scrapeLocation}` : ''
        } sedang berjalan. Leads akan masuk otomatis ke halaman Leads begitu selesai.`,
      );
      setScrapeKeyword('');
      setScrapeLocation('');
    },
    onError: () => {
      setScrapeSuccessMessage(null);
    },
  });

  const captureSessionMutation = useMutation({
    mutationFn: () =>
      fetchApi<CreateGoogleMapsScrapeSessionResponse>(`/api/teams/${teamId}/connectors/scrape/session`, {
        method: 'POST',
        body: JSON.stringify({
          keyword: scrapeKeyword,
          ...(scrapeLocation.trim() ? { location: scrapeLocation } : {}),
        }),
      }),
    onMutate: () => {
      setCaptureError(null);
    },
    onSuccess: (result) => {
      setActiveSessionId(result.sessionId);
      const handedOff = sendCaptureSession({
        sessionId: result.sessionId,
        captureToken: result.captureToken,
        teamId: teamId!,
        googleMapsUrl: result.googleMapsUrl,
      });
      const captureUrl = `${result.captureUrl}${result.captureUrl.includes('?') ? '&' : '?'}captureToken=${encodeURIComponent(result.captureToken)}&from=extension`;
      if (handedOff || extensionInstalled) {
        window.open(captureUrl, '_blank', 'noopener,noreferrer');
      } else {
        const fallbackUrl = `${result.captureUrl}${result.captureUrl.includes('?') ? '&' : '?'}captureToken=${encodeURIComponent(result.captureToken)}&from=bookmarklet`;
        window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
      }
    },
    onError: (error) => {
      if (error instanceof AppError) {
        setCaptureError(error.rawMessage);
        return;
      }
      setCaptureError('Failed to start browser capture. Please try again.');
    },
  });

  const activeSession = scrapeSessionQuery.data;
  const captureStatusText = useMemo(() => {
    if (!activeSession) return null;
    switch (activeSession.status) {
      case 'waiting_browser':
        return 'Menunggu tab browser siap...';
      case 'collecting_results':
        return 'Mengambil hasil dari Google Maps...';
      case 'importing':
        return 'Menyimpan leads ke dashboard...';
      case 'done': {
        const summary = activeSession.summary;
        if (!summary) return 'Capture selesai.';
        return `Selesai. ${summary.newLeads} lead baru, ${summary.duplicateLeads} duplikat.`;
      }
      case 'failed':
        return activeSession.error ?? 'Capture gagal.';
      default:
        return null;
    }
  }, [activeSession]);

  if (isSessionLoading) {
    return (
      <div className="flex w-full flex-col gap-5 pb-12">
        <PageHeaderSkeleton />
        <section className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <tbody>
                <TableSkeleton columns={5} />
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }
  if (!teamId) return <div className="p-4">Error: No active team session.</div>;

  const connectors = (connectorsQuery.data ?? [])
    .filter((connector) => preferredConnectors.includes(connector.sourceId))
    .sort((a, b) => preferredConnectors.indexOf(a.sourceId) - preferredConnectors.indexOf(b.sourceId));

  const openApiKeyModal = (connector: ConnectorListItem) => {
    setSelectedConnector(connector);
    setApiKey('');
  };

  const closeApiKeyModal = () => {
    if (activateMutation.isPending) return;
    setSelectedConnector(null);
    setApiKey('');
  };

  const closeScrapeModal = () => {
    if (scrapeMutation.isPending || captureSessionMutation.isPending) return;
    setScrapeOpen(false);
    setScrapeKeyword('');
    setScrapeLocation('');
    setScrapeSuccessMessage(null);
    setActiveSessionId(null);
    setCaptureError(null);
  };

  const getDisplayStatus = (connector: ConnectorListItem) => {
    if (connector.sourceId === 'google-scraper') {
      return { label: 'Ready', variant: 'success' as const };
    }
    if (connector.connected) {
      return { label: 'Connected', variant: 'success' as const };
    }
    if (connector.status === 'unavailable') {
      return { label: 'Unavailable', variant: 'error' as const };
    }
    if (connector.status === 'requires_configuration') {
      return { label: 'Needs configuration', variant: 'warning' as const };
    }
    return { label: 'Not connected', variant: 'neutral' as const };
  };

  const isCaptureActive = !!activeSession && ACTIVE_CAPTURE_STATUSES.includes(activeSession.status);

  return (
    <div className="flex w-full flex-col gap-5 pb-12">
      <div className="flex items-center justify-end">
        <Button onClick={() => setScrapeOpen(true)}>
          <Plug size={16} />
          Scrape Sekarang
        </Button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead>
              <tr className="bg-bg-weak-50 text-sm text-text-sub-600">
                <th className="rounded-l-lg px-3 py-2 font-normal">Connector</th>
                <th className="px-3 py-2 font-normal">Source ID</th>
                <th className="px-3 py-2 font-normal">Status</th>
                <th className="px-3 py-2 font-normal">API Key</th>
                <th className="rounded-r-lg px-3 py-2 font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {connectorsQuery.isLoading ? (
                <TableSkeleton columns={5} />
              ) : connectors.length === 0 ? (
                <tr><td className="px-3 py-8 text-center text-sm text-text-sub-600" colSpan={5}>No connectors available.</td></tr>
              ) : (
                connectors.map((connector) => {
                  const status = getDisplayStatus(connector);
                  const needsApiKey = connector.sourceId !== 'google-scraper';
                  const isConnected = connector.connected === true || !needsApiKey;

                  return (
                    <tr key={connector.sourceId} className="text-sm hover:bg-[#fcfcfd]">
                      <td className="px-3 py-3 font-medium text-text-strong-950">{connector.displayName}</td>
                      <td className="px-3 py-3 text-text-sub-600">{connector.sourceId}</td>
                      <td className="px-3 py-3">
                        <Badge variant={status.variant} showDot>
                          {status.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-sm text-text-sub-600">
                          {needsApiKey ? (isConnected ? 'Stored securely' : 'No API key stored') : 'No API key needed'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {needsApiKey ? (
                            <>
                              <Button
                                size="md"
                                variant={isConnected ? 'secondary' : 'primary'}
                                onClick={() => openApiKeyModal(connector)}
                              >
                                {isConnected ? 'Update' : 'Connect'}
                              </Button>
                              <Button
                                variant="secondary"
                                size="md"
                                aria-label={`Remove ${connector.displayName} key`}
                                disabled={!isConnected || removeMutation.isPending}
                                onClick={() => removeMutation.mutate(connector.sourceId)}
                              >
                                <Trash2 size={16} />
                              </Button>
                            </>
                          ) : (
                            <Badge variant="success" showDot>
                              Built-in
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        isOpen={selectedConnector !== null}
        onClose={closeApiKeyModal}
        title={selectedConnector ? `${selectedConnector.connected ? 'Update' : 'Connect'} ${selectedConnector.displayName}` : 'Connector API key'}
        footer={
          <>
            <Button variant="secondary" onClick={closeApiKeyModal} disabled={activateMutation.isPending}>
              Cancel
            </Button>
            <Button
              disabled={!apiKey.trim() || activateMutation.isPending || selectedConnector === null}
              onClick={() => {
                if (!selectedConnector) return;
                activateMutation.mutate({ sourceId: selectedConnector.sourceId, apiKey });
              }}
            >
              {activateMutation.isPending ? 'Saving...' : 'Save API Key'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <p className="font-medium text-text-strong-950">{selectedConnector?.displayName}</p>
            <p className="mt-1 text-sm text-text-soft-400">
              The key will be encrypted by the backend and used only for this connector.
            </p>
          </div>
          <Input
            type="password"
            autoFocus
            placeholder="Paste API key"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            leftIcon={<KeyRound size={16} />}
          />
          {activateMutation.error && (
            <p className="text-sm text-[#fb3748]">Failed to save API key. Please check the credential and try again.</p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={scrapeOpen}
        onClose={closeScrapeModal}
        title="Scrape Sekarang"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={closeScrapeModal}
              disabled={scrapeMutation.isPending || captureSessionMutation.isPending || isCaptureActive}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              disabled={!scrapeKeyword.trim() || scrapeMutation.isPending || captureSessionMutation.isPending || isCaptureActive}
              onClick={() => scrapeMutation.mutate()}
            >
              {scrapeMutation.isPending ? 'Memulai...' : 'Mulai Scrape Otomatis'}
            </Button>
            <Button
              disabled={!scrapeKeyword.trim() || captureSessionMutation.isPending || isCaptureActive}
              onClick={() => captureSessionMutation.mutate()}
            >
              {captureSessionMutation.isPending || isCaptureActive ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Menjalankan Capture
                </>
              ) : extensionInstalled ? (
                'Jalankan via Chrome Extension'
              ) : (
                'Jalankan Capture Browser'
              )}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-soft-400">
            Query berasal dari dashboard. Sistem akan membuka flow capture browser untuk ambil hasil Google Maps lalu import otomatis ke dashboard.
          </p>
          <div
            className={`rounded-2xl border p-3 text-sm ${
              extensionInstalled
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
            data-testid="extension-status-banner"
          >
            {extensionInstalled === null && <span>Mengecek Chrome extension...</span>}
            {extensionInstalled === true && (
              <span>Extension terdeteksi. Setelah submit, buka tab Google Maps lalu klik icon extension di toolbar.</span>
            )}
            {extensionInstalled === false && (
              <span>Extension belum terdeteksi. Install dulu Chrome extension, atau gunakan mode fallback (bookmarklet).</span>
            )}
          </div>
          <Input
            autoFocus
            placeholder="Keyword"
            value={scrapeKeyword}
            onChange={(event) => setScrapeKeyword(event.target.value)}
          />
          <Input
            placeholder="Lokasi"
            value={scrapeLocation}
            onChange={(event) => setScrapeLocation(event.target.value)}
          />

          {activeSession && (
            <div className="rounded-2xl border border-stroke-soft-200 bg-bg-weak-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-text-strong-950">
                {isCaptureActive && <Loader2 size={16} className="animate-spin" />}
                <span>Status capture: {captureStatusText}</span>
              </div>
              {activeSession.status === 'waiting_browser' && (
                <p className="mt-2 text-sm text-text-soft-400">
                  Tab capture sudah dibuka. Lanjutkan proses di tab baru itu.
                </p>
              )}
              {activeSession.status === 'failed' && activeSession.error && (
                <p className="mt-2 text-sm text-[#fb3748]">{activeSession.error}</p>
              )}
            </div>
          )}

          {captureError && (
            <p className="text-sm text-[#fb3748]">{captureError}</p>
          )}
          {scrapeMutation.error && (
            <p className="text-sm text-[#fb3748]">Failed to start scrape. Please try again.</p>
          )}
          {scrapeSuccessMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="font-medium">Scrape otomatis dimulai</p>
              <p className="mt-1 text-emerald-700">{scrapeSuccessMessage}</p>
              <a
                href="/dashboard/leads"
                className="mt-2 inline-flex text-emerald-800 underline underline-offset-2 hover:text-emerald-900"
              >
                Buka halaman Leads →
              </a>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
