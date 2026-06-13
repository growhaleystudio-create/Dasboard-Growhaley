/**
 * PrivacyGuard — whitelist AI payload untuk kepatuhan privasi.
 *
 * Memastikan payload yang dikirim ke AI_Provider hanya memuat masukan
 * brand/konten yang dikehendaki dan tidak mengandung Personal_Data Lead
 * tanpa penyertaan eksplisit oleh User.
 *
 * Tanggung jawab guard ini:
 *   - Memindai `fields` payload untuk mendeteksi kunci PII yang dikenal.
 *   - Mengembalikan `err` bila PII terdeteksi AND `explicitlyIncludedByUser=false`.
 *   - Mengembalikan `ok` bila payload bersih ATAU User secara eksplisit
 *     menyertakan data tersebut.
 *
 * **Tanggung jawab CALLER (Planner, BackgroundImageClient)**:
 *   Ketika `err` dikembalikan, caller WAJIB mencatat peristiwa keamanan ke
 *   Audit_Log dengan menyertakan `teamId` dan `jobId`, namun TANPA menuliskan
 *   nilai PII aktual pada catatan tersebut — hanya nama kunci yang terdeteksi
 *   boleh dicatat (R15.4).
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4
 */

import { err, ok } from '@leads-generator/shared';
import type { Result } from '@leads-generator/shared';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AiPayload {
  /** Team identifier — dipakai caller untuk scoping audit. */
  teamId: string;
  /**
   * Koleksi field yang akan dikirim ke AI_Provider.
   * Guard memeriksa kunci dari koleksi ini (bukan nilai).
   */
  fields: Record<string, unknown>;
}

export interface PrivacyGuard {
  /**
   * Memastikan `payload.fields` tidak memuat kunci Personal_Data Lead.
   *
   * @param payload - Payload yang akan dikirim ke AI_Provider.
   * @param explicitlyIncludedByUser - `true` bila User secara eksplisit
   *   menyertakan data tersebut pada prompt (R15.2). Bila `true`, guard
   *   selalu mengembalikan `ok` tanpa memeriksa kunci.
   *
   * @returns `ok(undefined)` bila payload aman untuk dikirim.
   * @returns `err({ code: 'INTERNAL', message: 'privacy_violation: ...' })`
   *   bila kunci PII terdeteksi dan tidak disertakan secara eksplisit.
   *
   * **PENTING untuk caller**: Catat peristiwa audit ke Audit_Log (dengan
   * `teamId` + nama kunci yang terdeteksi, TANPA nilai PII) ketika `err`
   * dikembalikan (R15.4).
   */
  assertNoLeadPII(
    payload: AiPayload,
    explicitlyIncludedByUser: boolean,
  ): Result<void>;
}

// ---------------------------------------------------------------------------
// PII field key registry
// ---------------------------------------------------------------------------

/**
 * Kunci field yang mengindikasikan Personal_Data Lead.
 * Guard memblokir payload yang memuat salah satu kunci ini kecuali
 * `explicitlyIncludedByUser=true` (R15.2, R15.3).
 */
export const LEAD_PII_KEYS: ReadonlySet<string> = new Set([
  'leadName',
  'leadEmail',
  'leadContact',
  'leadPhone',
  'leadAddress',
  'leadProfileUrl',
  'personalData',
  'leadId',
  'leadData',
  // Generic PII field names that may appear in arbitrary payloads (R15.1)
  'email',
  'phoneNumber',
  'address',
]);

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class PrivacyGuardImpl implements PrivacyGuard {
  /**
   * Memindai kunci `payload.fields` terhadap daftar PII yang dikenal.
   *
   * Algoritma:
   *   1. Bila `explicitlyIncludedByUser=true` → kembalikan `ok` tanpa memeriksa.
   *   2. Kumpulkan semua kunci pada `payload.fields` yang ada di {@link LEAD_PII_KEYS}.
   *   3. Bila ada kunci yang terdeteksi → kembalikan `err` dengan pesan
   *      `privacy_violation: <key1>, <key2>, ...` (tanpa nilai).
   *   4. Bila tidak ada → kembalikan `ok`.
   */
  assertNoLeadPII(
    payload: AiPayload,
    explicitlyIncludedByUser: boolean,
  ): Result<void> {
    // R15.2: bila User secara eksplisit menyertakan data, izinkan tanpa pemeriksaan.
    if (explicitlyIncludedByUser) {
      return ok(undefined);
    }

    // Kumpulkan kunci PII yang terdeteksi (bukan nilainya — R15.4).
    const detectedKeys: string[] = [];
    for (const key of Object.keys(payload.fields)) {
      if (LEAD_PII_KEYS.has(key)) {
        detectedKeys.push(key);
      }
    }

    // R15.3: bila ada PII tanpa penyertaan eksplisit → blokir.
    if (detectedKeys.length > 0) {
      return err({
        code: 'INTERNAL' as const,
        message: `privacy_violation: ${detectedKeys.join(', ')}`,
      });
    }

    return ok(undefined);
  }
}

// ---------------------------------------------------------------------------
// Canonical export alias (matches task spec naming convention)
// ---------------------------------------------------------------------------

/**
 * `DefaultPrivacyGuard` is the canonical class name for the PrivacyGuard
 * implementation as specified in the design document. `PrivacyGuardImpl`
 * is kept as an alias for backward compatibility.
 */
export const DefaultPrivacyGuard = PrivacyGuardImpl;

// ---------------------------------------------------------------------------
// Module-level singleton — callers can import this directly instead of
// instantiating the class themselves.
// ---------------------------------------------------------------------------

/**
 * Singleton instance of {@link DefaultPrivacyGuard}.
 *
 * Usage:
 * ```ts
 * import { privacyGuardInstance } from './privacy-guard.js';
 * const result = privacyGuardInstance.assertNoLeadPII(payload, false);
 * ```
 */
export const privacyGuardInstance: PrivacyGuard = new PrivacyGuardImpl();
