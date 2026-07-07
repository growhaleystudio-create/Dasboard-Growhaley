'use client';

import Link from 'next/link';
import { ExternalLink, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { Table, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { buildSurveyPublicPath } from '@/lib/surveys/api';
import type { SurveyListItem } from '@/lib/surveys/types';
import { SurveyStatusBadge } from './SurveyStatusBadge';
import { Text } from '@/components/ui/Typography';

interface SurveyListTableProps {
  surveys: SurveyListItem[];
  isLoading?: boolean;
  onPublish: (survey: SurveyListItem) => void;
  onUnpublish: (survey: SurveyListItem) => void;
  onCloseSurvey: (survey: SurveyListItem) => void;
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function publicLinkState(survey: SurveyListItem) {
  if (!survey.publicSlug) {
    return <Badge variant="neutral">No public link yet</Badge>;
  }

  if (survey.status === 'published') {
    return <Badge variant="success">Live</Badge>;
  }

  if (survey.status === 'closed') {
    return <Badge variant="error">Closed</Badge>;
  }

  return <Badge variant="warning">Unpublished</Badge>;
}

export function SurveyListTable({
  surveys,
  isLoading = false,
  onPublish,
  onUnpublish,
  onCloseSurvey,
}: SurveyListTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Survey</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Responses</TableHead>
          <TableHead>Public link</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <tbody>
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <TableRow key={index}>
              <TableCell colSpan={6} className="py-6 text-center">
                <Text variant="body-s" color="secondary">
                  Loading surveys...
                </Text>
              </TableCell>
            </TableRow>
          ))
        ) : surveys.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="py-10 text-center">
              <Text variant="body-s" color="secondary">
                No surveys yet. Create your first research survey to get started.
              </Text>
            </TableCell>
          </TableRow>
        ) : (
          surveys.map((survey) => {
            const detailHref = `/dashboard/surveys/${survey.id}`;
            const publicHref = survey.publicSlug ? buildSurveyPublicPath(survey.publicSlug) : null;

            return (
              <TableRow key={survey.id}>
                <TableCell className="max-w-[360px] whitespace-normal">
                  <div className="flex flex-col gap-2">
                    <Link href={detailHref} className="transition-colors hover:text-primary-accent">
                      <Text as="span" variant="body-m-bold" className="text-inherit">
                        {survey.title}
                      </Text>
                    </Link>
                    <Text variant="body-s" color="secondary" className="line-clamp-2">
                      {survey.projectGoal}
                    </Text>
                  </div>
                </TableCell>
                <TableCell>
                  <SurveyStatusBadge status={survey.status} />
                </TableCell>
                <TableCell>{survey.responseCount}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {publicLinkState(survey)}
                    {publicHref ? (
                      <Link href={publicHref} target="_blank" rel="noreferrer" className="text-primary-accent hover:text-primary-hover">
                        <ExternalLink size={15} />
                      </Link>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>{formatDate(survey.updatedAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={detailHref}>
                      <Button variant="primary" size="md">
                        Open
                      </Button>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Open actions for ${survey.title}`}
                        >
                          <MoreHorizontal size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {survey.status === 'draft' ? (
                          <DropdownMenuItem onClick={() => onPublish(survey)}>
                            Publish survey
                          </DropdownMenuItem>
                        ) : null}
                        {survey.status === 'published' ? (
                          <DropdownMenuItem onClick={() => onUnpublish(survey)}>
                            Unpublish survey
                          </DropdownMenuItem>
                        ) : null}
                        {survey.status !== 'closed' ? (
                          <DropdownMenuItem onClick={() => onCloseSurvey(survey)}>
                            Close survey
                          </DropdownMenuItem>
                        ) : null}
                        {publicHref ? (
                          <DropdownMenuItem asChild>
                            <Link href={publicHref} target="_blank" rel="noreferrer">
                              Open public survey
                            </Link>
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </tbody>
    </Table>
  );
}
