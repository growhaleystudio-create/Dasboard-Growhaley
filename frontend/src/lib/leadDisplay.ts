import type { LeadListItem } from './types';

const sourceLabels: Record<string, string> = {
  'apify-google-maps': 'Google Maps',
  'rapidapi-google': 'Google Maps',
  'google-scraper': 'OpenStreetMap',
  'example-google-search': 'Google Search',
  instagram: 'Instagram',
  facebook: 'Facebook',
  threads: 'Threads',
  linkedin: 'LinkedIn',
};

export function isOpenStreetMapUrl(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\/(?:www\.)?openstreetmap\.org\//i.test(value));
}

export function socialSourceFromUrl(value: string | null | undefined) {
  if (!value) return null;
  if (/instagram\.com/i.test(value)) return 'Instagram';
  if (/facebook\.com|fb\.com/i.test(value)) return 'Facebook';
  if (/threads\.net/i.test(value)) return 'Threads';
  if (/linkedin\.com/i.test(value)) return 'LinkedIn';
  return null;
}

export function sourceLabelFor(lead: Pick<LeadListItem, 'acquiredSource' | 'profileUrl'>) {
  const socialSource = socialSourceFromUrl(lead.profileUrl);
  if (socialSource) return socialSource;
  if (lead.acquiredSource) return sourceLabels[lead.acquiredSource] ?? lead.acquiredSource;
  return '-';
}

export function sourceUrlFor(lead: Pick<LeadListItem, 'acquiredSource' | 'profileUrl'>) {
  if (!lead.profileUrl || isOpenStreetMapUrl(lead.profileUrl)) return null;
  return lead.profileUrl;
}

export function websiteStatusFor(lead: Pick<LeadListItem, 'profileUrl'>) {
  const profileUrl = lead.profileUrl?.trim();
  if (!profileUrl || isOpenStreetMapUrl(profileUrl) || socialSourceFromUrl(profileUrl)) {
    return 'dont have website' as const;
  }
  return 'have website' as const;
}
