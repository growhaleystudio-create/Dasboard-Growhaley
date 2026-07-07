import { describe, expect, it } from 'vitest';

import { buildContentIntelligenceContext, contentIntelligenceBankStats } from './content-intelligence-bank.js';
import { LAYOUT_VARIANT_IDS } from '@leads-generator/shared';

type IntelligenceContext = {
  narrativeArcs: Array<{ id: string }>;
  imageStyles: Array<{ id: string; promptFragment: string; avoid: string[] }>;
  layoutRecipes: Array<{ id: string; layoutCandidates: string[] }>;
};

function parseContext(prompt: string, slideCount = 5): IntelligenceContext {
  return JSON.parse(buildContentIntelligenceContext(prompt, slideCount)) as IntelligenceContext;
}

describe('content intelligence bank', () => {
  it('contains a broad v1 image style and layout recipe bank', () => {
    const stats = contentIntelligenceBankStats();

    expect(stats.imageStyles).toBeGreaterThanOrEqual(40);
    expect(stats.layoutRecipes).toBeGreaterThanOrEqual(80);
    expect(stats.narrativeArcs).toBeGreaterThanOrEqual(5);
  });

  it('retrieves narrative, layout, and style guidance for a doodle prevention prompt', () => {
    const parsed = parseContext(
      'buat content tentang bahaya pornografi untuk rumah tangga, gunakan style doodle, sertakan pencegahan efektif',
    );

    expect(parsed.narrativeArcs.map((arc) => arc.id)).toContain('warning_prevention_playbook');
    expect(parsed.imageStyles.map((style) => style.id)).toContain('doodle_handdrawn');
    expect(parsed.layoutRecipes.map((recipe) => recipe.id)).toContain('prevention_steps');
    expect(parsed.imageStyles.find((style) => style.id === 'doodle_handdrawn')?.promptFragment).toContain('hand-drawn doodle');
    expect(parsed.imageStyles.find((style) => style.id === 'doodle_handdrawn')?.avoid).toContain('generic editorial illustration');
  });

  it('retrieves product and UI styles for SaaS product prompts', () => {
    const parsed = parseContext(
      'Buat carousel SaaS dashboard CRM untuk owner bisnis kecil, tampilkan web dashboard mockup, fitur, workflow, dan CTA book demo',
    );

    expect(parsed.narrativeArcs.map((arc) => arc.id)).toContain('product_demo_value');
    expect(parsed.imageStyles.map((style) => style.id)).toEqual(
      expect.arrayContaining(['modern_saas_ui', 'web_dashboard_mockup']),
    );
    expect(parsed.layoutRecipes.map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(['feature_breakdown', 'workflow_steps', 'product_visual_cta']),
    );
  });

  it('retrieves photo styles for premium product prompts', () => {
    const parsed = parseContext(
      'Buat konten launch produk premium berupa foto produk katalog yang luxury dan elegant',
    );

    expect(parsed.imageStyles.map((style) => style.id)).toEqual(
      expect.arrayContaining(['product_photo_premium', 'luxury_editorial']),
    );
    expect(parsed.layoutRecipes.map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(['launch_announcement', 'premium_offer']),
    );
  });

  it('retrieves education diagram and infographic styles for framework prompts', () => {
    const parsed = parseContext(
      'Jelaskan framework marketing dalam bentuk infografik edukasi, diagram flow, dan langkah praktis',
    );

    expect(parsed.imageStyles.map((style) => style.id)).toEqual(
      expect.arrayContaining(['infographic_diagram', 'educational_diagram']),
    );
    expect(parsed.layoutRecipes.map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(['framework_cards', 'definition_explainer']),
    );
  });

  it('returns more layout candidates for complex prompts', () => {
    const parsed = parseContext(
      'Buat panduan lengkap: masalah, penyebab, red flags, do and dont, pencegahan, langkah berikutnya, dan ringkasan takeaway',
      7,
    );

    expect(parsed.layoutRecipes.length).toBeGreaterThanOrEqual(6);
    expect(parsed.layoutRecipes.map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(['red_flags', 'dos_donts', 'prevention_steps', 'recap_summary']),
    );
  });

  it('retrieves multi-image layout recipes for visual comparison and gallery prompts', () => {
    const parsed = parseContext(
      'Buat carousel produk dengan before/after, detail close-up packaging, 3 contoh visual gallery, dan pilihan warna variant',
      6,
    );

    expect(parsed.layoutRecipes.map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(['gw_collage_showcase']),
    );
  });

  it('retrieves editorial layout recipes for magazine and opinion prompts', () => {
    const parsed = parseContext(
      'Buat carousel editorial seperti majalah: cover story, artikel opini, pullquote, profile founder, dan insight data',
      6,
    );

    expect(parsed.layoutRecipes.map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining([
        'gw_photo_statement',
        'gw_poster_quote',
        'gw_poster_statement',
        'gw_poster_stat',
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// Regression tests for the three bug fixes (2026-06-18).
// See content-intelligence-bank.ts for the rationale on each guard.
// ---------------------------------------------------------------------------

describe('content intelligence bank — bug-fix guards', () => {
  // Bug #2: scoreByTriggers must use word boundaries, not raw substring.
  // Before the fix, the trigger "ai" (inside futuristic_tech) matched
  // inside everyday Indonesian words like "main" and "baik", so a totally
  // unrelated prompt could be silently tagged with a futuristic/AI style.
  it('does not substring-match short triggers inside other words (word-boundary fix)', () => {
    // "main" and "baik" both contain the letters "ai" but neither is about AI.
    const parsed = parseContext(
      'tips main game yang baik untuk anak-anak, fokus pada keseruan',
    );

    const styleIds = parsed.imageStyles.map((style) => style.id);
    expect(styleIds).not.toContain('futuristic_tech');
  });

  it('still matches a word trigger when it appears as a standalone token', () => {
    const parsed = parseContext('jelaskan dampak AI dan automation di masa depan');
    const styleIds = parsed.imageStyles.map((style) => style.id);
    expect(styleIds).toContain('futuristic_tech');
  });

  // Bug #1: fallback used positional indexes [1]!, [2]!, [3]! which would
  // throw at runtime if the leading LAYOUT_RECIPES entries were ever removed.
  // The fallback must gracefully degrade when nothing matches.
  it('returns a safe fallback (never crashes) for a prompt with no trigger matches', () => {
    // Pure punctuation / gibberish that no trigger should match.
    const parsed = parseContext('......', 3);

    expect(parsed.layoutRecipes.length).toBeGreaterThan(0);
    expect(parsed.narrativeArcs.length).toBeGreaterThan(0);
  });

  // Bug #3: layoutCandidates in every preset must stay in sync with the
  // shared layout catalog. If a layout is renamed/removed upstream, a preset
  // that still references the old id would emit an invalid layout_variant_id
  // and the slide would silently fall back to a generic layout.
  it('every layoutCandidate id in the bank exists in the shared layout catalog', () => {
    const validIds = new Set(LAYOUT_VARIANT_IDS);

    // Force retrieval of recipes with their candidates by using a prompt
    // broad enough to hit many recipes; also assert the static fallback path.
    const matched = parseContext(
      'panduan lengkap masalah penyebab solusi langkah tips perbandingan before after testimonial',
      10,
    );
    const fallback = parseContext('......', 3);

    for (const recipe of [...matched.layoutRecipes, ...fallback.layoutRecipes]) {
      for (const candidateId of recipe.layoutCandidates) {
        expect(validIds, `recipe "${recipe.id}" references unknown layout "${candidateId}"`).toContain(candidateId);
      }
    }
  });
});
