const LOCATION_WORD_ALIASES: Record<string, string[]> = {
  bandung: ['bandung'],
  jakarta: ['jakarta', 'dki jakarta'],
  selatan: ['selatan', 'south'],
  utara: ['utara', 'north'],
  timur: ['timur', 'east'],
  barat: ['barat', 'west'],
  pusat: ['pusat', 'central'],
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function significantLocationTokens(location: string): string[] {
  const primaryLocation = location.split(',')[0] ?? location;
  return normalizeText(primaryLocation)
    .split(' ')
    .filter((token) => token.length >= 3)
    .filter((token) => !['kota', 'kabupaten', 'kab', 'city', 'regency'].includes(token));
}

function tokenMatches(haystack: string, token: string): boolean {
  const aliases = LOCATION_WORD_ALIASES[token] ?? [token];
  return aliases.some((alias) => haystack.includes(alias));
}

export function matchesRequestedLocation(requestedLocation: string | undefined, candidateParts: Array<string | undefined>): boolean {
  if (!requestedLocation?.trim()) return true;

  const tokens = significantLocationTokens(requestedLocation);
  if (tokens.length === 0) return true;

  const haystack = normalizeText(candidateParts.filter(Boolean).join(' '));
  if (!haystack) return false;

  return tokens.every((token) => tokenMatches(haystack, token));
}
