import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { QuestionSection } from './QuestionSection';

describe('QuestionSection', () => {
  it('renders collapsed by default', () => {
    render(
      <QuestionSection title="Content" summary="Title: Q1" expanded={false} onToggle={() => {}}>
        <div>Section body</div>
      </QuestionSection>,
    );

    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Title: Q1')).toBeInTheDocument();
    expect(screen.queryByText('Section body')).not.toBeInTheDocument();
  });

  it('renders expanded when expanded=true', () => {
    render(
      <QuestionSection title="Content" summary="Title: Q1" expanded={true} onToggle={() => {}}>
        <div>Section body</div>
      </QuestionSection>,
    );

    expect(screen.getByText('Section body')).toBeInTheDocument();
    expect(screen.queryByText('Title: Q1')).not.toBeInTheDocument();
  });

  it('calls onToggle when header clicked', async () => {
    const user = userEvent.setup();
    let toggled = false;

    render(
      <QuestionSection
        title="Content"
        summary="Title: Q1"
        expanded={false}
        onToggle={() => {
          toggled = true;
        }}
      >
        <div>Section body</div>
      </QuestionSection>,
    );

    await user.click(screen.getByRole('button', { name: /content/i }));

    expect(toggled).toBe(true);
  });
});
