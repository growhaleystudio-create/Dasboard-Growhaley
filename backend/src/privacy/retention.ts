/**
 * Pure eligibility logic for the Retention_Worker (R11.7).
 *
 * Design references:
 * - design.md → Privacy_Service, Audit_Log, Retention_Worker (R11):
 *   `interface Retention_Worker { sweep(): Promise<void>; } // R11.7 hapus
 *   <=24 jam setelah retensi terlampaui`.
 * - design.md → Privacy → "Retensi otomatis" (R11.7): "`Retention_Worker`
 *   menyapu Lead yang melampaui `data_retention_days` dan menghapus dalam
 *   ≤ 24 jam setelahnya, mencatat ke Audit_Log".
 * - requirements.md R11.7: "WHEN Personal_Data sebuah Lead telah tersimpan
 *   melebihi Data_Retention_Period Team, THE System SHALL menghapus
 *   Personal_Data tersebut secara otomatis dalam waktu paling lama 24 jam
 *   setelah Data_Retention_Period terlampaui …".
 *
 * Everything in this file is intentionally pure and deterministic — given
 * the same inputs it always returns the same answer with no I/O — so the
 * "which Leads have expired?" decision can be exhaustively property-tested
 * in isolation from the database (see Property 31). The worker
 * (`retention-worker.ts`) layers the side effects (clear + audit) on top.
 *
 * Eligibility rule
 * ----------------
 * A Lead's retention window is `data_retention_days` (a Team-level
 * setting). The Lead is eligible for retention deletion once its stored age
 * has *exceeded* — strictly — that window:
 *
 *     now - acquiredAt > retentionDays * MS_PER_DAY
 *
 * The comparison is strict (`>`): a Lead whose age is exactly equal to the
 * window has not yet *exceeded* it ("melebihi"), so it is retained until the
 * next sweep tips it over. This matches the wording of R11.7 ("tersimpan
 * melebihi Data_Retention_Period").
 */

/** Milliseconds in one day — the unit `data_retention_days` is expressed in. */
const MS_PER_DAY = 86_400_000;

/**
 * A minimal projection of a Lead needed to decide retention eligibility.
 * `acquiredAt` is the moment the Personal_Data entered the System (R11.2);
 * Leads with a null `acquired_at` have no retention clock and are excluded
 * upstream by the candidate query.
 */
export interface RetentionCandidate {
  readonly leadId: string;
  readonly acquiredAt: Date;
}

/**
 * True when a Lead acquired at `acquiredAt` has been stored longer than its
 * Team's retention window as measured at `now`.
 *
 * Pure & deterministic. Uses strict `>` so a Lead exactly at the boundary is
 * not yet eligible (see file header). A non-finite `acquiredAt`/`now`
 * (`NaN` time) yields `false` — such a Lead is treated as not-yet-eligible
 * rather than being deleted on the strength of an unusable timestamp.
 */
export function isRetentionEligible(
  acquiredAt: Date,
  retentionDays: number,
  now: Date,
): boolean {
  const acquiredMs = acquiredAt.getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(acquiredMs) || !Number.isFinite(nowMs)) return false;
  return nowMs - acquiredMs > retentionDays * MS_PER_DAY;
}

/**
 * Filter `candidates` to the ids of those eligible for retention deletion at
 * `now` (i.e. age strictly exceeding `retentionDays`). Order is preserved
 * from the input; ineligible candidates are dropped.
 *
 * Pure & deterministic — the returned list depends only on the arguments.
 */
export function selectExpired(
  candidates: readonly RetentionCandidate[],
  retentionDays: number,
  now: Date,
): string[] {
  const expired: string[] = [];
  for (const candidate of candidates) {
    if (isRetentionEligible(candidate.acquiredAt, retentionDays, now)) {
      expired.push(candidate.leadId);
    }
  }
  return expired;
}
