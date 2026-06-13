'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import {
  Bell,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  ScanLine,
  Sparkles,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppError, AUTH_UNAUTHORIZED_EVENT, fetchApi } from '@/lib/api';
import { getSessionProfile } from '@/lib/sessionProfile';
import { useSession } from '@/lib/useSession';

const navSections = [
  {
    label: 'Overview',
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Lead',
    items: [
      { href: '/dashboard/leads', label: 'Leads', icon: Users },
      { href: '/dashboard/scans', label: 'Scan Leads', icon: ScanLine },
    ],
  },
  {
    label: 'Content & AI',
    items: [
      { href: '/dashboard/content', label: 'Content Generator', icon: Sparkles },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/dashboard/team', label: 'Account', icon: Users },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
];

function pageTitleFor(pathname: string | null | undefined) {
  if (pathname === '/dashboard') {
    return { title: 'Dashboard', subtitle: 'Overview of leads, progress, and recent activity.' };
  }
  if (pathname?.startsWith('/dashboard/leads')) {
    return { title: 'Leads', subtitle: 'Manage and track potential clients from your scans.' };
  }
  if (pathname?.startsWith('/dashboard/scans') || pathname?.startsWith('/dashboard/scan-leads')) {
    return { title: 'Scan Leads', subtitle: 'Configure and trigger lead generation scans.' };
  }
  if (pathname?.startsWith('/dashboard/content')) {
    return { title: 'AI Content Generator', subtitle: 'Carousel social content workspace.' };
  }
  if (pathname?.startsWith('/dashboard/team')) {
    return { title: 'Account', subtitle: 'Manage team members, roles, and access.' };
  }
  if (pathname?.startsWith('/dashboard/settings')) {
    return { title: 'Settings', subtitle: 'Configure AI keys, models, and workflow preferences.' };
  }
  if (pathname?.startsWith('/dashboard/connectors')) {
    return { title: 'Connectors', subtitle: 'Connect and manage lead source integrations.' };
  }
  if (pathname?.startsWith('/dashboard/metrics')) {
    return { title: 'Metrics', subtitle: 'Monitor lead generation performance.' };
  }
  return { title: 'Dashboard', subtitle: 'Growhaley workspace.' };
}

function BrandMark() {
  return (
    <div className="relative size-[50.871px] shrink-0 overflow-hidden">
      <img src="/figma/logo.svg" alt="" className="size-full object-contain" />
    </div>
  );
}

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-[8.139px]">
      <BrandMark />
      {!compact && (
        <p className="shrink-0 text-[16.279px] font-bold leading-none text-[#1a7cbc]">
          Growhaley
        </p>
      )}
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="relative size-8 shrink-0 overflow-hidden rounded-full bg-[#ffecc0]">
      <img src="/figma/avatar.png" alt="" className="size-full object-cover" />
    </div>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    data: sessionData,
    error: sessionError,
    isFetchedAfterMount: isSessionFetchedAfterMount,
    isLoading: isSessionLoading,
  } = useSession();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = React.useState(false);
  const [isAuthRedirecting, setIsAuthRedirecting] = React.useState(false);
  const profile = getSessionProfile(sessionData?.session);
  const pageTitle = pageTitleFor(pathname);
  const mobileNavItems = navSections.flatMap((section) => section.items);
  const logoutMutation = useMutation({
    mutationFn: () => fetchApi<{ message: string }>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear();
      router.replace('/login');
    },
  });

  const redirectToLogin = React.useCallback(() => {
    setIsAuthRedirecting(true);
    queryClient.clear();
    router.replace('/login');
  }, [queryClient, router]);

  React.useEffect(() => {
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, redirectToLogin);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, redirectToLogin);
  }, [redirectToLogin]);

  React.useEffect(() => {
    if (sessionError instanceof AppError && sessionError.status === 401) {
      redirectToLogin();
    }
  }, [redirectToLogin, sessionError]);

  const shouldBlockChildren =
    isAuthRedirecting ||
    isSessionLoading ||
    !isSessionFetchedAfterMount ||
    !sessionData?.session ||
    (sessionError instanceof AppError && sessionError.status === 401);

  return (
    <div className="flex min-h-dvh bg-bg-white-0 md:h-screen md:overflow-hidden">
      <aside className="hidden w-[272px] shrink-0 flex-col bg-bg-white-0 md:flex">
        <div className="relative flex w-[272px] items-center justify-center bg-bg-white-0 p-3">
          <div className="flex w-[248px] items-center gap-3 rounded-ui bg-bg-white-0 p-3">
            <BrandLockup />
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          {navSections.map((section) => (
            <div key={section.label} className="flex flex-col gap-2">
              <p className="px-1 py-1 text-[12px] font-medium uppercase leading-4 tracking-[0.48px] text-text-soft-400">
                {section.label}
              </p>
              <div className="flex flex-col gap-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium leading-5 transition-all duration-150 ease-out hover:translate-x-0.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/20 ${
                        active ? 'bg-bg-weak-50 text-text-strong-950' : 'bg-bg-white-0 text-text-sub-600 hover:bg-bg-weak-50'
                      }`}
                    >
                      {active && <span className="absolute -left-5 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-[4px] bg-primary-accent transition-all" />}
                      <Icon size={20} strokeWidth={1.75} className={`transition-colors ${active ? 'text-primary-accent' : 'text-text-sub-600 group-hover:text-primary-accent'}`} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {active && <ChevronRight size={20} strokeWidth={1.75} className="text-text-sub-600 transition-transform group-hover:translate-x-0.5" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex flex-col gap-4 px-3 py-3">
          <div className="relative">
            <button
              className="flex w-[248px] items-center gap-3 rounded-ui bg-bg-white-0 p-3 text-left transition-all duration-150 ease-out hover:bg-bg-weak-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/20"
              onClick={() => setIsProfileMenuOpen((current) => !current)}
            >
              <UserAvatar />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <p className="truncate text-sm font-medium text-text-strong-950">{profile.name}</p>
                  <img src="/figma/verified.svg" alt="" className="size-3.5 shrink-0" />
                </div>
                <p className="truncate text-xs text-text-sub-600">{profile.position}</p>
                <p className="truncate text-[11px] leading-4 text-text-soft-400">{profile.email}</p>
              </div>
              <ChevronRight size={16} className={`text-text-sub-600 transition-transform ${isProfileMenuOpen ? 'rotate-90' : ''}`} />
            </button>
            {isProfileMenuOpen && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-30 rounded-panel border border-stroke-soft-200 bg-bg-white-0 p-1 shadow-[0px_12px_28px_rgba(10,13,20,0.16)]">
                <div className="border-b border-stroke-soft-200 px-3 py-2">
                  <p className="truncate text-sm font-medium text-text-strong-950">{profile.name}</p>
                  <p className="truncate text-xs text-text-sub-600">{profile.email}</p>
                </div>
                <button
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-state-danger-base transition-all duration-150 ease-out hover:bg-state-danger-light active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-state-danger-base/20"
                  disabled={logoutMutation.isPending}
                  onClick={() => logoutMutation.mutate()}
                >
                  <LogOut size={16} />
                  {logoutMutation.isPending ? 'Logging out...' : 'Logout'}
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-bg-white-0 md:min-h-0 md:p-1.5 md:pl-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-stroke-soft-200 bg-bg-white-0/95 px-4 py-3 backdrop-blur md:hidden">
          <BrandLockup compact />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-primary-accent">Growhaley</p>
            <p className="truncate text-xs text-text-sub-600">{profile.name} · {profile.position}</p>
          </div>
          <Link
            href="/dashboard/settings"
            className="flex size-9 items-center justify-center rounded-lg border border-stroke-soft-200 text-text-sub-600 transition-all duration-150 ease-out hover:bg-bg-weak-50 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/20"
            aria-label="Open settings"
          >
            <Settings size={17} />
          </Link>
        </header>

        <div className="min-w-0 flex-1 overflow-y-auto bg-bg-white-0 pb-20 md:min-h-0 md:overflow-hidden md:rounded-[24px] md:border md:border-stroke-soft-200 md:pb-0">
          <section className="flex min-h-full w-full flex-col bg-bg-white-0 md:h-full">
            <header className="hidden h-[88px] shrink-0 items-center gap-4 border-b border-stroke-soft-200 bg-bg-white-0 px-8 py-5 md:flex">
              <div className="min-w-0 flex-1">
                <h1 className="text-[18px] font-medium leading-6 text-text-strong-950">{pageTitle.title}</h1>
                <p className="mt-1 text-sm leading-5 text-text-sub-600">{pageTitle.subtitle}</p>
              </div>
              <button
                className="relative flex size-10 items-center justify-center rounded-ui text-text-sub-600 transition-all duration-150 ease-out hover:bg-bg-weak-50 active:scale-[0.96]"
                aria-label="Notifications"
              >
                <Bell size={20} />
                <span className="absolute right-3 top-3 size-1.5 rounded-full bg-state-danger-base" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
              {shouldBlockChildren ? (
                <div className="flex min-h-[320px] items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-stroke-soft-200 border-t-primary-base" />
                </div>
              ) : (
                children
              )}
            </div>
          </section>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-stroke-soft-200 bg-bg-white-0/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur md:hidden">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-all duration-150 ease-out active:scale-[0.94] ${
                  active ? 'bg-bg-weak-50 text-primary-accent' : 'text-text-sub-600 hover:bg-bg-weak-50 hover:text-primary-accent'
                }`}
              >
                <Icon size={18} />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
