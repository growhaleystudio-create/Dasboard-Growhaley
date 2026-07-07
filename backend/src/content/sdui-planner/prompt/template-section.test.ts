import { describe, it, expect } from 'vitest';

import type { ApprovedExampleStructure } from '@leads-generator/shared';

import { buildTemplateStructurePromptSection } from './template-section.js';
import { buildPrompt } from './prompt-builder.js';
import type { SduiPlannerInput } from '../types.js';

function makeExample(overrides: Partial<ApprovedExampleStructure> = {}): ApprovedExampleStructure {
  return {
    aspectRatio: '1:1',
    tags: [],
    slides: [
      { blocks: ['heading'], layoutVariant: 'cover_editorial_left' },
      { blocks: ['heading', 'body'] },
      { blocks: ['bullet', 'cta'] },
    ],
    ...overrides,
  };
}

function makeInput(overrides: Partial<SduiPlannerInput> = {}): SduiPlannerInput {
  return {
    teamId: 'team-1',
    jobId: 'job-1',
    actorId: 'user-1',
    prompt: 'Buat carousel tentang produktivitas',
    aspectRatio: '1:1',
    slideCount: 5,
    maxSlides: 7,
    tone: 'professional',
    ...overrides,
  };
}

describe('buildTemplateStructurePromptSection', () => {
  it('returns empty string when no examples', () => {
    expect(buildTemplateStructurePromptSection(undefined)).toBe('');
    expect(buildTemplateStructurePromptSection([])).toBe('');
  });

  it('renders section with block structure and layout variants', () => {
    const section = buildTemplateStructurePromptSection([makeExample()]);
    expect(section).toContain('[KERANGKA STRUKTUR CAROUSEL TIM]');
    expect(section).toContain('cover_editorial_left');
    expect(section).toContain('"blocks":["heading","body"]');
    // Structure-only contract: forbids copying text, demands fresh content
    expect(section).toContain('BUKAN isi teks');
  });

  it('caps rendered examples at 3', () => {
    const examples = [
      makeExample({ tags: ['a'] }),
      makeExample({ tags: ['b'] }),
      makeExample({ tags: ['c'] }),
      makeExample({ tags: ['d'] }),
    ];
    const section = buildTemplateStructurePromptSection(examples);
    const matches = section.match(/"aspectRatio":"1:1"/g) ?? [];
    expect(matches.length).toBe(3);
  });
});

describe('buildPrompt with approvedExamples', () => {
  it('includes the template structure section when examples are present', () => {
    const prompt = buildPrompt(makeInput({ approvedExamples: [makeExample()] }));
    expect(prompt).toContain('[KERANGKA STRUKTUR CAROUSEL TIM]');
    expect(prompt).toContain('cover_editorial_left');
  });

  it('omits the section entirely when no examples are present', () => {
    // Note: buildPrompt output is intentionally non-deterministic (variation
    // brief uses a random seed), so assert section absence, not full equality.
    const withUndefined = buildPrompt(makeInput());
    const withEmpty = buildPrompt(makeInput({ approvedExamples: [] }));
    expect(withUndefined).not.toContain('[KERANGKA STRUKTUR CAROUSEL TIM]');
    expect(withEmpty).not.toContain('[KERANGKA STRUKTUR CAROUSEL TIM]');
  });
});
