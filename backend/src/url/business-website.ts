const SOCIAL_PROFILE_HOST_PATTERN =
  /instagram\.com|facebook\.com|fb\.com|threads\.net|linkedin\.com|twitter\.com|x\.com/i;

const OPEN_STREET_MAP_PATTERN = /^https?:\/\/(?:www\.)?openstreetmap\.org\//i;

export function normalizeWebsiteCandidate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function isBusinessWebsiteUrl(value: string | undefined): boolean {
  const normalized = normalizeWebsiteCandidate(value);
  if (!normalized) return false;
  if (OPEN_STREET_MAP_PATTERN.test(normalized)) return false;
  if (SOCIAL_PROFILE_HOST_PATTERN.test(normalized)) return false;
  return true;
}

export function inferSourceFromProfileUrl(value: string | undefined): string | undefined {
  const normalized = normalizeWebsiteCandidate(value);
  if (!normalized) return undefined;
  if (/instagram\.com/i.test(normalized)) return 'instagram';
  if (/facebook\.com|fb\.com/i.test(normalized)) return 'facebook';
  if (/threads\.net/i.test(normalized)) return 'threads';
  if (/linkedin\.com/i.test(normalized)) return 'linkedin';
  if (/twitter\.com|x\.com/i.test(normalized)) return 'twitter';
  if (/openstreetmap\.org/i.test(normalized)) return 'openstreetmap';
  return undefined;
}
