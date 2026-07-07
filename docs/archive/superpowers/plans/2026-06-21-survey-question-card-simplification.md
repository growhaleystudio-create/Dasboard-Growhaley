# Survey Question Card Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the survey question editor so each question card is the only accordion container, answer options use one visible field per option, and move reorder/remove controls out of the heavy header treatment.

**Architecture:** Keep `QuestionListEditor` as the sortable list container and preserve the existing per-card draft/save model in `useQuestionDraft`. Refactor `QuestionEditorCard` into one expandable card with flat internal sections, hide option values from the UI while keeping them in data, and keep question-level actions lightweight by moving destructive actions into the footer while keeping drag behavior available from a compact handle.

**Tech Stack:** React, Next.js, TypeScript, Vitest, Testing Library, dnd-kit, existing design system components

---

### Task 1: Lock the simplified card behavior with focused component tests

**Files:**
- Modify: `frontend/src/components/surveys/QuestionListEditor.test.tsx`
- Read for reference: `frontend/src/components/surveys/QuestionEditorCard.tsx`
- Read for reference: `frontend/src/components/surveys/QuestionCardFooter.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it('renders one question-level accordion without nested section toggles', () => {
  renderQuestionListEditor();

  expect(screen.getByRole('button', { name: /toggle question 1/i })).toBeInTheDocument();
  expect(screen.queryByText('① Content')).not.toBeInTheDocument();
  expect(screen.queryByText('② Type & settings')).not.toBeInTheDocument();
  expect(screen.queryByText('③ Answer config')).not.toBeInTheDocument();
  expect(screen.queryByText('④ Conditional logic')).not.toBeInTheDocument();
});

it('does not render move buttons in the question card UI', () => {
  renderQuestionListEditor();

  expect(screen.queryByRole('button', { name: /move question 1 up/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /move question 1 down/i })).not.toBeInTheDocument();
});

it('shows one visible field per choice option', () => {
  renderQuestionListEditor();

  expect(screen.getByDisplayValue('Option 1')).toBeInTheDocument();
  expect(screen.queryByPlaceholderText('option_value')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace frontend -- QuestionListEditor.test.tsx`
Expected: FAIL because the current UI still renders nested `QuestionSection` headers, move buttons, and a visible option value input.

- [ ] **Step 3: Update the test file with the complete simplified behavior suite**

```tsx
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SurveyQuestion } from '@/lib/surveys/types';

import { QuestionListEditor } from './QuestionListEditor';

function buildQuestion(overrides: Partial<SurveyQuestion> = {}): SurveyQuestion {
  return {
    id: 'question-1',
    surveyId: 'survey-1',
    teamId: 'team-1',
    version: 1,
    questionKey: 'q_mdol',
    type: 'multiple_choice',
    title: 'mdol',
    description: 'akausadsadas',
    required: false,
    displayOrder: 0,
    config: {
      options: [
        { label: 'Option 1', value: 'option_1' },
        { label: 'Option 2', value: 'option_2' },
        { label: 'Option 3', value: 'option_3' },
      ],
    },
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function renderQuestionListEditor(questions: SurveyQuestion[] = [buildQuestion()]) {
  return render(
    <QuestionListEditor
      teamId="team-1"
      surveyId="survey-1"
      questions={questions}
      surveyStatus="draft"
      onSave={vi.fn()}
    />,
    { wrapper: createWrapper() },
  );
}

describe('QuestionListEditor', () => {
  it('renders one question-level accordion without nested section toggles', () => {
    renderQuestionListEditor();

    expect(screen.getByRole('button', { name: /toggle question 1/i })).toBeInTheDocument();
    expect(screen.queryByText('① Content')).not.toBeInTheDocument();
    expect(screen.queryByText('② Type & settings')).not.toBeInTheDocument();
    expect(screen.queryByText('③ Answer config')).not.toBeInTheDocument();
    expect(screen.queryByText('④ Conditional logic')).not.toBeInTheDocument();
  });

  it('collapses and expands the question body from the card header', async () => {
    const user = userEvent.setup();
    renderQuestionListEditor();

    const toggleButton = screen.getByRole('button', { name: /toggle question 1/i });

    expect(screen.getByLabelText(/question title/i)).toBeVisible();
    await user.click(toggleButton);
    expect(screen.queryByLabelText(/question title/i)).not.toBeInTheDocument();

    await user.click(toggleButton);
    expect(screen.getByLabelText(/question title/i)).toBeVisible();
  });

  it('does not render move buttons in the question card UI', () => {
    renderQuestionListEditor();

    expect(screen.queryByRole('button', { name: /move question 1 up/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /move question 1 down/i })).not.toBeInTheDocument();
  });

  it('shows one visible field per choice option', async () => {
    const user = userEvent.setup();
    renderQuestionListEditor();

    const optionInput = screen.getByDisplayValue('Option 1');
    await user.clear(optionInput);
    await user.type(optionInput, 'Sangat puas');

    expect(screen.queryByPlaceholderText('option_value')).not.toBeInTheDocument();
  });

  it('renders remove question action in the footer next to save controls', () => {
    renderQuestionListEditor();

    expect(screen.getByRole('button', { name: /remove question/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save question/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace frontend -- QuestionListEditor.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/surveys/QuestionListEditor.test.tsx
git commit -m "test: lock simplified survey question card behavior"
```

### Task 2: Refactor `QuestionEditorCard` into a single accordion card

**Files:**
- Modify: `frontend/src/components/surveys/QuestionEditorCard.tsx`
- Read for reference: `frontend/src/components/surveys/QuestionSection.tsx`

- [ ] **Step 1: Remove nested section accordion state and add one card-level expanded state**

Replace the current section state:

```tsx
const [expandedSections, setExpandedSections] = React.useState<Set<string>>(
  () => new Set(['content']),
);

const toggleSection = (section: string) => {
  setExpandedSections((current) => {
    const next = new Set(current);
    if (next.has(section)) {
      next.delete(section);
    } else {
      next.add(section);
    }
    return next;
  });
};
```

With:

```tsx
const [expanded, setExpanded] = React.useState(true);
```

- [ ] **Step 2: Replace the card header with one compact accordion trigger**

Use this header shape inside `QuestionEditorCard`:

```tsx
<CardHeader className="gap-4 border-b border-stroke-soft-200 bg-bg-weak-50/60 pb-4">
  <div className="flex items-start justify-between gap-4">
    <div className="flex min-w-0 items-start gap-3">
      <button
        type="button"
        className="mt-0.5 cursor-grab p-1 text-text-soft-400 active:cursor-grabbing hover:text-text-strong-950"
        aria-label={`Drag to reorder question ${index + 1}`}
        {...dragHandleProps}
      >
        <GripVertical size={18} />
      </button>

      <button
        type="button"
        className="flex min-w-0 flex-1 items-start gap-3 rounded-panel text-left"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-label={`Toggle question ${index + 1}`}
      >
        {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base">Question {index + 1}</CardTitle>
          <CardDescription>
            <span className="font-medium text-text-strong-950">{question.questionKey}</span>
            <span> · {getQuestionTypeLabel(question.type)}</span>
            {question.required ? <span> · Required</span> : <span> · Optional</span>}
          </CardDescription>
          {!expanded ? (
            <p className="truncate text-sm text-text-soft-400">
              {question.title.trim() || 'Untitled question'}
            </p>
          ) : null}
        </div>
      </button>
    </div>

    {isDirty && saveState === 'idle' ? <Badge variant="warning" showDot>Unsaved</Badge> : null}
  </div>
</CardHeader>
```

- [ ] **Step 3: Replace nested `QuestionSection` usage with flat grouped sections inside `CardContent`**

Use this structure pattern:

```tsx
{expanded ? (
  <CardContent className="space-y-6 pt-6">
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-text-strong-950">Content</h3>
        <p className="text-xs text-text-soft-400">Main prompt and helper text for this question.</p>
      </div>
      {/* existing title + description fields */}
    </section>

    <section className="space-y-4 border-t border-stroke-soft-200 pt-4">
      <div>
        <h3 className="text-sm font-medium text-text-strong-950">Type & settings</h3>
        <p className="text-xs text-text-soft-400">Choose the answer format and whether the response is required.</p>
      </div>
      {/* existing type + required UI */}
    </section>

    <section className="space-y-4 border-t border-stroke-soft-200 pt-4">
      <div>
        <h3 className="text-sm font-medium text-text-strong-950">Answer config</h3>
        <p className="text-xs text-text-soft-400">Set up options, scale bounds, or matrix choices based on the question type.</p>
      </div>
      {/* existing type-specific config UI */}
    </section>

    <section className="space-y-4 border-t border-stroke-soft-200 pt-4">
      <div>
        <h3 className="text-sm font-medium text-text-strong-950">Conditional logic</h3>
        <p className="text-xs text-text-soft-400">Show this question only when earlier answers match your rules.</p>
      </div>
      {/* existing logic UI */}
    </section>
  </CardContent>
) : null}
```

- [ ] **Step 4: Add accessible labels to title and description inputs**

Update the content fields to:

```tsx
<label htmlFor={`question-title-${question.questionKey}`} className="text-sm font-medium text-text-strong-950">
  Question title
</label>
<Input
  id={`question-title-${question.questionKey}`}
  aria-label="Question title"
  value={question.title}
  disabled={disabled}
  onChange={(event) => update({ ...question, title: event.target.value })}
  placeholder="What do you want to ask?"
/>
```

```tsx
<label htmlFor={`question-description-${question.questionKey}`} className="text-sm font-medium text-text-strong-950">
  Description
</label>
<Textarea
  id={`question-description-${question.questionKey}`}
  aria-label="Question description"
  value={question.description ?? ''}
  disabled={disabled}
  onChange={(event) => update({ ...question, description: event.target.value })}
  className="min-h-24"
  placeholder="Optional helper text or clarification for respondents"
/>
```

- [ ] **Step 5: Remove the unused `QuestionSection` import and verify the card compiles**

Delete this import from `QuestionEditorCard.tsx`:

```tsx
import { QuestionSection } from './QuestionSection';
```

Also add chevron imports at the top:

```tsx
import { ChevronDown, ChevronRight, GitBranch, GripVertical, ListChecks, Plus, Scale } from 'lucide-react';
```

- [ ] **Step 6: Run focused tests**

Run: `npm run test --workspace frontend -- QuestionListEditor.test.tsx -t "accordion|collapses|nested"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/surveys/QuestionEditorCard.tsx frontend/src/components/surveys/QuestionListEditor.test.tsx
git commit -m "refactor: simplify survey question card structure"
```

### Task 3: Simplify choice option editing to one visible input per option

**Files:**
- Modify: `frontend/src/components/surveys/QuestionEditorCard.tsx`
- Modify: `frontend/src/components/surveys/QuestionListEditor.tsx`

- [ ] **Step 1: Preserve stable option values when labels change**

Inside the choice option `onChange`, replace the current label/value update with:

```tsx
onChange={(event) => {
  const nextLabel = event.target.value;
  const nextOptions = choiceConfig.options.map((item, idx) =>
    idx === optionIndex
      ? {
          ...item,
          label: nextLabel,
          value: item.value || makeSlug(nextLabel) || `option_${optionIndex + 1}`,
        }
      : item,
  );

  update({
    ...question,
    config: {
      ...choiceConfig,
      options: nextOptions,
    },
  });
}}
```

This keeps existing stored values stable after the first generation.

- [ ] **Step 2: Remove the visible value input and switch to a simpler option row layout**

Replace the current choice option row:

```tsx
className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
```

With:

```tsx
className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"
```

And keep only one input:

```tsx
<Input
  aria-label={`Option ${optionIndex + 1} label`}
  value={option.label}
  disabled={disabled}
  onChange={(event) => {
    const nextLabel = event.target.value;
    const nextOptions = choiceConfig.options.map((item, idx) =>
      idx === optionIndex
        ? {
            ...item,
            label: nextLabel,
            value: item.value || makeSlug(nextLabel) || `option_${optionIndex + 1}`,
          }
        : item,
    );
    update({
      ...question,
      config: {
        ...choiceConfig,
        options: nextOptions,
      },
    });
  }}
  placeholder="Option label"
/>
```

- [ ] **Step 3: Make newly added options generate values immediately but stay stable later**

Keep this add-option behavior in `QuestionEditorCard.tsx`:

```tsx
const nextIndex = choiceConfig.options.length + 1;
update({
  ...question,
  config: {
    ...choiceConfig,
    options: [
      ...choiceConfig.options,
      { value: `option_${nextIndex}`, label: `Option ${nextIndex}` },
    ],
  },
});
```

Do not add any code that rewrites existing option values during reorder, save, or validation.

- [ ] **Step 4: Keep validation compatible with hidden values**

In `frontend/src/components/surveys/QuestionListEditor.tsx`, replace:

```tsx
if (config.options.some((option) => !option.label.trim() || !option.value.trim())) {
  messages.push(`Question ${position} has an empty option label or value.`);
}
```

With:

```tsx
if (config.options.some((option) => !option.label.trim())) {
  messages.push(`Question ${position} has an empty option label.`);
}
```
```

- [ ] **Step 5: Run focused tests**

Run: `npm run test --workspace frontend -- QuestionListEditor.test.tsx -t "visible field|option|auto-generates"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/surveys/QuestionEditorCard.tsx frontend/src/components/surveys/QuestionListEditor.tsx frontend/src/components/surveys/QuestionListEditor.test.tsx
git commit -m "refactor: simplify survey answer option inputs"
```

### Task 4: Move remove action into the footer and lighten question-level controls

**Files:**
- Modify: `frontend/src/components/surveys/QuestionEditorCard.tsx`
- Modify: `frontend/src/components/surveys/QuestionCardFooter.tsx`

- [ ] **Step 1: Remove move buttons and remove button from the header**

Delete this block from the `QuestionEditorCard` header:

```tsx
<div className="flex flex-wrap items-center gap-2">
  {isDirty && saveState === 'idle' ? <Badge variant="warning" showDot>Unsaved</Badge> : null}
  <Button
    variant="outline"
    size="sm"
    leftIcon={<ArrowUp size={14} />}
    disabled={disabled || index === 0}
    onClick={onMoveUp}
    aria-label={`Move question ${index + 1} up`}
  >
    ↑
  </Button>
  <Button
    variant="outline"
    size="sm"
    leftIcon={<ArrowDown size={14} />}
    disabled={disabled || index === totalQuestions - 1}
    onClick={onMoveDown}
    aria-label={`Move question ${index + 1} down`}
  >
    ↓
  </Button>
  <Button
    variant="danger"
    size="sm"
    leftIcon={<Trash2 size={14} />}
    disabled={disabled}
    onClick={onRemove}
  >
    Remove
  </Button>
</div>
```

Header should only keep the dirty badge on the right.

- [ ] **Step 2: Stop passing unused move handlers into the card**

Remove these props from `QuestionEditorCardProps`:

```tsx
onMoveUp: () => void;
onMoveDown: () => void;
```

And remove these props from the call site in `QuestionListEditor.tsx`:

```tsx
onMoveUp={() => moveQuestion(index, -1)}
onMoveDown={() => moveQuestion(index, 1)}
```

Leave drag-and-drop behavior intact through `dragHandleProps`.

- [ ] **Step 3: Pass remove control to the footer**

Update the footer usage in `QuestionEditorCard.tsx` to:

```tsx
<QuestionCardFooter
  saveState={saveState}
  isDirty={isDirty}
  lastSavedAt={lastSavedAt}
  onSave={onSave}
  onDiscard={onDiscard}
  onRemove={onRemove}
  canRemove={!disabled}
/>
```

- [ ] **Step 4: Keep the footer action row explicit and accessible**

Ensure `QuestionCardFooter.tsx` keeps this action row:

```tsx
<div className="flex items-center gap-2">
  {onRemove ? (
    <Button variant="danger" size="sm" disabled={!canRemove || isSaving} onClick={onRemove}>
      Remove question
    </Button>
  ) : null}
  <Button variant="outline" size="sm" disabled={disableActions} onClick={onDiscard}>
    Discard
  </Button>
  <Button variant="primary" size="sm" disabled={disableActions} onClick={onSave}>
    Save question
  </Button>
</div>
```

- [ ] **Step 5: Run focused tests**

Run: `npm run test --workspace frontend -- QuestionListEditor.test.tsx -t "remove question action|move buttons"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/surveys/QuestionEditorCard.tsx frontend/src/components/surveys/QuestionCardFooter.tsx frontend/src/components/surveys/QuestionListEditor.tsx frontend/src/components/surveys/QuestionListEditor.test.tsx
git commit -m "refactor: move survey question actions into footer"
```

### Task 5: Align the survey UX design doc and run verification

**Files:**
- Modify: `docs/superpowers/specs/2026-06-21-survey-ux-improvements-design.md`

- [ ] **Step 1: Update the design doc section for the simplified card direction**

Replace the question-card section description with:

```md
### 4.2 Question Card Layout — Single Accordion Card (Revised)

Struktur card berubah menjadi satu accordion per question. Saat collapsed, card hanya menampilkan summary penting (nomor question, key, type, required/optional, dan ringkasan title). Saat expanded, semua field tampil flat di dalam card dengan heading visual sederhana dan divider tipis — tanpa nested accordion dan tanpa nested heavy container.

Answer config untuk choice-based question menampilkan satu input label per option. Value internal tetap ada di data model, digenerate otomatis saat option dibuat, lalu dipertahankan stabil ketika label diubah.

Aksi reorder tidak lagi memakai tombol ↑ / ↓ di header. Reorder tetap tersedia lewat drag handle yang ringan. Aksi remove dipindahkan ke footer berdampingan dengan Save question dan Discard agar area header tetap fokus ke scan + expand/collapse.
```

- [ ] **Step 2: Run the focused survey editor tests**

Run: `npm run test --workspace frontend -- QuestionListEditor.test.tsx`
Expected: PASS

- [ ] **Step 3: Run broader survey-related frontend tests**

Run: `npm run test --workspace frontend -- surveys`
Expected: PASS, or only unrelated pre-existing failures outside the simplified question-card surface.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-21-survey-ux-improvements-design.md frontend/src/components/surveys/QuestionEditorCard.tsx frontend/src/components/surveys/QuestionCardFooter.tsx frontend/src/components/surveys/QuestionListEditor.tsx frontend/src/components/surveys/QuestionListEditor.test.tsx
git commit -m "docs: align survey UX spec with simplified card design"
```
