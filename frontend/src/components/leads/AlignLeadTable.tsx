import React from 'react';
import { ExternalLink, Eye, MessageCircle, MoreVertical, Star, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableHeader, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import type { LeadStatus, WhatsAppVerificationStatus } from '@leads-generator/shared';

export interface AlignLead {
  id: string;
  name: string;
  contact: string;
  whatsappUrl?: string | null;
  whatsappNumber?: string | null;
  whatsappVerificationStatus: WhatsAppVerificationStatus;
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


const whatsappVerificationTone = {
  unchecked: ['bg-text-sub-600', 'border-stroke-soft-200 text-text-sub-600', 'Unchecked'],
  registered: ['bg-state-success-base', 'border-state-success-light text-state-success-base', 'Registered'],
  not_registered: ['bg-state-danger-base', 'border-state-danger-border text-state-danger-base', 'Not registered'],
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
  const [dotClass, classes, label] = websiteTone[status] ?? websiteTone['dont have website'];

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border bg-bg-white-0 px-1.5 py-0.5 text-xs font-medium ${classes}`}>
      <span className={`size-1.5 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}


function WhatsAppVerificationPill({ status }: { status: AlignLead['whatsappVerificationStatus'] }) {
  const [dotClass, classes, label] = whatsappVerificationTone[status] ?? whatsappVerificationTone.unchecked;

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
        <TableRow key={row}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((cell) => (
            <TableCell key={cell}>
              <Skeleton className={cell === 7 ? 'ml-auto h-8 w-8 rounded-md' : 'h-5 w-full max-w-[180px]'} />
              {(cell === 0 || cell === 1) && <Skeleton className="mt-2 h-3 w-24" />}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function AlignLeadTable({
  leads,
  isLoading = false,
  error,
  onOpenLead,
  onOpenWhatsApp,
  onSetWhatsappVerification,
  onDeleteLead,
}: {
  leads: AlignLead[];
  isLoading?: boolean;
  error?: React.ReactNode;
  onOpenLead?: (leadId: string) => void;
  onOpenWhatsApp?: (leadId: string) => void;
  onSetWhatsappVerification?: (leadId: string, status: WhatsAppVerificationStatus) => void;
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
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <WebsitePill status={lead.websiteStatus} />
                      <WhatsAppVerificationPill status={lead.whatsappVerificationStatus} />
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
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => onOpenLead?.(lead.id)}
                  leftIcon={<Eye size={15} />}
                >
                  View
                </Button>
                <Button
                  variant="primary"
                  className="flex-1 bg-[#22c55e] hover:bg-[#16a34a] border-[#22c55e] disabled:border-stroke-soft-200 disabled:bg-bg-weak-50 disabled:text-text-disabled-300"
                  onClick={() => onOpenWhatsApp?.(lead.id)}
                  disabled={!(typeof lead.whatsappUrl === 'string' && lead.whatsappUrl.length > 0)}
                  title={typeof lead.whatsappUrl === 'string' && lead.whatsappUrl.length > 0
                    ? typeof lead.whatsappNumber === 'string' && lead.whatsappNumber.length > 0
                      ? `Chat on WhatsApp (${lead.whatsappNumber})`
                      : 'Chat on WhatsApp'
                    : 'WhatsApp not available for this lead'}
                  leftIcon={<MessageCircle size={15} />}
                >
                  WhatsApp
                </Button>
                {onDeleteLead && (
                  <Button
                    variant="danger"
                    className="flex-1"
                    onClick={() => onDeleteLead(lead.id)}
                    leftIcon={<Trash2 size={15} />}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </article>
          ))}
      </div>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead Name / Contact</TableHead>
              <TableHead>Location / Niche</TableHead>
              <TableHead>Date Found</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Lead Rating</TableHead>
              <TableHead aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <tbody>
            {error && (
              <TableRow>
                <TableCell className="py-8 text-center text-sm text-[#b42318]" colSpan={9}>
                  {error}
                </TableCell>
              </TableRow>
            )}
            {!error && isLoading && <DesktopLeadTableSkeleton />}
            {!error && !isLoading && leads.length === 0 && (
              <TableRow>
                <TableCell className="py-8 text-center text-text-sub-600" colSpan={9}>
                  No leads found matching your criteria.
                </TableCell>
              </TableRow>
            )}
            {!error &&
              !isLoading &&
              leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <div className="flex items-center">
                      <div className="min-w-0">
                        <p className="truncate font-medium leading-5">{lead.name}</p>
                        <p className="truncate text-xs leading-4 text-text-sub-600">{lead.contact}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="max-w-[240px] truncate leading-5" title={lead.location}>
                      {lead.location}
                    </p>
                    <p className="max-w-[240px] truncate text-xs leading-4 text-text-sub-600" title={lead.niche}>
                      {lead.niche}
                    </p>
                  </TableCell>
                  <TableCell>{lead.dateFound}</TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
                    <WebsitePill status={lead.websiteStatus} />
                  </TableCell>
                  <TableCell>
                    <WhatsAppVerificationPill status={lead.whatsappVerificationStatus} />
                  </TableCell>
                  <TableCell>
                    <StatusPill status={lead.status} />
                  </TableCell>
                  <TableCell>
                    <Rating score={lead.score} />
                  </TableCell>
                  <TableCell className="relative text-right text-text-sub-600">
                    <div className="inline-flex items-center gap-2">
                      <Button
                        variant="primary"
                        size="md"
                        className="bg-[#22c55e] hover:bg-[#16a34a] border-[#22c55e] disabled:border-stroke-soft-200 disabled:bg-bg-weak-50 disabled:text-text-disabled-300"
                        onClick={() => onOpenWhatsApp?.(lead.id)}
                        disabled={!(typeof lead.whatsappUrl === 'string' && lead.whatsappUrl.length > 0)}
                        title={typeof lead.whatsappUrl === 'string' && lead.whatsappUrl.length > 0
                          ? typeof lead.whatsappNumber === 'string' && lead.whatsappNumber.length > 0
                            ? `Chat on WhatsApp (${lead.whatsappNumber})`
                            : 'Chat on WhatsApp'
                          : 'WhatsApp not available for this lead'}
                        leftIcon={<MessageCircle size={14} />}
                      >
                        WhatsApp
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`More actions for ${lead.name}`}
                        onClick={() => setOpenMenuId((current) => (current === lead.id ? null : lead.id))}
                      >
                        <MoreVertical size={18} />
                      </Button>
                    </div>
                    {openMenuId === lead.id && (
                      <div className="absolute right-3 top-9 z-10 w-32 rounded-lg border border-stroke-soft-200 bg-bg-white-0 p-1 text-left shadow-[0px_8px_20px_rgba(10,13,20,0.12)]">
                        <Button
                          variant="ghost"
                          className="h-auto w-full justify-start rounded-md px-2 py-1.5 text-sm font-normal text-text-sub-600"
                          onClick={() => {
                            setOpenMenuId(null);
                            onOpenLead?.(lead.id);
                          }}
                          leftIcon={<Eye size={14} />}
                        >
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-auto w-full justify-start rounded-md px-2 py-1.5 text-sm font-normal text-text-sub-600 disabled:text-text-disabled-300"
                          onClick={() => {
                            setOpenMenuId(null);
                            onOpenWhatsApp?.(lead.id);
                          }}
                          disabled={!(typeof lead.whatsappUrl === 'string' && lead.whatsappUrl.length > 0)}
                          leftIcon={<MessageCircle size={14} />}
                        >
                          WhatsApp
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-auto w-full justify-start rounded-md px-2 py-1.5 text-sm font-normal text-text-sub-600"
                          onClick={() => {
                            setOpenMenuId(null);
                            onSetWhatsappVerification?.(lead.id, 'registered');
                          }}
                        >
                          Mark registered
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-auto w-full justify-start rounded-md px-2 py-1.5 text-sm font-normal text-text-sub-600"
                          onClick={() => {
                            setOpenMenuId(null);
                            onSetWhatsappVerification?.(lead.id, 'not_registered');
                          }}
                        >
                          Mark not registered
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-auto w-full justify-start rounded-md px-2 py-1.5 text-sm font-normal text-text-sub-600"
                          onClick={() => {
                            setOpenMenuId(null);
                            onSetWhatsappVerification?.(lead.id, 'unchecked');
                          }}
                        >
                          Reset WA status
                        </Button>
                        {onDeleteLead && (
                          <Button
                            variant="ghost"
                            className="h-auto w-full justify-start rounded-md px-2 py-1.5 text-sm font-normal text-state-danger-base hover:bg-state-danger-light"
                            onClick={() => {
                              setOpenMenuId(null);
                              onDeleteLead(lead.id);
                            }}
                            leftIcon={<Trash2 size={14} />}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
