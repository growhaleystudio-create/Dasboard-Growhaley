/**
 * RBAC permission matrix and guard for the leads-generator-dashboard
 * feature.
 *
 * Mirrors the matrix declared in design.md (Components and Interfaces →
 * Auth/RBAC Guard & Tenant Guard, R2.4–R2.7). The `RBAC_MATRIX` constant
 * is the single source of truth: `RBACGuard.can(role, action)` is a thin
 * lookup that defaults to **deny** for any action absent from the matrix
 * (defense in depth — an unknown action is never authorized).
 *
 * Per design note R2.5, Viewer reads (`lead.read`) are allowed regardless
 * of membership `status` (i.e. even while `pending`); membership status is
 * therefore deliberately **not** an input here. Status checks live with
 * the membership/session layer.
 *
 * The AI rows (`ai.configure`, `ai.enable_scan`, `ai.reanalyze`,
 * `ai.read_insight`) implement R13's authorization rules: Admin-only for
 * `ai.configure`; Admin + Member for `ai.enable_scan` and `ai.reanalyze`;
 * all roles (including Viewer) for `ai.read_insight`. Owned by Task 17.3.
 */

import type { Action, Role } from '@leads-generator/shared';

/**
 * Static permission matrix. Each row maps a `Role` to a boolean
 * indicating whether that role is permitted to perform the `Action`.
 * Frozen at the type level via `Readonly<…>` to discourage mutation.
 */
export const RBAC_MATRIX: Readonly<Record<Action, Readonly<Record<Role, boolean>>>> = {
  // R2.4–R2.7: read is granted to every role; the Viewer-pending case is
  // covered by R2.5 and lives in the membership layer (see header note).
  'lead.read': { admin: true, member: true, viewer: true },

  // Write-shaped actions: Admin and Member yes, Viewer no.
  'lead.write': { admin: true, member: true, viewer: false },
  'lead.status.change': { admin: true, member: true, viewer: false },
  'lead.whatsapp_verification.change': { admin: true, member: true, viewer: false },
  'note.write': { admin: true, member: true, viewer: false },
  'tag.write': { admin: true, member: true, viewer: false },
  'lead.delete': { admin: true, member: true, viewer: false },

  // Scan execution: Admin and Member.
  'scan.execute': { admin: true, member: true, viewer: false },

  // Privileged operations restricted to Admin.
  'export.run': { admin: true, member: false, viewer: false },
  'team.manage': { admin: true, member: false, viewer: false },
  'connector.manage': { admin: true, member: false, viewer: false },

  // AI matrix rows (R13) — owned by Task 17.3.
  // - `ai.configure` is Admin-only (R13.18 — only Admins toggle the
  //   per-team AI feature flag and credentials).
  // - `ai.enable_scan` and `ai.reanalyze` are Admin + Member (R13.4,
  //   R13.16, R13.17 — both roles can opt scans into AI enrichment and
  //   trigger lead reanalysis).
  // - `ai.read_insight` is granted to every role (R13.11 — Viewers may
  //   read AI-generated insights alongside the lead they can already
  //   read).
  'ai.configure': { admin: true, member: false, viewer: false }, // R13.18
  'ai.enable_scan': { admin: true, member: true, viewer: false }, // R13.4
  'ai.reanalyze': { admin: true, member: true, viewer: false }, // R13.16, R13.17
  'ai.read_insight': { admin: true, member: true, viewer: true }, // R13.11

  // Content carousel rows (R14, R2, R8) — introduced by Task 1.1.
  // - `content.manage` covers CRUD on Master_Template and related
  //   content objects; Admin-only to match the design's Admin privilege for
  //   configuration actions (R2.1, R14.2).
  // - `content.generate` covers triggering a content generation Job; Admin +
  //   Member (R8.1 — both roles can generate content).
  'content.manage': { admin: true, member: false, viewer: false }, // R2.1, R14.2
  'content.generate': { admin: true, member: true, viewer: false }, // R8.1

  // Survey module rows (Quantitative Research Survey V1).
  'survey.read': { admin: true, member: true, viewer: true },
  'survey.write': { admin: true, member: true, viewer: false },
  'survey.publish': { admin: true, member: true, viewer: false },
  'survey.analyze': { admin: true, member: true, viewer: false },
  'survey.export': { admin: true, member: false, viewer: false },
};

/**
 * Authorization decision contract from design.md. Implementations are
 * pure: same `(role, action)` always yields the same boolean.
 */
export interface RBACGuard {
  /** True iff `role` may perform `action`. Unknown actions return false. */
  can(role: Role, action: Action): boolean;
}

/**
 * Default `RBACGuard` backed by `RBAC_MATRIX`. Returns `false` for any
 * action not present in the matrix, so adding a new `Action` to the
 * shared type without a corresponding row is fail-safe.
 */
export const rbacGuard: RBACGuard = {
  can(role, action) {
    const row = RBAC_MATRIX[action];
    return row ? row[role] === true : false;
  },
};
