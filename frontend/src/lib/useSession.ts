import { useQuery } from '@tanstack/react-query';
import { fetchApi } from './api';

export interface SessionResponse {
  session: {
    userId: string;
    email: string | null;
    teamId: string;
    role: string;
    createdAt?: string;
    lastActivityAt?: string;
  };
}

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const res = await fetchApi<SessionResponse>('/api/auth/session');
      if (res?.session && typeof window !== 'undefined') {
        localStorage.setItem('auth_session', JSON.stringify(res.session));
      }
      return res;
    },
    initialData: () => {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('auth_session');
        if (cached) {
          try {
            return { session: JSON.parse(cached) };
          } catch {
            // ignore
          }
        }
      }
      return undefined;
    },
    staleTime: 1000 * 60 * 5,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: false,
  });
}
