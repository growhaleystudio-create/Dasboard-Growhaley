/**
 * Barrel for the Lead_Manager module (R8).
 *
 * Exposes the {@link ActivityRepository} (Activity_Log persistence, R8.2),
 * the {@link NoteRepository} (follow-up note persistence, R8.3/R8.4), and
 * the {@link LeadManager} domain service (`changeStatus` R8.2, `addNote`
 * R8.3/R8.4, `deleteLead` R8.5–R8.7).
 */

export { ActivityRepository, type ActivityRow } from './activity-repository.js';
export { NoteRepository, type NoteRow } from './note-repository.js';
export {
  LeadManager,
  NOTE_MIN_LENGTH,
  NOTE_MAX_LENGTH,
  type LeadManagerDeps,
  type LeadStatusStore,
  type ActivityWriter,
  type NoteWriter,
  type AuditWriter,
  type Note,
} from './lead-manager.js';
