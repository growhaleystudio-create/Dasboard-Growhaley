'use client';

import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface QuestionSectionProps {
  title: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function QuestionSection({
  title,
  summary,
  expanded,
  onToggle,
  children,
}: QuestionSectionProps) {
  return (
    <div
      className={
        expanded
          ? 'overflow-hidden rounded-panel border border-primary-base/20 bg-bg-weak-50/60 shadow-[inset_3px_0_0_0_rgba(26,140,192,1)]'
          : 'overflow-hidden rounded-panel border border-stroke-soft-200 bg-bg-white-0'
      }
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-weak-50/60"
      >
        <div className="flex min-w-0 items-center gap-2">
          {expanded ? (
            <ChevronDown size={16} className="shrink-0 text-primary-accent" aria-hidden="true" />
          ) : (
            <ChevronRight size={16} className="shrink-0 text-text-soft-400" aria-hidden="true" />
          )}
          <span className="text-sm font-medium text-text-strong-950">{title}</span>
        </div>
        {!expanded ? (
          <span className="truncate text-xs text-text-soft-400">{summary}</span>
        ) : null}
      </button>
      {expanded ? <div className="border-t border-stroke-soft-200 p-4">{children}</div> : null}
    </div>
  );
}
