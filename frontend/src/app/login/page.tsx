'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Search,
  CheckCircle2,
  Sparkles,
  Palette,
  MapPin,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Layers,
} from 'lucide-react';
import { Heading, Text } from '@/components/ui/Typography';
import { fetchApi } from '@/lib/api';
import type { AppError } from '@/lib/api';
import type { SessionResponse } from '@/lib/useSession';
import { AuthForm } from '@/components/ui/AuthForm';

interface ShowcaseSlide {
  id: string;
  tag: string;
  cardTitle: string;
  cardBadge: string;
  centerType: 'score' | 'stats' | 'carousel';
  scoreValue?: number;
  statsValue?: string;
  statsSub?: string;
  items: Array<{
    icon: 'check' | 'search' | 'layers';
    text: string;
    badge: string;
    badgeStyle: string;
  }>;
  title: string;
  description: string;
}

const SHOWCASE_SLIDES: ShowcaseSlide[] = [
  {
    id: 'seo-audit',
    tag: 'AI Audit 2.5',
    cardTitle: 'Website & SEO Optimizer',
    cardBadge: 'Live',
    centerType: 'score',
    scoreValue: 98,
    items: [
      {
        icon: 'check',
        text: '12 SEO & UX checks passed',
        badge: 'Ready',
        badgeStyle: 'bg-state-success-light text-state-success-dark',
      },
      {
        icon: 'search',
        text: 'Mobile & speed audit: Excellent',
        badge: 'Active',
        badgeStyle: 'bg-alpha-primary-10 text-primary-base',
      },
      {
        icon: 'check',
        text: 'Custom sales angle generated',
        badge: 'Clean',
        badgeStyle: 'bg-bg-weak-50 text-text-sub-600',
      },
    ],
    title: 'Publish with SEO Confidence',
    description:
      "Whaley's built-in SEO analyzer ensures your posts and websites are fully optimized for search engines before you hit publish.",
  },
  {
    id: 'lead-discovery',
    tag: 'Multi-Channel Scraper',
    cardTitle: 'Google Maps & Social Engine',
    cardBadge: 'Active',
    centerType: 'stats',
    statsValue: '148',
    statsSub: 'Hot Leads Found',
    items: [
      {
        icon: 'check',
        text: '42 High-conversion prospects',
        badge: 'Top Tier',
        badgeStyle: 'bg-state-success-light text-state-success-dark',
      },
      {
        icon: 'search',
        text: '100% WhatsApp contacts verified',
        badge: 'Verified',
        badgeStyle: 'bg-alpha-primary-10 text-primary-base',
      },
      {
        icon: 'layers',
        text: 'Zero duplicates deduplicated',
        badge: 'Clean',
        badgeStyle: 'bg-bg-weak-50 text-text-sub-600',
      },
    ],
    title: 'Target Qualified Prospects Faster',
    description:
      'Scrape business data from Google Maps, LinkedIn, and Instagram with real-time deduplication and contact extraction.',
  },
  {
    id: 'carousel-studio',
    tag: 'Studio SDUI',
    cardTitle: 'AI Pitch Carousel Studio',
    cardBadge: 'Ready',
    centerType: 'carousel',
    items: [
      {
        icon: 'check',
        text: 'Aspect ratios: 1:1, 4:5, 9:16',
        badge: 'Multi-Format',
        badgeStyle: 'bg-state-success-light text-state-success-dark',
      },
      {
        icon: 'search',
        text: 'Brand kit colors & fonts applied',
        badge: 'Branded',
        badgeStyle: 'bg-alpha-primary-10 text-primary-base',
      },
      {
        icon: 'layers',
        text: 'Vector-sharp Satori engine export',
        badge: 'HD Quality',
        badgeStyle: 'bg-bg-weak-50 text-text-sub-600',
      },
    ],
    title: 'Generate Pitch Carousels in Seconds',
    description:
      'Create studio-grade client presentations, educational slides, and social carousels with automated brand kit styles.',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const nextSlide = useCallback(() => {
    setActiveSlide((prev) => (prev + 1) % SHOWCASE_SLIDES.length);
  }, []);

  const prevSlide = useCallback(() => {
    setActiveSlide((prev) => (prev - 1 + SHOWCASE_SLIDES.length) % SHOWCASE_SLIDES.length);
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(nextSlide, 5000);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide]);

  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      return fetchApi<{ message: string; sessionId?: string; session: SessionResponse['session'] }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
    },
    onSuccess: (data) => {
      queryClient.clear();
      if (data.sessionId && typeof window !== 'undefined') {
        localStorage.setItem('sessionId', data.sessionId);
        // Also set cookie manually as fallback in case Set-Cookie header was stripped
        document.cookie = `sessionId=${data.sessionId}; Path=/; Max-Age=1800; SameSite=Lax; Secure`;
      }
      queryClient.setQueryData<SessionResponse>(['session'], { session: data.session });
      window.location.href = '/dashboard/leads';
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

  const slide = SHOWCASE_SLIDES[activeSlide] ?? SHOWCASE_SLIDES[0]!;

  return (
    <main className="min-h-screen bg-bg-white-0 p-4 lg:p-0">
      <div className="mx-auto flex min-h-[calc(100vh-32px)] w-full max-w-[1440px] overflow-hidden rounded-3xl bg-bg-white-0 lg:min-h-screen lg:rounded-none">
        {/* Left Side: Login Form */}
        <section className="relative flex min-w-0 w-full flex-col px-6 py-6 sm:px-10 lg:w-[42.25%] lg:px-11 justify-center">
          <div className="flex min-w-0 items-center justify-start py-12 lg:justify-center">
            <div className="min-w-0 w-[400px] max-w-[calc(100vw-64px)] lg:w-full lg:max-w-[400px] relative">
              {loginMutation.error && (
                <div className="mb-5 rounded-lg border border-[#ffd5d8] bg-[#ffebec] p-3 absolute -top-16 left-0 right-0">
                  <Text variant="body-s-bold" className="text-[#cc0000]">
                    {(loginMutation.error as AppError).message || 'Invalid email or password'}
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

        {/* Right Side: Interactive Showcase Carousel */}
        <aside
          className="relative m-2 hidden flex-1 overflow-hidden rounded-2xl bg-bg-weak-50 lg:flex lg:flex-col lg:items-center lg:justify-between p-8 border border-stroke-soft-200 select-none"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Background Grid Pattern */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(235,235,235,0.6)_1px,transparent_1px),linear-gradient(to_bottom,rgba(235,235,235,0.6)_1px,transparent_1px)] bg-[size:44px_44px] opacity-70" />

          {/* Top Tag & Navigation Controls */}
          <div className="relative z-10 flex w-full max-w-[420px] items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-stroke-soft-200 bg-white/90 px-3 py-1 text-xs font-semibold text-text-sub-600 shadow-sm backdrop-blur-sm">
              <Sparkles size={13} className="text-primary-base" />
              {slide.tag}
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={prevSlide}
                aria-label="Previous slide"
                className="flex size-8 items-center justify-center rounded-full border border-stroke-soft-200 bg-white/90 text-text-sub-600 shadow-sm transition hover:bg-white hover:text-primary-base active:scale-95"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={nextSlide}
                aria-label="Next slide"
                className="flex size-8 items-center justify-center rounded-full border border-stroke-soft-200 bg-white/90 text-text-sub-600 shadow-sm transition hover:bg-white hover:text-primary-base active:scale-95"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Center Card Presentation */}
          <div className="relative z-10 w-full max-w-[360px] my-auto">
            <div
              key={slide.id}
              className="animate-in fade-in zoom-in-95 duration-300 rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-5 shadow-card transition-all"
            >
              {/* Card Header */}
              <div className="mb-4 flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-alpha-primary-10 text-primary-base">
                  {slide.centerType === 'score' && <Search size={18} />}
                  {slide.centerType === 'stats' && <MapPin size={18} />}
                  {slide.centerType === 'carousel' && <Palette size={18} />}
                </div>
                <Text as="p" variant="body-m" className="flex-1 font-semibold text-text-strong-950">
                  {slide.cardTitle}
                </Text>
                <span className="rounded-lg border border-stroke-soft-200 px-2.5 py-1 text-xs font-semibold text-text-sub-600">
                  {slide.cardBadge}
                </span>
              </div>

              {/* Card Middle Visual */}
              <div className="border-y border-stroke-soft-200 py-6">
                {slide.centerType === 'score' && (
                  <div className="mx-auto flex size-32 items-center justify-center rounded-full bg-[conic-gradient(#177cb3_0_98%,#e3e8ef_98%_100%)] shadow-inner transition-all">
                    <div className="flex size-24 flex-col items-center justify-center rounded-full bg-bg-white-0 shadow-sm">
                      <Heading as="p" variant="h3" className="text-[30px] font-bold leading-9 text-primary-base">
                        {slide.scoreValue}
                      </Heading>
                      <Text as="p" variant="caption" color="secondary" className="font-semibold uppercase tracking-wider text-[10px]">
                        SCORE
                      </Text>
                    </div>
                  </div>
                )}

                {slide.centerType === 'stats' && (
                  <div className="mx-auto flex size-32 items-center justify-center rounded-full bg-gradient-to-tr from-primary-base to-emerald-400 p-1 shadow-inner">
                    <div className="flex size-full flex-col items-center justify-center rounded-full bg-bg-white-0 p-2 shadow-sm">
                      <div className="flex items-center gap-1 text-primary-base">
                        <TrendingUp size={16} />
                        <Heading as="p" variant="h3" className="text-[28px] font-bold leading-8 text-text-strong-950">
                          {slide.statsValue}
                        </Heading>
                      </div>
                      <Text as="p" variant="caption" color="secondary" className="font-semibold text-center uppercase tracking-wider text-[10px]">
                        {slide.statsSub}
                      </Text>
                    </div>
                  </div>
                )}

                {slide.centerType === 'carousel' && (
                  <div className="mx-auto flex w-full max-w-[240px] items-center justify-center gap-2">
                    <div className="flex-1 rounded-xl border border-primary-base/20 bg-gradient-to-b from-bg-accent-soft to-white p-3 text-center shadow-sm">
                      <div className="mx-auto mb-1.5 flex size-7 items-center justify-center rounded-lg bg-primary-base text-white">
                        <Palette size={14} />
                      </div>
                      <p className="text-xs font-bold text-text-strong-950">1:1 Square</p>
                      <p className="text-[10px] text-text-soft-400">Post Feed</p>
                    </div>
                    <div className="flex-1 rounded-xl border border-emerald-500/20 bg-gradient-to-b from-emerald-50 to-white p-3 text-center shadow-sm">
                      <div className="mx-auto mb-1.5 flex size-7 items-center justify-center rounded-lg bg-emerald-600 text-white">
                        <Layers size={14} />
                      </div>
                      <p className="text-xs font-bold text-text-strong-950">4:5 Portrait</p>
                      <p className="text-[10px] text-text-soft-400">Carousel</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Card Checklist Items */}
              <div className="mt-4 flex flex-col gap-2.5">
                {slide.items.map((item, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <div className="h-px bg-stroke-soft-200" />}
                    <div className="flex items-center gap-2 text-xs">
                      {item.icon === 'check' && <CheckCircle2 className="size-4 shrink-0 text-[#1fc16b]" />}
                      {item.icon === 'search' && <Search className="size-4 shrink-0 text-primary-base" />}
                      {item.icon === 'layers' && <Layers className="size-4 shrink-0 text-primary-accent" />}
                      <span className="flex-1 font-medium text-text-strong-950">{item.text}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.badgeStyle}`}>
                        {item.badge}
                      </span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Heading & Clickable Bullets */}
          <div className="relative z-10 flex w-full max-w-[480px] flex-col items-center gap-4 text-center">
            <div key={`text-${slide.id}`} className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col gap-1.5">
              <Heading as="h2" variant="title-1" className="text-xl font-bold text-text-strong-950">
                {slide.title}
              </Heading>
              <Text variant="body-m" color="secondary" className="text-xs leading-relaxed text-text-sub-600">
                {slide.description}
              </Text>
            </div>

            {/* Clickable Bullet Navigation */}
            <div className="flex items-center gap-2 pt-2">
              {SHOWCASE_SLIDES.map((s, idx) => {
                const isActive = idx === activeSlide;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveSlide(idx)}
                    aria-label={`Go to slide ${idx + 1}: ${s.title}`}
                    className={`h-2.5 rounded-full transition-all duration-300 ${
                      isActive
                        ? 'w-7 bg-primary-base shadow-sm'
                        : 'w-2.5 bg-stroke-strong-300 hover:bg-primary-base/50'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
