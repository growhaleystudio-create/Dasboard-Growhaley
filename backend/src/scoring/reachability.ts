import type { LeadOpportunityScoringInput, ReachabilityBreakdown } from './types.js';

function detectContactType(raw: string | undefined): ReachabilityBreakdown['contactType'] {
  if (!raw || raw.trim().length === 0) return 'missing';
  const digits = raw.replace(/\D+/g, '');
  if (digits.length < 6) return 'invalid';
  if (digits.startsWith('08') || digits.startsWith('628') || digits.startsWith('62')) {
    return 'mobile';
  }
  return 'landline';
}

export function computeReachability(input: LeadOpportunityScoringInput): ReachabilityBreakdown {
  const contactType = detectContactType(input.whatsappNumber ?? input.publicContact);

  const score =
    contactType === 'mobile'
      ? 100
      : contactType === 'landline'
        ? 60
        : contactType === 'invalid'
          ? 20
          : 0;

  return { score, contactType };
}
