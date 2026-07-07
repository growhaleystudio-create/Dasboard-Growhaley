'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import type { CreateSurveyInput } from '@/lib/surveys/types';

interface CreateSurveyModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  errorMessage?: string | undefined;
  onClose: () => void;
  onSubmit: (input: CreateSurveyInput) => void;
}

const initialState: CreateSurveyInput = {
  title: '',
  projectGoal: '',
  description: '',
  backgroundContext: '',
  targetParticipant: '',
  primaryDecision: '',
};

export function CreateSurveyModal({
  isOpen,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: CreateSurveyModalProps) {
  const [form, setForm] = useState<CreateSurveyInput>(initialState);

  const canSubmit = useMemo(() => {
    return form.title.trim().length > 0 && form.projectGoal.trim().length > 0;
  }, [form.projectGoal, form.title]);

  const handleClose = () => {
    if (isSubmitting) return;
    setForm(initialState);
    onClose();
  };

  const updateField = <K extends keyof CreateSurveyInput>(key: K, value: CreateSurveyInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create survey"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(form)} disabled={!canSubmit} loading={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create survey'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-text-strong-950">
            Research objective / project goal
          </p>
          <p className="text-sm text-text-soft-400">
            Make this explicit from the start so the survey and AI analysis stay aligned to the
            research purpose.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-text-strong-950">Survey title</label>
          <Input
            autoFocus
            placeholder="e.g. Customer onboarding satisfaction survey"
            value={form.title}
            onChange={(event) => updateField('title', event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-text-strong-950">Research objective</label>
          <Textarea
            placeholder="What decision or research question should this survey help answer?"
            value={form.projectGoal}
            onChange={(event) => updateField('projectGoal', event.target.value)}
            className="min-h-[120px]"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-text-strong-950">Description</label>
          <Textarea
            placeholder="Optional short description for internal context"
            value={form.description ?? ''}
            onChange={(event) => updateField('description', event.target.value)}
            className="min-h-[96px]"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-strong-950">Target participant</label>
            <Input
              placeholder="e.g. Trial users in first 14 days"
              value={form.targetParticipant ?? ''}
              onChange={(event) => updateField('targetParticipant', event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-strong-950">Primary decision</label>
            <Input
              placeholder="e.g. Improve onboarding drop-off"
              value={form.primaryDecision ?? ''}
              onChange={(event) => updateField('primaryDecision', event.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-text-strong-950">Background context</label>
          <Textarea
            placeholder="Optional background, constraints, or recent findings"
            value={form.backgroundContext ?? ''}
            onChange={(event) => updateField('backgroundContext', event.target.value)}
            className="min-h-[96px]"
          />
        </div>

        {errorMessage ? <p className="text-sm text-state-danger-base">{errorMessage}</p> : null}
      </div>
    </Modal>
  );
}
