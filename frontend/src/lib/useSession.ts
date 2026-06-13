import { useQuery } from '@tanstack/react-query';
import { fetchApi } from './api';

export interface SessionResponse {
  session: {
    userId: string;
    email: string | null;
    teamId: string;
    role: string;
    createdAt: string;
    lastActivityAt: string;
  };
}

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => fetchApi<SessionResponse>('/api/auth/session'),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: false,
  });
}
