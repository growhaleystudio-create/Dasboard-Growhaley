'use client';

import {
  Archive,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  Link2,
  Play,
  PauseCircle,
  Sheet,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SurveyStatusBadge } from './SurveyStatusBadge';
import type { SurveyListItem } from '@/lib/surveys/types';
import { buildSurveyAbsolutePublicUrl } from '@/lib/surveys/utils';

interface SurveyDetailHeaderProps {
  survey: SurveyListItem;
  isUpdating?: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onCloseSurvey: () => void;
  onCopyLink: (url: string) => void;
  onExportJson?: () => void;
  onExportCsv?: () => void;
  isExporting?: boolean;
}

function renderAvailabilityBadge(survey: SurveyListItem) {
  if (!survey.publicSlug) {
    return <Badge variant="neutral">No public link yet</Badge>;
  }

  if (survey.status === 'published') {
    return <Badge variant="success">Public access live</Badge>;
  }

  if (survey.status === 'closed') {
    return <Badge variant="error">Responses closed</Badge>;
  }

  return <Badge variant="warning">Currently unpublished</Badge>;
}

export function SurveyDetailHeader({
  survey,
  isUpdating = false,
  onPublish,
  onUnpublish,
  onCloseSurvey,
  onCopyLink,
  onExportJson,
  onExportCsv,
  isExporting = false,
}: SurveyDetailHeaderProps) {
  const publicUrl = survey.publicSlug ? buildSurveyAbsolutePublicUrl(survey.publicSlug) : null;

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SurveyStatusBadge status={survey.status} />
              {renderAvailabilityBadge(survey)}
            </div>
            <div className="space-y-1">
              <CardTitle className="text-2xl">{survey.title}</CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-6">
                {survey.description?.trim() ?? 'No internal description yet.'}
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {survey.status === 'draft' ? (
              <Button leftIcon={<Play size={16} />} onClick={onPublish} loading={isUpdating}>
                Publish survey
              </Button>
            ) : null}
            {survey.status === 'published' ? (
              <Button
                variant="secondary"
                leftIcon={<PauseCircle size={16} />}
                onClick={onUnpublish}
                loading={isUpdating}
              >
                Unpublish
              </Button>
            ) : null}
            {survey.status !== 'closed' ? (
              <Button
                variant="secondary"
                leftIcon={<Archive size={16} />}
                onClick={onCloseSurvey}
                loading={isUpdating}
              >
                Close survey
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-4 border-t border-stroke-soft-200 pt-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <div className="rounded-panel border border-stroke-soft-200 bg-bg-weak-50/60 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-9 items-center justify-center rounded-ui bg-bg-white-0 text-text-sub-600 shadow-none">
              <Link2 size={16} />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-text-strong-950">Public survey link</p>
              {!publicUrl ? (
                <>
                  <p className="text-sm text-text-soft-400">
                    Publish survey to generate its first public URL.
                  </p>
                  <p className="text-xs text-text-soft-400">
                    The link is created on first publish and stays attached to this survey
                    afterward.
                  </p>
                </>
              ) : (
                <>
                  <p className="break-all text-sm text-text-sub-600">{publicUrl}</p>
                  <p className="text-xs text-text-soft-400">
                    {survey.status === 'published'
                      ? 'This link is live and ready to share.'
                      : survey.status === 'closed'
                        ? 'This link still identifies the survey, but responses are closed.'
                        : 'This link is reserved for this survey, but public access is currently disabled.'}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-2 lg:justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" leftIcon={<Download size={16} />} loading={isExporting}>
                {isExporting ? 'Exporting...' : 'Export'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  onExportJson?.();
                }}
              >
                <div className="flex items-center gap-2">
                  <FileJson size={16} />
                  <span>Download JSON</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  onExportCsv?.();
                }}
              >
                <div className="flex items-center gap-2">
                  <Sheet size={16} />
                  <span>Download CSV</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="secondary"
            leftIcon={<Copy size={16} />}
            disabled={!publicUrl}
            onClick={() => {
              if (!publicUrl) return;
              onCopyLink(publicUrl);
            }}
          >
            Copy link
          </Button>
          <Button
            variant="secondary"
            leftIcon={<ExternalLink size={16} />}
            disabled={!publicUrl}
            onClick={() => {
              if (!publicUrl) return;
              window.open(publicUrl, '_blank', 'noopener,noreferrer');
            }}
          >
            Open survey
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
