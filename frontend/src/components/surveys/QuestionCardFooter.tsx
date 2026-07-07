'use client';

import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface QuestionCardFooterProps {
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  isDirty: boolean;
  lastSavedAt: Date | null;
  onSave: () => void;
  onDiscard: () => void;
  onRemove?: () => void;
  canRemove?: boolean;
}

function formatLastSaved(lastSavedAt: Date): string {
  const diffMinutes = Math.floor((Date.now() - lastSavedAt.getTime()) / 60000);

  if (diffMinutes <= 0) {
    return 'just now';
  }

  if (diffMinutes === 1) {
    return '1 min ago';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours === 1) {
    return '1 hour ago';
  }

  if (diffHours < 24) {
    return `${diffHours} hours ago`;
  }

  return lastSavedAt.toLocaleDateString();
}

export function QuestionCardFooter({
  saveState,
  isDirty,
  lastSavedAt,
  onSave,
  onDiscard,
  onRemove,
  canRemove = false,
}: QuestionCardFooterProps) {
  const isSaving = saveState === 'saving';
  const disableActions = isSaving || !isDirty;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stroke-soft-200 bg-bg-weak-50/60 px-4 py-3">
      <div className="flex min-h-8 items-center gap-2 text-xs text-text-soft-400">
        {saveState === 'saving' ? (
          <Badge variant="neutral" className="gap-1.5">
            <Loader2 size={12} className="animate-spin" />
            <span>Saving...</span>
          </Badge>
        ) : null}
        {saveState === 'saved' ? (
          <Badge variant="success" className="gap-1.5">
            <CheckCircle2 size={12} />
            <span>Saved</span>
          </Badge>
        ) : null}
        {saveState === 'error' ? (
          <Badge variant="error" className="gap-1.5">
            <AlertCircle size={12} />
            <span>Save failed</span>
          </Badge>
        ) : null}
        {saveState === 'idle' && lastSavedAt ? (
          <span>Last saved {formatLastSaved(lastSavedAt)}</span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {onRemove ? (
          <Button variant="danger" size="md" disabled={!canRemove || isSaving} onClick={onRemove}>
            Remove question
          </Button>
        ) : null}
        <Button variant="outline" size="md" disabled={disableActions} onClick={onDiscard}>
          Discard
        </Button>
        <Button variant="primary" size="md" disabled={disableActions} loading={isSaving} onClick={onSave}>
          Save question
        </Button>
      </div>
    </div>
  );
}
