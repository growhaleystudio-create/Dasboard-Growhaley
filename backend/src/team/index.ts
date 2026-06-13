/**
 * Barrel for the Team_Service module.
 *
 * Re-exports the invitation persistence layer and the domain service that
 * drives the invite-only flow added by Task 5.1 (R2.1, R2.9), the
 * acceptance flow added by Task 5.3 (R2.2, R2.10), and the role-change
 * flow added by Task 5.3 (R2.3).
 *
 * Design refs: design.md → Components and Interfaces → Team_Service.
 */

export {
  InvitationRepository,
  type InvitationRow,
} from './invitation-repository.js';
export {
  TeamService,
  INVITATION_TTL_HOURS,
  MAX_EMAIL_LENGTH,
  type AcceptInvitationInput,
} from './team-service.js';
