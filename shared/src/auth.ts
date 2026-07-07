/**
 * Authentication, authorization, and membership domain types for the
 * `leads-generator-dashboard` feature.
 *
 * Mirrors the Auth_Service / Auth-RBAC Guard / Team_Service sections of
 * design.md. Pure type contracts — no runtime logic.
 */

/**
 * Role assigned to a User within a Team.
 *
 * Sumber kebenaran untuk RBAC matrix (R2.4–R2.7).
 */
export type Role = 'admin' | 'member' | 'viewer';

/**
 * Discrete authorization actions guarded by `RBAC_Guard.can(role, action)`.
 *
 * The `ai.*` actions were added by R13 to gate the Gemini-powered AI
 * enrichment workflow.
 */
export type Action =
  | 'lead.read'
  | 'lead.write'
  | 'lead.delete'
  | 'lead.status.change'
  | 'lead.whatsapp_verification.change'
  | 'note.write'
  | 'tag.write'
  | 'scan.execute'
  | 'team.manage'
  | 'connector.manage'
  | 'export.run'
  | 'ai.configure'
  | 'ai.enable_scan'
  | 'ai.reanalyze'
  | 'ai.read_insight'
  | 'content.manage'
  | 'content.generate'
  | 'survey.read'
  | 'survey.write'
  | 'survey.publish'
  | 'survey.analyze'
  | 'survey.export';

/**
 * Activation status of a User_Membership row.
 *
 * - `pending`: invitation has been issued/accepted but no join yet finalized
 *   (Viewer reads still allowed per R2.5).
 * - `active`: membership is in force.
 */
export type MembershipStatus = 'pending' | 'active';

/**
 * Authenticated session bound to a (User, Team) pair.
 *
 * `lastActivityAt` powers the 30-minute idle timeout (R1.5).
 */
export interface AuthSession {
  userId: string;
  teamId: string;
  role: Role;
  createdAt: Date;
  lastActivityAt: Date;
}

/**
 * Concrete membership of a User in a Team with a specific Role.
 */
export interface Membership {
  teamId: string;
  userId: string;
  role: Role;
  status: MembershipStatus;
}

/**
 * Pending or completed invitation to join a Team in a given Role.
 *
 * `expiresAt = createdAt + 168h` per R2.1.
 */
export interface Invitation {
  id: string;
  teamId: string;
  email: string;
  role: Role;
  status: 'pending' | 'active' | 'expired';
  createdAt: Date;
  expiresAt: Date;
}
