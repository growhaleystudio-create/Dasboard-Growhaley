'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { PageHeaderSkeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { useSession } from '@/lib/useSession';
import { fetchApi } from '@/lib/api';
import type { ConnectorListItem } from '@/lib/types';
import { KeyRound, Plug, Trash2 } from 'lucide-react';

const preferredConnectors = ['google', 'google-scraper', 'threads', 'linkedin', 'instagram'];

export default function ConnectorsPage() {
  const queryClient = useQueryClient();
  const { data: sessionData, isLoading: isSessionLoading } = useSession();
  const teamId = sessionData?.session.teamId;
  const [selectedConnector, setSelectedConnector] = useState<ConnectorListItem | null>(null);
  const [apiKey, setApiKey] = useState('');

  const connectorsQuery = useQuery({
    queryKey: ['connectors', teamId],
    queryFn: () => fetchApi<ConnectorListItem[]>(`/api/teams/${teamId}/connectors`),
    enabled: !!teamId,
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

  if (isSessionLoading) {
    return (
      <div className="flex w-full flex-col gap-5 pb-12">
        <PageHeaderSkeleton />
        <section className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
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

  return (
    <div className="flex w-full flex-col gap-5 pb-12">


      <section className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
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
                                size="sm"
                                variant={isConnected ? 'secondary' : 'primary'}
                                onClick={() => openApiKeyModal(connector)}
                              >
                                {isConnected ? 'Update' : 'Connect'}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
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
    </div>
  );
}
