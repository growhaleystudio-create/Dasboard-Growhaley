'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, Search, UserRound, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { fetchApi } from '@/lib/api';
import type { AppError } from '@/lib/api';
import type { SessionResponse } from '@/lib/useSession';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = useMutation({
    mutationFn: async () => {
      return fetchApi<{ message: string; session: SessionResponse['session'] }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
    },
    onSuccess: (data) => {
      queryClient.clear();
      queryClient.setQueryData<SessionResponse>(['session'], { session: data.session });
      router.replace('/dashboard');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  return (
    <main className="min-h-screen bg-bg-white-0 p-4 lg:p-0">
      <div className="mx-auto flex min-h-[calc(100vh-32px)] w-full max-w-[1440px] overflow-hidden rounded-3xl bg-bg-white-0 lg:min-h-screen lg:rounded-none">
        <section className="relative flex min-w-0 w-full flex-col px-6 py-6 sm:px-10 lg:w-[42.25%] lg:px-11">
          <div className="flex items-center">
            <div className="flex items-center gap-[8.139px]">
              <img src="/figma/logo.svg" alt="" className="size-[50.871px] object-contain" />
              <p className="text-[16.279px] font-bold leading-none text-[#1a7cbc]">Growhaley</p>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-start py-12 lg:justify-center">
            <div className="min-w-0 w-[320px] max-w-[calc(100vw-64px)] lg:w-full lg:max-w-[392px]">
              <div className="mb-6 flex flex-col items-center gap-2 text-center">
                <div className="mb-2 rounded-full bg-gradient-to-b from-text-soft-400/10 to-text-soft-400/0 p-4">
                  <div className="flex size-16 items-center justify-center rounded-full border border-stroke-soft-200 bg-bg-white-0 text-text-sub-600 shadow-sm">
                    <UserRound className="size-8" strokeWidth={1.75} />
                  </div>
                </div>
                <h1 className="text-2xl font-medium leading-8 text-text-strong-950">
                  Login to your account
                </h1>
                <p className="text-base leading-6 text-text-sub-600">
                  Enter your details to login.
                </p>
              </div>

              {loginMutation.error && (
                <div className="mb-5 rounded-lg border border-[#ffd5d8] bg-[#ffebec] p-3 text-sm font-medium text-[#cc0000]">
                  {(loginMutation.error as AppError).message || 'Failed to login'}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium leading-5 text-text-strong-950">
                    Email Address <span className="text-primary-base">*</span>
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    leftIcon={<Mail className="size-5" strokeWidth={1.75} />}
                    wrapperClassName="rounded-[10px] py-2.5"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium leading-5 text-text-strong-950">
                    Password <span className="text-primary-base">*</span>
                  </label>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    leftIcon={<LockKeyhole className="size-5" strokeWidth={1.75} />}
                    rightIcon={
                      <button
                        type="button"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="flex size-5 items-center justify-center text-text-soft-400 transition-colors hover:text-text-sub-600"
                        onClick={() => setShowPassword((current) => !current)}
                      >
                        {showPassword ? <EyeOff className="size-5" strokeWidth={1.75} /> : <Eye className="size-5" strokeWidth={1.75} />}
                      </button>
                    }
                    wrapperClassName="rounded-[10px] py-2.5"
                  />
                </div>

                <div className="flex flex-col items-start gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <label className="flex min-w-0 items-center gap-2 text-sm leading-5 text-text-strong-950">
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 rounded border-stroke-soft-200 text-primary-base accent-primary-base"
                    />
                    <span className="truncate">Keep me logged in</span>
                  </label>
                  <button
                    type="button"
                    className="shrink-0 text-sm font-medium leading-5 text-text-sub-600 underline underline-offset-2 transition-colors hover:text-primary-base"
                  >
                    Forgot password?
                  </button>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="mt-2 w-full rounded-[10px]"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? 'Logging in...' : 'Login'}
                </Button>
              </form>
            </div>
          </div>
        </section>

        <aside className="relative m-2 hidden flex-1 overflow-hidden rounded-2xl bg-bg-weak-50 lg:block">
          <div className="absolute inset-x-0 top-1/2 h-[340px] -translate-y-[64%] bg-[linear-gradient(to_right,rgba(235,235,235,0.55)_1px,transparent_1px),linear-gradient(to_bottom,rgba(235,235,235,0.55)_1px,transparent_1px)] bg-[size:44px_44px] opacity-60" />

          <div className="absolute left-1/2 top-[22%] w-[352px] -translate-x-1/2 rounded-2xl bg-bg-white-0 p-4 shadow-card">
            <div className="mb-4 flex items-center gap-2">
              <Search className="size-5 text-text-sub-600" strokeWidth={1.75} />
              <p className="flex-1 text-base font-medium leading-6 text-text-strong-950">
                Lead Signals
              </p>
              <span className="rounded-lg border border-stroke-soft-200 px-2.5 py-1 text-sm font-medium text-text-sub-600">
                Live
              </span>
            </div>

            <div className="border-y border-stroke-soft-200 py-7">
              <div className="mx-auto flex size-36 items-center justify-center rounded-full bg-[conic-gradient(#187DB4_0_72%,#ebebeb_72%_100%)]">
                <div className="flex size-28 flex-col items-center justify-center rounded-full bg-bg-white-0">
                  <p className="text-[32px] font-medium leading-10 text-text-strong-950">72</p>
                  <p className="text-xs font-medium uppercase leading-4 text-text-sub-600">score</p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-5 text-[#1fc16b]" />
                <span className="flex-1 text-text-strong-950">12 qualified leads</span>
                <span className="rounded-full bg-state-success-light px-2 py-0.5 text-xs font-medium text-state-success-dark">
                  Ready
                </span>
              </div>
              <div className="h-px bg-stroke-soft-200" />
              <div className="flex items-center gap-2 text-sm">
                <Search className="size-5 text-primary-base" />
                <span className="flex-1 text-text-strong-950">4 scans running</span>
                <span className="rounded-full bg-alpha-primary-10 px-2 py-0.5 text-xs font-medium text-primary-base">
                  Active
                </span>
              </div>
              <div className="h-px bg-stroke-soft-200" />
              <div className="flex items-center gap-2 text-sm">
                <XCircle className="size-5 text-text-soft-400" />
                <span className="flex-1 text-text-strong-950">2 duplicates removed</span>
                <span className="rounded-full bg-bg-weak-50 px-2 py-0.5 text-xs font-medium text-text-sub-600">
                  Clean
                </span>
              </div>
            </div>
          </div>

          <div className="absolute bottom-[112px] left-1/2 flex w-full max-w-[584px] -translate-x-1/2 flex-col items-center gap-2 px-8 text-center">
            <h2 className="text-2xl font-medium leading-8 text-text-strong-950">
              Stay on Top of Every Lead
            </h2>
            <p className="text-base leading-6 text-text-sub-600">
              Track qualified prospects, scan activity, and lead quality from one focused workspace.
            </p>
          </div>

          <div className="absolute bottom-12 left-1/2 flex -translate-x-1/2 gap-2">
            <span className="size-2 rounded-full bg-primary-base" />
            <span className="size-2 rounded-full bg-neutral-gray-200" />
            <span className="size-2 rounded-full bg-neutral-gray-200" />
          </div>
        </aside>
      </div>
    </main>
  );
}
