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

export function requireProviderBaseUrl(baseUrl: string): string {
  const normalized = normalizeProviderBaseUrl(baseUrl);
  if (normalized.length === 0) {
    throw new Error('provider_base_url_missing');
  }
  return normalized;
}
