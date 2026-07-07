'use client';

import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, CheckCircle2, XCircle } from 'lucide-react';
import { Heading, Text } from '@/components/ui/Typography';
import { fetchApi } from '@/lib/api';
import type { AppError } from '@/lib/api';
import type { SessionResponse } from '@/lib/useSession';
import { AuthForm } from '@/components/ui/AuthForm';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      return fetchApi<{ message: string; session: SessionResponse['session'] }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
    },
    onSuccess: (data) => {
      queryClient.clear();
      queryClient.setQueryData<SessionResponse>(['session'], { session: data.session });
      router.replace('/dashboard');
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    
    if (email && password) {
      loginMutation.mutate({ email, password });
    }
  };

  return (
    <main className="min-h-screen bg-bg-white-0 p-4 lg:p-0">
      <div className="mx-auto flex min-h-[calc(100vh-32px)] w-full max-w-[1440px] overflow-hidden rounded-3xl bg-bg-white-0 lg:min-h-screen lg:rounded-none">
        
        {/* Left Side: Login Form using VOIT DS */}
        <section className="relative flex min-w-0 w-full flex-col px-6 py-6 sm:px-10 lg:w-[42.25%] lg:px-11">
          <div className="flex items-center">
            <div className="flex items-center gap-[8.139px]">
              <img src="/figma/logo.svg" alt="" className="size-[50.871px] object-contain" />
              <Text as="p" variant="body-m-bold" color="accent" className="leading-none">
                Growhaley
              </Text>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-start py-12 lg:justify-center">
            <div className="min-w-0 w-[400px] max-w-[calc(100vw-64px)] lg:w-full lg:max-w-[400px] relative">
              {loginMutation.error && (
                <div className="mb-5 rounded-lg border border-[#ffd5d8] bg-[#ffebec] p-3 absolute -top-16 left-0 right-0">
                  <Text variant="body-s-bold" className="text-[#cc0000]">
                    {(loginMutation.error as AppError).message || 'Failed to login'}
                  </Text>
                </div>
              )}
              
              <AuthForm 
                type="login" 
                onSubmit={handleSubmit as any} 
                className="w-full border-none shadow-none px-0"
                loading={loginMutation.isPending}
              />
            </div>
          </div>
        </section>

        {/* Right Side: Graphic presentation */}
        <aside className="relative m-2 hidden flex-1 overflow-hidden rounded-2xl bg-bg-weak-50 lg:block border border-stroke-soft-200">
          <div className="absolute inset-x-0 top-1/2 h-[340px] -translate-y-[64%] bg-[linear-gradient(to_right,rgba(235,235,235,0.55)_1px,transparent_1px),linear-gradient(to_bottom,rgba(235,235,235,0.55)_1px,transparent_1px)] bg-[size:44px_44px] opacity-60" />

          <div className="absolute left-1/2 top-[22%] w-[352px] -translate-x-1/2 rounded-2xl bg-bg-white-0 p-4 shadow-card border border-stroke-soft-200">
            <div className="mb-4 flex items-center gap-2">
              <Search className="size-5 text-text-sub-600" strokeWidth={1.75} />
              <Text as="p" variant="body-m" className="flex-1 font-semibold text-text-strong-950">
                Lead Signals
              </Text>
              <Text
                as="span"
                variant="body-s"
                className="rounded-lg border border-stroke-soft-200 px-2.5 py-1 font-semibold text-text-sub-600"
              >
                Live
              </Text>
            </div>

            <div className="border-y border-stroke-soft-200 py-7">
              <div className="mx-auto flex size-36 items-center justify-center rounded-full bg-[conic-gradient(#004CFF_0_72%,#ebebeb_72%_100%)]">
                <div className="flex size-28 flex-col items-center justify-center rounded-full bg-bg-white-0">
                  <Heading as="p" variant="h3" className="text-[32px] font-semibold leading-10 text-primary-base">
                    72
                  </Heading>
                  <Text as="p" variant="caption" color="secondary" className="font-semibold uppercase leading-4">
                    score
                  </Text>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-5 text-[#1fc16b]" />
                <span className="flex-1 text-text-strong-950 font-medium">12 qualified leads</span>
                <span className="rounded-full bg-state-success-light px-2 py-0.5 text-xs font-medium text-state-success-dark">
                  Ready
                </span>
              </div>
              <div className="h-px bg-stroke-soft-200" />
              <div className="flex items-center gap-2 text-sm">
                <Search className="size-5 text-primary-base" />
                <span className="flex-1 text-text-strong-950 font-medium">4 scans running</span>
                <span className="rounded-full bg-alpha-primary-10 px-2 py-0.5 text-xs font-medium text-primary-base">
                  Active
                </span>
              </div>
              <div className="h-px bg-stroke-soft-200" />
              <div className="flex items-center gap-2 text-sm">
                <XCircle className="size-5 text-text-soft-400" />
                <span className="flex-1 text-text-strong-950 font-medium">2 duplicates removed</span>
                <span className="rounded-full bg-bg-weak-50 px-2 py-0.5 text-xs font-medium text-text-sub-600">
                  Clean
                </span>
              </div>
            </div>
          </div>

          <div className="absolute bottom-[112px] left-1/2 flex w-full max-w-[584px] -translate-x-1/2 flex-col items-center gap-2 px-8 text-center">
            <Heading as="h2" variant="title-1" className="font-semibold text-text-strong-950">
              Stay on Top of Every Lead
            </Heading>
            <Text variant="body-m" color="secondary">
              Track qualified prospects, scan activity, and lead quality from one focused workspace.
            </Text>
          </div>

          <div className="absolute bottom-12 left-1/2 flex -translate-x-1/2 gap-2">
            <span className="size-2 rounded-full bg-primary-base" />
            <span className="size-2 rounded-full bg-stroke-soft-200" />
            <span className="size-2 rounded-full bg-stroke-soft-200" />
          </div>
        </aside>
      </div>
    </main>
  );
}
