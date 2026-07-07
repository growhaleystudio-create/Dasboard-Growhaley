'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/useSession';
import { fetchApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Switch } from '@/components/ui/Switch';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Tabs, TabsContent } from '@/components/ui/Tabs';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { toast } from 'sonner';
import { KeyRound, Eye, EyeOff, CheckCircle2, XCircle, Settings2 } from 'lucide-react';
import type { AiUsageResponse } from '@/lib/types';
import { PageHeader } from '@/components/ui/PageHeader';

type ApiKeySlot = 'text' | 'imageGeneration';

const API_KEY_SLOTS: Array<{
  id: ApiKeySlot;
  title: string;
  description: string;
}> = [
  {
    id: 'text',
    title: 'API Key Leads & Suggestion Content',
    description: 'Dipakai untuk AI lead analyzer, scoring, re-analyze lead, text planning, draft copy, dan struktur slide.',
  },
  {
    id: 'imageGeneration',
    title: 'API Key Image Generation',
    description: 'Dipakai khusus untuk membuat image berdasarkan prompt atau arahan dari draft content.',
  },
];

export default function SettingsPage() {
  const { data: sessionData, isLoading: isSessionLoading } = useSession();
  const teamId = sessionData?.session.teamId;
  const role = sessionData?.session.role ?? 'viewer';
  const canConfigure = role === 'admin';
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('ai');
  const [aiPrompt, setAiPrompt] = useState('Analyze this lead and determine if they are a good fit for B2B SaaS sales.');
  const [minScore, setMinScore] = useState('70');
  const [autoContact, setAutoContact] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);

  const [apiKeyInputs, setApiKeyInputs] = useState<Record<ApiKeySlot, string>>({
    text: '',
    imageGeneration: '',
  });
  const [apiBaseUrlInputs, setApiBaseUrlInputs] = useState<Record<ApiKeySlot, string>>({
    text: '',
    imageGeneration: '',
  });
  const [showApiKeys, setShowApiKeys] = useState<Record<ApiKeySlot, boolean>>({
    text: false,
    imageGeneration: false,
  });
  const aiUsageQuery = useQuery({
    queryKey: ['ai-usage', teamId],
    queryFn: () => fetchApi<AiUsageResponse>(`/api/teams/${teamId}/ai/usage`),
    enabled: !!teamId,
    refetchInterval: 10_000,
  });
  const aiUsage = aiUsageQuery.data;
  const hasApiKeys: Record<ApiKeySlot, boolean> = {
    text: aiUsage?.hasApiKeys ? aiUsage.hasApiKeys.leads || aiUsage.hasApiKeys.contentSuggestion : aiUsage?.hasApiKey ?? false,
    imageGeneration: aiUsage?.hasApiKeys?.imageGeneration ?? aiUsage?.hasApiKey ?? false,
  };
  const hasAnyApiKey = hasApiKeys.text || hasApiKeys.imageGeneration;
  const [selectedModels, setSelectedModels] = useState<Record<ApiKeySlot, string>>({
    text: 'gemini-2.5-flash-lite',
    imageGeneration: 'gpt-image-1',
  });

  const availableTextModelsQuery = useQuery({
    queryKey: ['available-models', teamId, 'text', hasApiKeys.text, apiBaseUrlInputs.text],
    queryFn: () => fetchApi<Array<{ id: string; name: string }>>(`/api/teams/${teamId}/ai/available-models?purpose=text`),
    enabled: !!teamId && hasApiKeys.text,
  });

  const availableImageModelsQuery = useQuery({
    queryKey: ['available-models', teamId, 'image', hasApiKeys.imageGeneration, apiBaseUrlInputs.imageGeneration],
    queryFn: () => fetchApi<Array<{ id: string; name: string }>>(`/api/teams/${teamId}/ai/available-models?purpose=image`),
    enabled: !!teamId && hasApiKeys.imageGeneration,
  });

  React.useEffect(() => {
    if (!aiUsage) return;
    if (aiUsage.apiBaseUrls) {
      setApiBaseUrlInputs({
        text: aiUsage.apiBaseUrls.text ?? '',
        imageGeneration: aiUsage.apiBaseUrls.imageGeneration ?? '',
      });
    }
    if (aiUsage.models) {
      setSelectedModels({
        text: aiUsage.models.text ?? 'gemini-2.5-flash-lite',
        imageGeneration: aiUsage.models.imageGeneration ?? 'gpt-image-1',
      });
    }
  }, [aiUsage]);

  const promptTokens = aiUsage?.tokenUsage?.promptTokens ?? 0;
  const outputTokens = aiUsage?.tokenUsage?.outputTokens ?? 0;
  const totalTokens = aiUsage?.tokenUsage?.totalTokens ?? 0;
  const outputTokenPercent = totalTokens > 0 ? Math.min(100, Math.round((outputTokens / totalTokens) * 100)) : 0;

  const saveApiKeyMutation = useMutation({
    mutationFn: ({ slot, key, baseUrl, model }: { slot: ApiKeySlot; key: string; baseUrl: string; model: string }) =>
      fetchApi(`/api/teams/${teamId}/ai/settings`, {
        method: 'PUT',
        body: JSON.stringify({
          apiKeys:
            key === ''
              ? undefined
              : slot === 'text'
              ? { leads: key, contentSuggestion: key }
              : { imageGeneration: key },
          apiBaseUrls:
            slot === 'text'
              ? { text: baseUrl }
              : { imageGeneration: baseUrl },
          textModel: slot === 'text' ? model : undefined,
          imageModel: slot === 'imageGeneration' ? model : undefined,
        }),
      }),
    onSuccess: (_data, vars) => {
      toast.success('API Key & model berhasil disimpan');
      setApiKeyInputs((prev) => ({ ...prev, [vars.slot]: '' }));
      void queryClient.invalidateQueries({ queryKey: ['ai-usage', teamId] });
      void queryClient.invalidateQueries({ queryKey: ['available-models', teamId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan API Key');
    },
  });

  const clearApiKeyMutation = useMutation({
    mutationFn: (slot: ApiKeySlot) =>
      fetchApi(`/api/teams/${teamId}/ai/settings`, {
        method: 'PUT',
        body: JSON.stringify({
          apiKeys:
            slot === 'text'
              ? { leads: '', contentSuggestion: '' }
              : { imageGeneration: '' },
        }),
      }),
    onSuccess: () => {
      toast.success('API Key dihapus');
      void queryClient.invalidateQueries({ queryKey: ['ai-usage', teamId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus API Key');
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: () => {
      return new Promise(resolve => setTimeout(resolve, 500));
    },
    onSuccess: () => {
      toast.success('Settings saved successfully');
    }
  });

  if (isSessionLoading) return <div className="p-4">Loading session...</div>;
  if (!teamId) return <div className="p-4">Error: No active team session.</div>;

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        title="Settings"
        description="Configure AI models, API keys, billing, and general workspace preferences."
      />

      <Tabs value={activeTab} className="w-full">
        <SegmentedControl
          className="mb-6 w-full sm:w-auto"
          options={[
            { label: 'AI Configuration', value: 'ai' },
            { label: 'Billing & Usage', value: 'billing' },
            { label: 'General', value: 'general' }
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />

        <TabsContent value="ai" className="flex flex-col gap-6">
          {/* ------------------------------------------------------------------ */}
          {/* AI API Keys                                                         */}
          {/* ------------------------------------------------------------------ */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound size={18} className="text-primary-base" />
                AI API Keys
              </CardTitle>
              <CardDescription>
                Kunci API dienkripsi dan disimpan per-team. Leads dan suggestion content memakai key yang sama,
                sedangkan image generation memakai key terpisah.
                {!canConfigure && ' Hanya Admin yang dapat mengubah.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {aiUsageQuery.isLoading && <span className="text-sm text-text-soft-400">Memuat status…</span>}
              {!aiUsageQuery.isLoading && !hasAnyApiKey && (
                <div className="flex items-center gap-1.5 rounded-full border border-[#fecdca] bg-[#fef3f2] px-3 py-1 text-xs font-medium text-[#b42318]">
                  <XCircle size={13} />
                  Belum ada API Key yang dikonfigurasi
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {API_KEY_SLOTS.map((slot) => {
                  const hasKey = hasApiKeys[slot.id];
                  const inputValue = apiKeyInputs[slot.id];
                  const baseUrlValue = apiBaseUrlInputs[slot.id];
                  const isShown = showApiKeys[slot.id];
                  return (
                    <div key={slot.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-stroke-soft-200 bg-bg-weak-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-strong-950">{slot.title}</p>
                          <p className="mt-1 text-xs leading-5 text-text-soft-400">{slot.description}</p>
                        </div>
                        {hasKey ? (
                          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#abefc6] bg-[#ecfdf3] px-2.5 py-1 text-xs font-medium text-[#027a48]">
                            <CheckCircle2 size={13} />
                            Aktif
                          </div>
                        ) : (
                          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#fecdca] bg-[#fef3f2] px-2.5 py-1 text-xs font-medium text-[#b42318]">
                            <XCircle size={13} />
                            Kosong
                          </div>
                        )}
                      </div>

                      {canConfigure && (
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-text-sub-600">API Key</label>
                            <Input
                              type={isShown ? 'text' : 'password'}
                              value={inputValue}
                              onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, [slot.id]: e.target.value }))}
                              placeholder={hasKey ? 'Isi untuk mengganti key' : 'Paste API key di sini'}
                              rightIcon={
                                <button
                                  type="button"
                                  onClick={() => setShowApiKeys((prev) => ({ ...prev, [slot.id]: !prev[slot.id] }))}
                                  className="text-text-soft-400 hover:text-text-strong-950"
                                  aria-label={isShown ? 'Sembunyikan key' : 'Tampilkan key'}
                                >
                                  {isShown ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                              }
                            />
                          </div>
                          
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-text-sub-600">Base URL</label>
                            <Input
                              type="url"
                              value={baseUrlValue}
                              onChange={(e) => setApiBaseUrlInputs((prev) => ({ ...prev, [slot.id]: e.target.value }))}
                              placeholder="Base URL provider, contoh: https://api.provider.com"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-text-sub-600">Model</label>
                            {(() => {
                              const modelsQuery = slot.id === 'text' ? availableTextModelsQuery : availableImageModelsQuery;
                              const modelsList = modelsQuery.data ?? [];
                              const modelOptions = modelsList.map((m) => ({ label: m.name, value: m.id }));
                              const currentModel = selectedModels[slot.id];
                              if (!modelOptions.some(opt => opt.value === currentModel)) {
                                modelOptions.unshift({ label: currentModel, value: currentModel });
                              }
                              return (
                                <Select
                                  options={modelOptions}
                                  value={currentModel}
                                  onChange={(e) => setSelectedModels((prev) => ({ ...prev, [slot.id]: e.target.value }))}
                                  disabled={modelsQuery.isLoading}
                                />
                              );
                            })()}
                          </div>

                          <div className="flex gap-2 mt-1">
                            <Button
                              variant="primary"
                              size="md"
                              className="flex-1"
                              disabled={baseUrlValue.trim() === '' || saveApiKeyMutation.isPending}
                              onClick={() => saveApiKeyMutation.mutate({ slot: slot.id, key: inputValue.trim(), baseUrl: baseUrlValue.trim(), model: selectedModels[slot.id] })}
                            >
                              {saveApiKeyMutation.isPending ? 'Menyimpan…' : 'Simpan'}
                            </Button>
                            {hasKey && (
                              <Button
                                variant="danger"
                                size="md"
                                disabled={clearApiKeyMutation.isPending}
                                onClick={() => clearApiKeyMutation.mutate(slot.id)}
                              >
                                {clearApiKeyMutation.isPending ? 'Menghapus…' : 'Hapus'}
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* ------------------------------------------------------------------ */}
          {/* AI Analyzer Engine Card (existing)                                  */}
          {/* ------------------------------------------------------------------ */}
          <Card>
            <CardHeader>
              <CardTitle>AI Analyzer Engine</CardTitle>
              <CardDescription>Configure how leads are scanned, scored, and prioritized by the AI.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              
              <div className="flex items-center justify-between p-4 bg-bg-weak-50 rounded-xl border border-stroke-soft-200">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-text-strong-950">Enable AI Processing</span>
                  <span className="text-sm text-text-soft-400">Automatically analyze new leads as they are generated.</span>
                </div>
                <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-text-strong-950">System Prompt</label>
                <p className="text-xs text-text-soft-400 mb-1">Provide specific instructions for the Gemini model when analyzing leads.</p>
                <Textarea 
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="h-32"
                  disabled={!aiEnabled}
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-text-strong-950">Minimum Lead Score Threshold</label>
                  <p className="text-xs text-text-soft-400 mb-1">Leads scored below this will be rejected.</p>
                  <Input 
                    type="number"
                    min="0"
                    max="100"
                    value={minScore}
                    onChange={(e) => setMinScore(e.target.value)}
                    disabled={!aiEnabled}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-text-strong-950">Action for High Score</label>
                  <p className="text-xs text-text-soft-400 mb-1">Action to take if score {'>'} 90.</p>
                  <Select 
                    options={[
                      { label: 'Mark as Qualified', value: 'qualified' },
                      { label: 'Send to HubSpot', value: 'hubspot' },
                    ]}
                    disabled={!aiEnabled}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-stroke-soft-200">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-text-strong-950">Auto-contact Enable</span>
                  <span className="text-sm text-text-soft-400">Automatically trigger email sequence for qualified leads.</span>
                </div>
                <Switch checked={autoContact} onCheckedChange={setAutoContact} disabled={!aiEnabled} />
              </div>
            </CardContent>
            <CardFooter className="justify-end border-t border-stroke-soft-200 pt-4 mt-2 bg-bg-weak-50">
              <Button 
                onClick={() => saveSettingsMutation.mutate()}
                disabled={saveSettingsMutation.isPending}
              >
                {saveSettingsMutation.isPending ? 'Saving...' : 'Save AI Settings'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>AI Budget & Usage</CardTitle>
              <CardDescription>Monitor your API usage for the current billing cycle.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 mb-6">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-text-strong-950">Token Usage</span>
                  <span className="text-sm font-semibold text-text-strong-950">
                    {totalTokens.toLocaleString('id-ID')} tokens
                  </span>
                </div>
                <div className="w-full h-3 bg-bg-weak-50 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-base rounded-full" style={{ width: `${Math.max(4, outputTokenPercent)}%` }} />
                </div>
                <p className="text-xs text-text-soft-400 mt-1">
                  {promptTokens.toLocaleString('id-ID')} input tokens / {outputTokens.toLocaleString('id-ID')} output tokens in the last {aiUsage?.windowDays ?? 30} days. Gemini free-tier quota is managed in Google AI Studio.
                </p>
              </div>

              <div className="p-4 bg-[#fff8e6] border border-[#fce9ab] rounded-xl">
                <h4 className="text-sm font-semibold text-[#8a6100] mb-1">Upgrade your plan</h4>
                <p className="text-sm text-[#8a6100]">Need more AI analyses? Upgrade to the Enterprise plan for unlimited calls and custom models.</p>
                <Button variant="outline" className="mt-4 bg-white border-[#fce9ab] text-[#8a6100] hover:bg-[#fffdf5]">View Plans</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Manage your workspace preferences.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 max-w-md">
                <label className="text-sm font-medium text-text-strong-950">Workspace Name</label>
                <Input defaultValue="Acme Corp Lead Gen" />
              </div>
            </CardContent>
            <CardFooter className="justify-end border-t border-stroke-soft-200 pt-4 mt-4 bg-bg-weak-50">
              <Button variant="primary">Save Changes</Button>
            </CardFooter>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
