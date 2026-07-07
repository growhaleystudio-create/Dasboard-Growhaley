import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { QuestionCardFooter } from './QuestionCardFooter';

describe('QuestionCardFooter', () => {
  it('renders idle state with last saved timestamp', () => {
    render(
      <QuestionCardFooter
        saveState="idle"
        isDirty={false}
        lastSavedAt={new Date()}
        onSave={() => {}}
        onDiscard={() => {}}
      />,
    );

    expect(screen.getByText(/last saved/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save question/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /discard/i })).toBeDisabled();
  });

  it('renders dirty state with enabled buttons', () => {
    render(
      <QuestionCardFooter
        saveState="idle"
        isDirty={true}
        lastSavedAt={new Date()}
        onSave={() => {}}
        onDiscard={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: /save question/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /discard/i })).not.toBeDisabled();
  });

  it('renders saving state with disabled buttons', () => {
    render(
      <QuestionCardFooter
        saveState="saving"
        isDirty={true}
        lastSavedAt={new Date()}
        onSave={() => {}}
        onDiscard={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: /save question/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /discard/i })).toBeDisabled();
    expect(screen.getByText(/saving/i)).toBeInTheDocument();
  });

  it('renders saved state with badge', () => {
    render(
      <QuestionCardFooter
        saveState="saved"
        isDirty={false}
        lastSavedAt={new Date()}
        onSave={() => {}}
        onDiscard={() => {}}
      />,
    );

    expect(screen.getByText(/saved/i)).toBeInTheDocument();
  });

  it('renders error state with badge', () => {
    render(
      <QuestionCardFooter
        saveState="error"
        isDirty={true}
        lastSavedAt={new Date()}
        onSave={() => {}}
        onDiscard={() => {}}
      />,
    );

    expect(screen.getByText(/save failed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save question/i })).not.toBeDisabled();
  });

  it('calls onSave when Save button clicked', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <QuestionCardFooter
        saveState="idle"
        isDirty={true}
        lastSavedAt={new Date()}
        onSave={onSave}
        onDiscard={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: /save question/i }));

    expect(onSave).toHaveBeenCalledOnce();
  });

  it('calls onDiscard when Discard button clicked', async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();

    render(
      <QuestionCardFooter
        saveState="idle"
        isDirty={true}
        lastSavedAt={new Date()}
        onSave={() => {}}
        onDiscard={onDiscard}
      />,
    );

    await user.click(screen.getByRole('button', { name: /discard/i }));

    expect(onDiscard).toHaveBeenCalledOnce();
  });
});
