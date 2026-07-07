import type { LeadListItem } from './types';

export type WebsiteDisplayStatus = 'have website' | 'dont have website';

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
  if (/twitter\.com|x\.com/i.test(value)) return 'Twitter';
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

export function deterministicLeadScore(lead: Pick<LeadListItem, 'score' | 'scoringBreakdown'>) {
  return lead.scoringBreakdown?.finalScore ?? lead.score;
}

export function leadStarRating(lead: Pick<LeadListItem, 'score' | 'scoringBreakdown'>) {
  const score = deterministicLeadScore(lead);
  return score === null ? null : Math.max(1, Math.min(5, Math.round(score / 20)));
}

export type LeadBand = 'hot' | 'warm' | 'nurture' | 'cold';

/** Score-band thresholds mirror backend `scoring/v2/constants.ts` (SCORE_BANDS). */
export function leadBand(score: number | null | undefined): LeadBand | null {
  if (score === null || score === undefined) return null;
  if (score >= 75) return 'hot';
  if (score >= 55) return 'warm';
  if (score >= 35) return 'nurture';
  return 'cold';
}

export const LEAD_BAND_META: Record<LeadBand, { label: string; className: string }> = {
  hot: { label: 'Hot · telepon hari ini', className: 'border-red-200 bg-red-50 text-red-700' },
  warm: { label: 'Warm · minggu ini', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  nurture: { label: 'Nurture · follow-up', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  cold: { label: 'Cold · arsip dulu', className: 'border-gray-200 bg-gray-100 text-gray-600' },
};

function hasBusinessWebsiteUrl(value: string | null | undefined) {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isOpenStreetMapUrl(trimmed)) return false;
  if (socialSourceFromUrl(trimmed)) return false;
  return true;
}

export function websiteStatusFor(
  lead: Pick<LeadListItem, 'profileUrl' | 'auditAttributes'>,
): WebsiteDisplayStatus {
  const persistedStatus = lead.auditAttributes?.websiteStatus;
  if (persistedStatus === 'has_website' || persistedStatus === 'inactive' || persistedStatus === 'parked') {
    return 'have website';
  }
  if (persistedStatus === 'no_website' || persistedStatus === 'unknown') {
    return 'dont have website';
  }
  return hasBusinessWebsiteUrl(lead.profileUrl) ? 'have website' : 'dont have website';
}

export function websiteStatusLabelFor(lead: Pick<LeadListItem, 'profileUrl' | 'auditAttributes'>) {
  return websiteStatusFor(lead) === 'have website' ? 'Have website' : 'No website';
}

export function websiteUrlFor(
  lead: Pick<LeadListItem, 'profileUrl' | 'auditAttributes'>,
) {
  return websiteStatusFor(lead) === 'have website' ? lead.profileUrl?.trim() ?? null : null;
}

export function whatsappTargetFor(
  lead: Pick<LeadListItem, 'whatsappUrl' | 'whatsappNumber' | 'publicContact'>,
) {
  const whatsappUrl = lead.whatsappUrl?.trim();
  if (whatsappUrl) return whatsappUrl;

  const digits = lead.whatsappNumber?.replace(/\D/g, '') ?? lead.publicContact?.replace(/\D/g, '');
  if (!digits) return null;

  return `https://wa.me/${digits}`;
}
