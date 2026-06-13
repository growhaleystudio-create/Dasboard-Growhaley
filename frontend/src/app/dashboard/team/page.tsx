'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { PageHeaderSkeleton, Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { useSession } from '@/lib/useSession';
import { fetchApi } from '@/lib/api';
import type { TeamMemberResponse } from '@/lib/types';
import { KeyRound, UserPlus, Users } from 'lucide-react';

export default function AccountPage() {
  const queryClient = useQueryClient();
  const { data: sessionData, isLoading: isSessionLoading } = useSession();
  const teamId = sessionData?.session.teamId;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('viewer');

  const membersQuery = useQuery({
    queryKey: ['team-members', teamId],
    queryFn: () => fetchApi<TeamMemberResponse[]>(`/api/teams/${teamId}/members`),
    enabled: !!teamId,
  });

  const createMemberMutation = useMutation({
    mutationFn: () =>
      fetchApi<TeamMemberResponse>(`/api/teams/${teamId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email, password, role }),
      }),
    onSuccess: () => {
      setEmail('');
      setPassword('');
      setRole('viewer');
      void queryClient.invalidateQueries({ queryKey: ['team-members', teamId] });
    },
  });

  if (isSessionLoading) {
    return (
      <div className="flex w-full flex-col gap-5 pb-12">
        <PageHeaderSkeleton />
        <div className="grid gap-3 rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)] lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.8fr)_160px_auto]">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <section className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <tbody>
                <TableSkeleton columns={4} />
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }
  if (!teamId) return <div className="p-4 text-sm text-text-soft-400">Error: No active team session.</div>;

  return (
    <div className="flex w-full flex-col gap-5 pb-12">


      <form
        className="grid gap-3 rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)] lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.8fr)_160px_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          createMemberMutation.mutate();
        }}
      >
        <Input type="email" placeholder="user@company.com" value={email} onChange={(event) => setEmail(event.target.value)} />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          leftIcon={<KeyRound size={16} />}
        />
        <Select
          value={role}
          onChange={(event) => setRole(event.target.value)}
          options={[
            { label: 'Viewer', value: 'viewer' },
            { label: 'Member', value: 'member' },
            { label: 'Admin', value: 'admin' },
          ]}
        />
        <Button type="submit" leftIcon={<UserPlus size={16} />} disabled={!email || password.length < 8 || createMemberMutation.isPending}>
          {createMemberMutation.isPending ? 'Creating...' : 'Create'}
        </Button>
      </form>

      <section className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium text-text-strong-950">Users</h2>
          {createMemberMutation.error && <p className="text-sm text-[#fb3748]">Failed to create account.</p>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="bg-bg-weak-50 text-sm text-text-sub-600">
                <th className="rounded-l-lg px-3 py-2 font-normal">Username / Email</th>
                <th className="px-3 py-2 font-normal">Role</th>
                <th className="px-3 py-2 font-normal">Status</th>
                <th className="rounded-r-lg px-3 py-2 font-normal">User ID</th>
              </tr>
            </thead>
            <tbody>
              {membersQuery.isLoading ? (
                <TableSkeleton columns={4} />
              ) : (membersQuery.data ?? []).length === 0 ? (
                <tr><td className="px-3 py-8 text-center text-sm text-text-sub-600" colSpan={4}>No users found.</td></tr>
              ) : (
                membersQuery.data?.map((member) => (
                  <tr key={member.id} className="text-sm hover:bg-[#fcfcfd]">
                    <td className="px-3 py-3 font-medium text-text-strong-950">{member.email}</td>
                    <td className="px-3 py-3 text-text-sub-600">{member.role}</td>
                    <td className="px-3 py-3"><Badge variant="success" showDot>{member.status}</Badge></td>
                    <td className="px-3 py-3 text-xs text-text-sub-600">{member.id}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
