'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { PageHeaderSkeleton, Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { Table, TableHeader, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { useSession } from '@/lib/useSession';
import { fetchApi } from '@/lib/api';
import type { TeamMemberResponse } from '@/lib/types';
import { KeyRound, UserPlus, Users, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';

export default function AccountPage() {
  const queryClient = useQueryClient();
  const { data: sessionData, isLoading: isSessionLoading } = useSession();
  const teamId = sessionData?.session.teamId;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('viewer');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

  const membersQuery = useQuery({
    queryKey: ['team-members', teamId],
    queryFn: () => fetchApi<TeamMemberResponse[]>(`/api/teams/${teamId}/members`),
    enabled: !!teamId,
  });

  const filteredMembers = React.useMemo(() => {
    return (membersQuery.data ?? []).filter((member) => {
      const emailMatch = member.email.toLowerCase().includes(search.toLowerCase());
      const roleMatch = roleFilter === 'All' || member.role === roleFilter;
      return emailMatch && roleMatch;
    });
  }, [membersQuery.data, search, roleFilter]);

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
        <div className="grid gap-3 rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-none lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.8fr)_160px_auto]">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <section className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-none">
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-6 w-24" />
          </div>
          <Table className="border-0 shadow-none">
            <tbody>
              <TableSkeleton columns={4} />
            </tbody>
          </Table>
        </section>
      </div>
    );
  }
  if (!teamId) return <div className="p-4 text-sm text-text-soft-400">Error: No active team session.</div>;

  return (
    <div className="flex w-full flex-col gap-5 pb-12">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Team Members"
          description="Manage your team accounts, roles, and access permissions."
        />

        <form
          className="grid gap-3 rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4 shadow-none lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.8fr)_160px_auto]"
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
      </div>

      {/* Table Area */}
      <div className="mt-2 flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-[320px]">
            <Input
              placeholder="Search members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search size={16} />}
            />
          </div>
          <Select
            value={roleFilter}
            wrapperClassName="w-full sm:w-[160px]"
            onChange={(e) => setRoleFilter(e.target.value)}
            options={[
              { label: 'All roles', value: 'All' },
              { label: 'Admin', value: 'admin' },
              { label: 'Member', value: 'member' },
              { label: 'Viewer', value: 'viewer' },
            ]}
          />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username / Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>User ID</TableHead>
            </TableRow>
          </TableHeader>
          <tbody>
            {membersQuery.isLoading ? (
              <TableSkeleton columns={4} />
            ) : filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-text-sub-600">
                  No users found matching your search.
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium text-text-strong-950">{member.email}</TableCell>
                  <TableCell className="text-text-sub-600 capitalize">{member.role}</TableCell>
                  <TableCell><Badge variant="success" showDot>{member.status}</Badge></TableCell>
                  <TableCell className="text-xs text-text-sub-600">{member.id}</TableCell>
                </TableRow>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
