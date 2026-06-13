import type { SessionResponse } from './useSession';

type Session = SessionResponse['session'] | undefined;

function titleCase(value: string) {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

export function getRoleLabel(role: string | undefined) {
  if (!role) return 'Workspace Member';
  const normalized = role.toLowerCase();
  if (normalized === 'admin') return 'Administrator';
  if (normalized === 'member') return 'Team Member';
  if (normalized === 'viewer') return 'Viewer';
  return titleCase(role);
}

export function getSessionProfile(session: Session) {
  const email = session?.email ?? undefined;
  const emailName = email?.split('@')[0];
  const name = emailName ? titleCase(emailName) : 'Workspace User';
  const position = getRoleLabel(session?.role);
  const teamLabel = session?.teamId ? `Team ${session.teamId.slice(0, 8)}` : 'Connected workspace';

  return {
    email: email ?? 'No email available',
    name,
    position,
    teamLabel,
  };
}
