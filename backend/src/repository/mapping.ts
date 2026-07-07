/**
 * Database row → domain type mappers for the tenant-scoped repository
 * layer.
 *
 * Conventions:
 * - Inputs are plain rows returned by `pg` (snake_case) and are typed via
 *   row-shape interfaces local to this module. We never trust the runtime
 *   structure: each mapper extracts only the fields it needs.
 * - Outputs are the canonical domain types from `@leads-generator/shared`,
 *   in camelCase, with `Date` instances for timestamps.
 * - Mappers are intentionally thin and contain no business logic. Default
 *   handling for nullable/optional fields lives here so repository methods
 *   stay focused on SQL.
 *
 * Design references:
 * - design.md → Data Models → Skema PostgreSQL (column names)
 * - design.md → Components and Interfaces (domain shapes)
 */

import type {
  AIState,
  AIUnavailableReason,
  ConnectorDescriptor,
  ConnectorStatus,
  Lead,
  LeadAuditAttributes,
  LeadScoreBreakdown,
  LeadStatus,
  WhatsAppVerificationStatus,
  Membership,
  MembershipStatus,
  Role,
  ScanConfiguration,
  ScanJob,
  ScanJobStatus,
  ScanSummary,
  ScoringFactor,
  ScoringModel,
  UsagePolicy,
} from '@leads-generator/shared';

// ─────────────────────────────────────────────────────────────────────────
// Row shapes — describe only the columns each mapper consumes.
// ─────────────────────────────────────────────────────────────────────────

/** Row shape returned by `SELECT … FROM lead`. */
export interface LeadRow {
  id: string;
  team_id: string;
  name: string | null;
  public_contact: string | null;
  profile_url: string | null;
  location: string | null;
  whatsapp_url: string | null;
  whatsapp_number: string | null;
  whatsapp_verification_status: WhatsAppVerificationStatus;
  matched_keywords: string[] | null;
  status: LeadStatus;
  score: number | null;
  score_state: 'scored' | 'unscored';
  audit_attributes: LeadAuditAttributes | string | null;
  is_duplicate: boolean;
  duplicate_of: string | null;
  discovered_at: Date | string;
  acquired_source: string | null;
  acquired_at: Date | string | null;
  ai_intent_score: number | null;
  ai_insight: string | null;
  ai_state: AIState | null;
  ai_unavailable_reason: AIUnavailableReason | null;
  ai_analyzed_at: Date | string | null;
  created_at: Date | string;
}

export interface LeadScoreBreakdownRow {
  lead_id: string;
  team_id: string;
  scoring_version: string;
  has_website: boolean;
  business_value_score: number;
  website_need_score: number;
  reachability_score: number;
  confidence_score: number;
  confidence_modifier: number | string;
  base_score: number;
  final_score: number;
  audit_source: 'custom-parser' | null;
  computed_at: Date | string;
}

/** Row shape returned by `SELECT … FROM scan_configuration`. */
export interface ScanConfigurationRow {
  id: string;
  team_id: string;
  keywords: string[];
  niche: string | null;
  location: string | null;
  source_ids: string[];
  schedule_interval_minutes: number | null;
  ai_enabled: boolean;
  created_at: Date | string;
}

/** Row shape returned by `SELECT … FROM scan_job`. */
export interface ScanJobRow {
  id: string;
  team_id: string;
  configuration_id: string;
  trigger: 'manual' | 'scheduled';
  status: ScanJobStatus;
  summary: ScanSummary | string | null;
  started_at: Date | string;
  finished_at: Date | string | null;
}

/** Row shape returned by `SELECT … FROM team_connector`. */
export interface TeamConnectorRow {
  team_id: string;
  source_id: string;
  status: ConnectorStatus;
  unavailable_reason: string | null;
  // `encrypted_credentials` is intentionally NOT consumed here.
  // Reading credential plaintext is the exclusive responsibility of the
  // Credential_Vault module (Task 6.1, R3.4).
  usage_policy: UsagePolicy | string | null;
  display_name?: string | null;
}

/** Row shape returned by `SELECT … FROM scoring_model`. */
export interface ScoringModelRow {
  team_id: string;
  version: number;
  factors: ScoringFactor[] | string;
}

/** Row shape returned by `SELECT … FROM user_membership`. */
export interface MembershipRow {
  team_id: string;
  user_id: string;
  role: Role;
  status: MembershipStatus;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Coerce a `Date | string | null | undefined` value into a `Date`.
 *
 * `pg` returns `timestamptz` columns as JavaScript `Date` instances by
 * default but tests and JSON round-trips can hand back ISO strings — we
 * accept either.
 */
function toDate(value: Date | string): Date;
function toDate(value: Date | string | null | undefined): Date | undefined;
function toDate(value: Date | string | null | undefined): Date | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return value instanceof Date ? value : new Date(value);
}

/**
 * Parse a JSONB column that may already be deserialized by `pg` (object) or
 * arrive as a string (e.g. when the row originated from an outer query).
 */
function parseJson<T>(value: T | string | null | undefined, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────
// Mappers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Map a `lead` row to a {@link Lead}. Coerces date columns, leaves nulls
 * intact for nullable score fields, and applies safe defaults for AI
 * lifecycle columns when the row originated from a legacy / partial select.
 */
export function mapLeadRow(row: LeadRow): Lead {
  const lead: Lead = {
    id: row.id,
    teamId: row.team_id,
    matchedKeywords: row.matched_keywords ?? [],
    status: row.status,
    whatsappVerificationStatus: row.whatsapp_verification_status,
    // `score === null` indicates 'unscored' (R7.8); preserve null explicitly.
    score: row.score === null ? null : Number(row.score),
    scoreState: row.score_state,
    isDuplicate: row.is_duplicate,
    discoveredAt: toDate(row.discovered_at),
    aiIntentScore: row.ai_intent_score === null ? null : Number(row.ai_intent_score),
    aiState: row.ai_state ?? 'none',
    createdAt: toDate(row.created_at),
  };

  if (row.name !== null) lead.name = row.name;
  if (row.public_contact !== null) lead.publicContact = row.public_contact;
  if (row.profile_url !== null) lead.profileUrl = row.profile_url;
  if (row.location !== null) lead.location = row.location;
  if (row.whatsapp_url !== null) lead.whatsappUrl = row.whatsapp_url;
  if (row.whatsapp_number !== null) lead.whatsappNumber = row.whatsapp_number;
  const auditAttributes = parseJson<LeadAuditAttributes | null>(row.audit_attributes, null);
  if (auditAttributes !== null) lead.auditAttributes = auditAttributes;
  if (row.duplicate_of !== null) lead.duplicateOf = row.duplicate_of;
  if (row.acquired_source !== null) lead.acquiredSource = row.acquired_source;
  const acquiredAt = toDate(row.acquired_at);
  if (acquiredAt) lead.acquiredAt = acquiredAt;
  if (row.ai_insight !== null) lead.aiInsight = row.ai_insight;
  if (row.ai_unavailable_reason !== null) {
    lead.aiUnavailableReason = row.ai_unavailable_reason;
  }
  const aiAnalyzedAt = toDate(row.ai_analyzed_at);
  if (aiAnalyzedAt) lead.aiAnalyzedAt = aiAnalyzedAt;

  return lead;
}

/**
 * Map a `scan_configuration` row to a {@link ScanConfiguration}.
 */
export function mapScanConfigurationRow(row: ScanConfigurationRow): ScanConfiguration {
  const config: ScanConfiguration & { createdAt?: Date } = {
    id: row.id,
    teamId: row.team_id,
    keywords: row.keywords,
    sourceIds: row.source_ids,
    aiEnabled: row.ai_enabled,
  };
  if (row.niche !== null) config.niche = row.niche;
  if (row.location !== null) config.location = row.location;
  if (row.schedule_interval_minutes !== null) {
    config.schedule = { intervalMinutes: row.schedule_interval_minutes };
  }
  if (row.created_at !== undefined) {
    config.createdAt = toDate(row.created_at);
  }
  return config;
}

/**
 * Map a `scan_job` row to a {@link ScanJob}. Parses the `summary` jsonb
 * column into a {@link ScanSummary}, applying empty-summary defaults when
 * the column is null/missing so callers always see a fully shaped object.
 */
export function mapScanJobRow(row: ScanJobRow): ScanJob {
  const emptySummary: ScanSummary = {
    newLeads: 0,
    duplicateLeads: 0,
    excludedSources: [],
    connectorResults: [],
  };
  const summary = parseJson<ScanSummary>(row.summary, emptySummary);

  const job: ScanJob = {
    id: row.id,
    teamId: row.team_id,
    configurationId: row.configuration_id,
    trigger: row.trigger,
    status: row.status,
    startedAt: toDate(row.started_at),
    summary: {
      newLeads: summary.newLeads ?? 0,
      duplicateLeads: summary.duplicateLeads ?? 0,
      excludedSources: summary.excludedSources ?? [],
      connectorResults: summary.connectorResults ?? [],
    },
  };
  const finishedAt = toDate(row.finished_at);
  if (finishedAt) job.finishedAt = finishedAt;
  return job;
}

/**
 * Map a `team_connector` row to a public-facing {@link ConnectorDescriptor}.
 *
 * The encrypted credential blob is deliberately not exposed here — it is
 * read exclusively by the Credential_Vault module (Task 6.1, R3.4).
 */
export function mapTeamConnectorRow(row: TeamConnectorRow): ConnectorDescriptor {
  const descriptor: ConnectorDescriptor = {
    sourceId: row.source_id,
    displayName: row.display_name ?? row.source_id,
    status: row.status,
  };
  if (row.unavailable_reason !== null) {
    descriptor.unavailableReason = row.unavailable_reason;
  }
  const policy = parseJson<UsagePolicy | null>(row.usage_policy, null);
  if (policy !== null) descriptor.usagePolicy = policy;
  return descriptor;
}

/**
 * Map a `scoring_model` row to a {@link ScoringModel}. Parses the
 * `factors` jsonb column into a {@link ScoringFactor} array.
 */
export function mapScoringModelRow(row: ScoringModelRow): ScoringModel {
  const factors = parseJson<ScoringFactor[]>(row.factors, []);
  return {
    teamId: row.team_id,
    version: row.version,
    factors,
  };
}

/**
 * Map a `user_membership` row to a {@link Membership}.
 */
export function mapLeadScoreBreakdownRow(row: LeadScoreBreakdownRow): LeadScoreBreakdown {
  const breakdown: LeadScoreBreakdown = {
    teamId: row.team_id,
    leadId: row.lead_id,
    scoringVersion: row.scoring_version,
    hasWebsite: row.has_website,
    businessValueScore: Number(row.business_value_score),
    websiteNeedScore: Number(row.website_need_score),
    reachabilityScore: Number(row.reachability_score),
    confidenceScore: Number(row.confidence_score),
    confidenceModifier: Number(row.confidence_modifier),
    baseScore: Number(row.base_score),
    finalScore: Number(row.final_score),
    computedAt: toDate(row.computed_at),
  };
  if (row.audit_source !== null) breakdown.auditSource = row.audit_source;
  return breakdown;
}

export function mapMembershipRow(row: MembershipRow): Membership {
  return {
    teamId: row.team_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
  };
}
