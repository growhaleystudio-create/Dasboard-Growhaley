'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  ScanLine,
  Search,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppError, AUTH_UNAUTHORIZED_EVENT, fetchApi } from '@/lib/api';
import { getSessionProfile } from '@/lib/sessionProfile';
import { useSession } from '@/lib/useSession';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Surface } from '@/components/ui/Surface';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Heading, Text } from '@/components/ui/Typography';
import { cn } from '@/lib/utils';

const desktopNavGroups: Array<{
  title?: string;
  items: Array<{ href: string; label: string; icon: LucideIcon }>;
}> = [
  {
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Lead',
    items: [
      { href: '/dashboard/leads', label: 'Leads Generator', icon: Users },
      { href: '/dashboard/scans', label: 'Scan Leads', icon: ScanLine },
    ],
  },
  {
    title: 'Content & AI',
    items: [{ href: '/dashboard/content', label: 'Content Generator', icon: Sparkles }],
  },
  {
    title: 'Research',
    items: [{ href: '/dashboard/surveys', label: 'Surveys', icon: ClipboardList }],
  },
  {
    title: 'Administration',
    items: [
      { href: '/dashboard/team', label: 'Account', icon: Users },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
];

const mobileNavItems = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/dashboard/leads', label: 'Leads', icon: Users },
  { href: '/dashboard/scans', label: 'Scans', icon: ScanLine },
  { href: '/dashboard/surveys', label: 'Surveys', icon: ClipboardList },
  { href: '/dashboard/content', label: 'Content', icon: Sparkles },
] as const;

function matchesPath(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === '/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`) || pathname.startsWith(`${href}?`);
}

function BrandMark() {
  return (
    <div className="relative size-[40px] shrink-0 overflow-hidden">
      <img src="/figma/logo.svg" alt="Growhaley" className="size-full object-contain" />
    </div>
  );
}

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-[8.139px]">
      <BrandMark />
      {!compact ? (
        <Text as="p" variant="title-3-bold" color="accent" className="leading-none">
          Growhaley
        </Text>
      ) : null}
    </div>
  );
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium leading-5 transition-all duration-150 ease-out hover:translate-x-0.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/20',
        active ? 'bg-bg-weak-50 text-text-strong-950' : 'bg-transparent text-text-sub-600 hover:bg-bg-weak-50'
      )}
    >
      {active ? <span className="absolute -left-5 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-[4px] bg-primary-accent" /> : null}
      <Icon
        size={20}
        strokeWidth={1.75}
        className={cn('transition-colors', active ? 'text-primary-accent' : 'text-text-sub-600 group-hover:text-primary-accent')}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active ? <ChevronRight size={20} strokeWidth={1.75} className="text-text-sub-600 transition-transform group-hover:translate-x-0.5" /> : null}
    </Link>
  );
}

function DashboardSidebar({ pathname }: { pathname: string | null }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col bg-transparent px-5 pb-6 pt-6 xl:flex">
      <div className="pb-12">
        <BrandLockup />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto pr-3">
          {desktopNavGroups.map((group, index) => (
            <div key={group.title ?? `group-${index}`} className="flex flex-col gap-2">
              {group.title ? (
                <Text as="p" variant="caption-bold" color="tertiary" className="px-1 uppercase tracking-[0.48px]">
                  {group.title}
                </Text>
              ) : null}
              <div className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <SidebarLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={matchesPath(pathname, item.href)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

      </div>
    </aside>
  );
}

import { TopNav } from '@/components/ui/TopNav';
import { SearchField } from '@/components/ui/SearchField';

function DashboardTopbar({
  profile,
  isProfileMenuOpen,
  setIsProfileMenuOpen,
  onLogout,
  isLoggingOut,
  pathname,
}: {
  profile: ReturnType<typeof getSessionProfile>;
  isProfileMenuOpen: boolean;
  setIsProfileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onLogout: () => void;
  isLoggingOut: boolean;
  pathname: string | null;
}) {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState('');

  const breadcrumbItems = pathname
    ? pathname.split('/').filter(Boolean).map((part, index, arr) => ({
        label: part.charAt(0).toUpperCase() + part.slice(1),
        href: '/' + arr.slice(0, index + 1).join('/'),
      }))
    : [{ label: 'Dashboard' }];

  return (
    <TopNav
      className="px-6 py-4 bg-transparent border-none xl:pl-0"
      blurBackground={false}
      glass={false}
      logo={
        <div className="hidden md:flex items-center gap-4">
          <Breadcrumb items={breadcrumbItems} />
        </div>
      }
      navItems={[]}
      alignment="Right"
      actionSlot={
        <div className="flex items-center gap-3">
          <SearchField 
            open={searchOpen} 
            onOpenChange={setSearchOpen}
            value={searchValue}
            onValueChange={setSearchValue}
            className="hidden md:flex" 
            placeholder="Search leads..."
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Notifications"
            className="relative size-11 rounded-ui border border-stroke-soft-200 bg-bg-white-0 text-text-sub-600 shadow-none transition-all duration-150 ease-out hover:bg-bg-weak-50"
          >
            <Bell size={18} strokeWidth={2} />
            <span className="absolute right-[10px] top-[10px] size-2 rounded-full bg-state-danger-base" />
          </Button>
        </div>
      }
      avatarSlot={
        <div className="relative hidden md:block">
          <button
            type="button"
            onClick={() => setIsProfileMenuOpen((current) => !current)}
            className="rounded-[18px] border border-stroke-soft-200 bg-bg-white-0 px-3 py-2 transition-all duration-150 ease-out hover:bg-bg-weak-50 font-normal h-12 w-[220px] flex items-center justify-between gap-3 shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Avatar fallback={profile.name} size="sm" />
              <div className="min-w-0 text-left">
                <Text as="p" variant="body-s-bold" className="truncate leading-tight">
                  {profile.name}
                </Text>
                <Text as="p" variant="caption" color="secondary" className="mt-0.5 truncate leading-tight">
                  {profile.position}
                </Text>
              </div>
            </div>
            <ChevronDown
              size={16}
              className={cn('text-text-soft-400 shrink-0 transition-transform', isProfileMenuOpen && 'rotate-180')}
            />
          </button>

          {isProfileMenuOpen ? (
            <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-[260px] rounded-panel border border-stroke-soft-200 bg-bg-white-0 p-3 shadow-panel">
              <div className="rounded-[16px] bg-bg-subtle p-3">
                <Text as="p" variant="body-s-bold" className="truncate">
                  {profile.name}
                </Text>
                <Text as="p" variant="caption" color="secondary" className="mt-1 truncate">
                  {profile.email}
                </Text>
              </div>
              <div className="mt-2 grid gap-1">
                <Button variant="ghost" className="h-10 justify-start rounded-lg px-3">
                  Profile
                </Button>
                <Button variant="ghost" className="h-10 justify-start rounded-lg px-3">
                  Settings
                </Button>
                <Button
                  variant="ghost"
                  leftIcon={<LogOut size={16} />}
                  className="h-10 justify-start rounded-lg px-3 text-state-danger-base hover:bg-state-danger-light hover:text-state-danger-base"
                  onClick={onLogout}
                  disabled={isLoggingOut}
                >
                  {isLoggingOut ? 'Logging out...' : 'Logout'}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      }
    />
  );
}

function MobileTopbar({ profile, pathname }: { profile: ReturnType<typeof getSessionProfile>; pathname: string | null }) {
  const activeLabel = mobileNavItems.find((item) => matchesPath(pathname, item.href))?.label ?? 'Dashboard';

  return (
    <div className="sticky top-0 z-20 border-b border-stroke-soft-200 bg-bg-subtle/95 px-4 py-4 backdrop-blur xl:hidden">
      <div className="flex items-center gap-3">
        <BrandLockup compact />
        <div className="min-w-0 flex-1">
          <Text as="p" variant="body-s-bold" color="accent" className="truncate">
            Growhaley
          </Text>
          <Text as="p" variant="caption" color="secondary" className="mt-0.5 truncate">
            {profile.name} · {activeLabel}
          </Text>
        </div>
        <Button
            variant="ghost"
            size="icon"
            aria-label="Notifications"
            className="size-10 rounded-ui border border-stroke-soft-200 bg-bg-white-0 text-text-sub-600 shadow-none"
          >
            <Bell size={18} />
        </Button>
      </div>
    </div>
  );
}

function MobileBottomNav({ pathname }: { pathname: string | null }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stroke-soft-200 bg-bg-white-0/95 px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur xl:hidden">
      <div className="grid grid-cols-5 gap-2">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = matchesPath(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-w-0 flex-col items-center gap-1 rounded-lg px-2 py-2 text-center transition-all duration-150 ease-out active:scale-[0.94]',
                active ? 'bg-bg-weak-50 text-primary-accent' : 'text-text-sub-600 hover:bg-bg-weak-50 hover:text-primary-accent'
              )}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span className="truncate font-sans text-[11px] font-medium leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
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

  React.useEffect(() => {
    const closeProfileMenu = () => setIsProfileMenuOpen(false);
    window.addEventListener('resize', closeProfileMenu);
    return () => window.removeEventListener('resize', closeProfileMenu);
  }, []);

  const shouldBlockChildren =
    isAuthRedirecting ||
    isSessionLoading ||
    !isSessionFetchedAfterMount ||
    !sessionData?.session ||
    (sessionError instanceof AppError && sessionError.status === 401);

  return (
    <div
      className="min-h-dvh bg-bg-subtle text-text-strong-950"
      style={{
        backgroundImage:
          'radial-gradient(circle at 85% 115%, rgba(223, 186, 242, 0.9), rgba(245, 242, 243, 0.96) 28%, rgba(245, 242, 243, 1) 60%)',
      }}
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-[1512px]">
        <DashboardSidebar pathname={pathname} />

        <div className="flex min-w-0 flex-1 flex-col pb-24 xl:pb-0">
          <MobileTopbar profile={profile} pathname={pathname} />
          <div className="min-w-0 flex-1">
            <DashboardTopbar
              profile={profile}
              isProfileMenuOpen={isProfileMenuOpen}
              setIsProfileMenuOpen={setIsProfileMenuOpen}
              onLogout={() => logoutMutation.mutate()}
              isLoggingOut={logoutMutation.isPending}
              pathname={pathname}
            />

            <main className="px-4 pb-6 pt-4 sm:px-6 xl:px-0 xl:pb-5 xl:pl-0 xl:pr-6 xl:pt-4">
              {shouldBlockChildren ? (
                <Surface className="flex min-h-[420px] items-center justify-center rounded-[32px] border border-stroke-soft-200 bg-bg-white-0/78 shadow-none backdrop-blur-[40px]">
                  <div className="flex flex-col items-center gap-4">
                    <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-stroke-soft-200 border-t-primary-base" />
                    <Text variant="body-s" color="secondary">
                      Preparing your dashboard...
                    </Text>
                  </div>
                </Surface>
              ) : (
                children
              )}
            </main>
          </div>
        </div>
      </div>

      <MobileBottomNav pathname={pathname} />
    </div>
  );
}
