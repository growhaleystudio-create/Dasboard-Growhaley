import React from 'react';
import { ExternalLink, Eye, MoreVertical, Star, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import type { LeadStatus } from '@leads-generator/shared';

export interface AlignLead {
  id: string;
  name: string;
  contact: string;
  location: string;
  niche: string;
  dateFound: string;
  sourceLabel: string;
  sourceUrl?: string | null;
  websiteStatus: 'have website' | 'dont have website';
  status: LeadStatus | 'In Progress' | 'Completed' | 'Failed';
  score: number | null;
}

const statusTone = {
  New: ['bg-state-info-base', 'border-state-info-border text-state-info-base'],
  Reviewed: ['bg-text-sub-600', 'border-stroke-soft-200 text-text-sub-600'],
  Contacted: ['bg-state-warning-base', 'border-state-warning-border text-state-warning-base'],
  Qualified: ['bg-state-success-base', 'border-state-success-light text-state-success-base'],
  Converted: ['bg-state-success-base', 'border-state-success-light text-state-success-base'],
  Rejected: ['bg-state-danger-base', 'border-state-danger-border text-state-danger-base'],
  'In Progress': ['bg-state-warning-base', 'border-state-warning-border text-state-warning-base'],
  Completed: ['bg-state-success-base', 'border-state-success-light text-state-success-base'],
  Failed: ['bg-state-danger-base', 'border-state-danger-border text-state-danger-base'],
} as const;

const websiteTone = {
  'have website': ['bg-state-success-base', 'border-state-success-light text-state-success-base', 'Have website'],
  'dont have website': ['bg-state-warning-base', 'border-state-warning-border text-state-warning-base', 'No website'],
} as const;

function StatusPill({ status }: { status: AlignLead['status'] }) {
  const [dotClass, classes] = statusTone[status] ?? statusTone.Reviewed;

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border bg-bg-white-0 px-1.5 py-0.5 text-xs font-medium ${classes}`}>
      <span className={`size-1.5 rounded-full ${dotClass}`} />
      {status}
    </span>
  );
}

function WebsitePill({ status }: { status: AlignLead['websiteStatus'] }) {
  const [dotClass, classes, label] = websiteTone[status];

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border bg-bg-white-0 px-1.5 py-0.5 text-xs font-medium ${classes}`}>
      <span className={`size-1.5 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}

function Rating({ score }: { score: number | null }) {
  const filled = score === null ? 0 : Math.max(0, Math.min(5, Math.round(score / 20)));

  return (
    <div className="flex items-center gap-0.5 text-[#f6a609]" aria-label={`${filled} out of 5`}>
      {[0, 1, 2, 3, 4].map((item) => (
        <Star
          key={item}
          size={16}
          fill={item < filled ? 'currentColor' : 'none'}
          strokeWidth={1.6}
          className={item < filled ? '' : 'text-[#d1d1d1]'}
        />
      ))}
    </div>
  );
}

function MobileLeadSkeleton() {
  return (
    <article className="rounded-lg border border-stroke-soft-200 bg-bg-white-0 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-28" />
        </div>
        <Skeleton className="h-6 w-20 rounded-md" />
      </div>
      <div className="mt-4 grid gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <div className="mt-4 flex gap-2 border-t border-stroke-soft-200 pt-3">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 flex-1" />
      </div>
    </article>
  );
}

function DesktopLeadTableSkeleton() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((row) => (
        <tr key={row}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((cell) => (
            <td key={cell} className="px-3 py-3">
              <Skeleton className={cell === 7 ? 'ml-auto h-8 w-8 rounded-md' : 'h-5 w-full max-w-[180px]'} />
              {(cell === 0 || cell === 1) && <Skeleton className="mt-2 h-3 w-24" />}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function AlignLeadTable({
  leads,
  isLoading = false,
  error,
  onOpenLead,
  onDeleteLead,
}: {
  leads: AlignLead[];
  isLoading?: boolean;
  error?: React.ReactNode;
  onOpenLead?: (leadId: string) => void;
  onDeleteLead?: (leadId: string) => void;
}) {
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

  return (
    <div>
      <div className="grid gap-3 md:hidden">
        {error && (
          <div className="rounded-lg border border-[#ffd5d8] bg-[#fff7f7] px-3 py-6 text-center text-sm text-[#b42318]">
            {error}
          </div>
        )}
        {!error && isLoading && (
          <>
            {[0, 1, 2].map((item) => (
              <MobileLeadSkeleton key={item} />
            ))}
          </>
        )}
        {!error && !isLoading && leads.length === 0 && (
          <div className="rounded-lg border border-stroke-soft-200 px-3 py-6 text-center text-sm text-text-sub-600">
            No leads found matching your criteria.
          </div>
        )}
        {!error &&
          !isLoading &&
          leads.map((lead) => (
            <article key={lead.id} className="rounded-lg border border-stroke-soft-200 bg-bg-white-0 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold leading-5 text-text-strong-950">{lead.name}</h3>
                  <p className="truncate text-xs leading-4 text-text-sub-600">{lead.contact}</p>
                </div>
                <StatusPill status={lead.status} />
              </div>

              <div className="mt-4 grid gap-3 text-sm">
                <div>
                  <p className="text-xs font-medium uppercase text-text-soft-400">Location</p>
                  <p className="truncate leading-5 text-text-strong-950" title={lead.location}>
                    {lead.location}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-text-soft-400">Niche</p>
                  <p className="truncate leading-5 text-text-sub-600" title={lead.niche}>
                    {lead.niche}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase text-text-soft-400">Date</p>
                    <p className="leading-5 text-text-strong-950">{lead.dateFound}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-text-soft-400">Website</p>
                    <div className="mt-1">
                      <WebsitePill status={lead.websiteStatus} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  {lead.sourceUrl ? (
                    <a
                      className="inline-flex min-w-0 items-center gap-1 text-sm underline underline-offset-2"
                      href={lead.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="truncate">{lead.sourceLabel}</span>
                      <ExternalLink size={12} className="shrink-0" />
                    </a>
                  ) : (
                    <span className="min-w-0 truncate text-sm text-text-sub-600">{lead.sourceLabel}</span>
                  )}
                  <Rating score={lead.score} />
                </div>
              </div>

              <div className="mt-4 flex gap-2 border-t border-stroke-soft-200 pt-3">
                <button
                  className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-stroke-soft-200 text-sm font-medium text-text-sub-600"
                  onClick={() => onOpenLead?.(lead.id)}
                >
                  <Eye size={15} />
                  View
                </button>
                {onDeleteLead && (
                  <button
                    className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-state-danger-border text-sm font-medium text-state-danger-base"
                    onClick={() => onDeleteLead(lead.id)}
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                )}
              </div>
            </article>
          ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] text-left">
        <thead>
          <tr className="bg-bg-weak-50 text-sm font-normal leading-5 text-text-sub-600">
            <th className="rounded-l-lg px-3 py-2 font-normal">Lead Name / Contact</th>
            <th className="px-3 py-2 font-normal">Location / Niche</th>
            <th className="px-3 py-2 font-normal">Date Found</th>
            <th className="px-3 py-2 font-normal">Source</th>
            <th className="px-3 py-2 font-normal">Website</th>
            <th className="px-3 py-2 font-normal">Status</th>
            <th className="px-3 py-2 font-normal">AI Score</th>
            <th className="rounded-r-lg px-3 py-2 font-normal" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {error && (
            <tr>
              <td className="px-3 py-8 text-center text-sm text-[#b42318]" colSpan={8}>
                {error}
              </td>
            </tr>
          )}
          {!error && isLoading && (
            <DesktopLeadTableSkeleton />
          )}
          {!error && !isLoading && leads.length === 0 && (
            <tr>
              <td className="px-3 py-8 text-center text-sm text-text-sub-600" colSpan={8}>
                No leads found matching your criteria.
              </td>
            </tr>
          )}
          {!error &&
            !isLoading &&
            leads.map((lead) => (
              <tr key={lead.id} className="text-sm text-text-strong-950 hover:bg-bg-subtle">
                <td className="px-3 py-3">
                  <div className="flex items-center">
                    <div className="min-w-0">
                      <p className="truncate font-medium leading-5">{lead.name}</p>
                      <p className="truncate text-xs leading-4 text-text-sub-600">{lead.contact}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <p className="max-w-[240px] truncate leading-5" title={lead.location}>
                    {lead.location}
                  </p>
                  <p className="max-w-[240px] truncate text-xs leading-4 text-text-sub-600" title={lead.niche}>
                    {lead.niche}
                  </p>
                </td>
                <td className="px-3 py-3 leading-5">{lead.dateFound}</td>
                <td className="px-3 py-3">
                  {lead.sourceUrl ? (
                    <a
                      className="inline-flex items-center gap-1 text-sm underline underline-offset-2"
                      href={lead.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {lead.sourceLabel}
                      <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span className="text-text-sub-600">{lead.sourceLabel}</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <WebsitePill status={lead.websiteStatus} />
                </td>
                <td className="px-3 py-3">
                  <StatusPill status={lead.status} />
                </td>
                <td className="px-3 py-3">
                  <Rating score={lead.score} />
                </td>
                <td className="relative px-3 py-3 text-right text-text-sub-600">
                  <button
                    className="rounded-md p-1 hover:bg-bg-weak-50"
                    aria-label={`More actions for ${lead.name}`}
                    onClick={() => setOpenMenuId((current) => (current === lead.id ? null : lead.id))}
                  >
                    <MoreVertical size={18} />
                  </button>
                  {openMenuId === lead.id && (
                    <div className="absolute right-3 top-9 z-10 w-32 rounded-lg border border-stroke-soft-200 bg-bg-white-0 p-1 text-left shadow-[0px_8px_20px_rgba(10,13,20,0.12)]">
                      <button
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-sub-600 hover:bg-bg-weak-50"
                        onClick={() => {
                          setOpenMenuId(null);
                          onOpenLead?.(lead.id);
                        }}
                      >
                        <Eye size={14} />
                        View
                      </button>
                      {onDeleteLead && (
                        <button
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-state-danger-base hover:bg-state-danger-light"
                          onClick={() => {
                            setOpenMenuId(null);
                            onDeleteLead(lead.id);
                          }}
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
        </tbody>
        </table>
      </div>
    </div>
  );
}
