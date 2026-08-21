export type ProviderAdapterKind = 'openai_compatible' | 'google';

export function normalizeProviderBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export function providerKindFromBaseUrl(baseUrl: string): ProviderAdapterKind {
  const normalized = normalizeProviderBaseUrl(baseUrl);
  try {
    const host = new URL(normalized).host;
    return host === 'generativelanguage.googleapis.com' ? 'google' : 'openai_compatible';
  } catch {
    return 'openai_compatible';
  }
}

export function requireProviderBaseUrl(baseUrl?: string | null): string {
  if (!baseUrl || baseUrl.trim().length === 0) {
    return 'https://generativelanguage.googleapis.com';
  }
  return normalizeProviderBaseUrl(baseUrl);
}
