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
