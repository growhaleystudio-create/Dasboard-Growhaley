/**
 * Pillar 3 — Reachability: "if we want to chase this lead, how?"
 *
 * Unchanged in spirit from v1 — it was already clear. A mobile/WhatsApp number
 * is the ideal channel for this market; a landline means gatekeepers.
 */

import { REACHABILITY_SCORE } from './constants.js';
import type { ContactInputV2, ContactType, ReachabilityBreakdownV2 } from './types.js';

function detectContactType(raw: string | undefined): ContactType {
  if (!raw || raw.trim().length === 0) return 'missing';
  const digits = raw.replace(/\D+/g, '');
  if (digits.length < 6) return 'invalid';
  if (digits.startsWith('08') || digits.startsWith('628') || digits.startsWith('62')) {
    return 'mobile';
  }
  return 'landline';
}

const REACHABILITY_REASON: Record<ContactType, string> = {
  mobile: 'Nomor mobile/WhatsApp aktif — bisa dihubungi langsung',
  landline: 'Hanya nomor telepon kantor — harus lewat operator',
  invalid: 'Kontak ada tapi formatnya tidak valid',
  missing: 'Tidak ada kontak yang bisa dihubungi',
};

export function computeReachability(input: ContactInputV2): ReachabilityBreakdownV2 {
  const contactType = detectContactType(input.whatsappNumber ?? input.publicContact);
  return {
    score: REACHABILITY_SCORE[contactType],
    contactType,
    reasons: [REACHABILITY_REASON[contactType]],
  };
}
