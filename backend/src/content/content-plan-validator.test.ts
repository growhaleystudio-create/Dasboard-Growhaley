/**
 * Unit tests for DefaultContentPlanValidator and parseContentPlan
 * (Task 13.1)
 *
 * Covers every validation rule:
 *   R1  aspectRatio must be in rules.aspectRatios
 *   R2  slides.length must be ≤ rules.maxSlides
 *   R2b plan must have at least one slide
 *   R3  every block.type must be in rules.allowedBlocks
 *   R4  text.length must not exceed rules.textLimits[block.type]
 *   R5  chart block requires chartDataRef
 *   R6  mockup block requires mockupRef
 *   R7  each slide must have at least one block
 *
 * Also covers:
 *   - valid plan → valid:true, errors:[]
 *   - multiple errors collected (never stops at first)
 *   - parseContentPlan accepts well-formed JSON and rejects malformed values
 *
 * Requirements: 4.1, 4.2, 9.2
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type {
  ContentPlan,
  ContentPlanBlock,
  ContentPlanSlide,
  MasterTemplateRules,
  AspectRatio,
  BlockType,
  FailureReason,
  ApprovedExampleStructure,
} from '@leads-generator/shared';
import {
  DefaultContentPlanValidator,
  defaultContentPlanValidator,
  parseContentPlan,
  type ContentPlanValidator,
  type ValidationOutcome,
} from './content-plan-validator.js';

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function makeRules(overrides?: Partial<{
  allowedBlocks: BlockType[];
  maxSlides: number;
  textLimits: [BlockType, number][];
  aspectRatios: AspectRatio[];
}>): MasterTemplateRules {
  return {
    allowedBlocks: new Set<BlockType>(
      overrides?.allowedBlocks ?? ['heading', 'body', 'chart', 'mockup', 'cta'],
    ),
    maxSlides: overrides?.maxSlides ?? 5,
    textLimits: new Map<BlockType, number>(overrides?.textLimits ?? [
      ['heading', 80],
      ['body', 300],
      ['cta', 100],
    ]),
    aspectRatios: new Set<AspectRatio>(overrides?.aspectRatios ?? ['9:16', '1:1']),
    defaultTone: 'professional',
    brandKitId: 'brand-kit-1',
  };
}

function makePlan(overrides?: Partial<ContentPlan>): ContentPlan {
  return {
    aspectRatio: '9:16',
    slides: [
      {
        index: 0,
        blocks: [{ type: 'heading', text: 'Hello World' }],
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DefaultContentPlanValidator — valid plan
// ---------------------------------------------------------------------------

describe('DefaultContentPlanValidator — valid plan', () => {
  const validator = new DefaultContentPlanValidator();

  it('returns valid:true and empty errors for a conforming plan', () => {
    const plan = makePlan();
    const rules = makeRules();

    const outcome = validator.validate(plan, rules);

    expect(outcome.valid).toBe(true);
    expect(outcome.errors).toEqual([]);
  });

  it('accepts multiple slides within limit', () => {
    const plan: ContentPlan = {
      aspectRatio: '1:1',
      slides: [
        { index: 0, blocks: [{ type: 'heading', text: 'Slide 1' }] },
        { index: 1, blocks: [{ type: 'body', text: 'Slide 2 body' }] },
        { index: 2, blocks: [{ type: 'cta', text: 'Buy now' }] },
      ],
    };
    const rules = makeRules();

    const outcome = validator.validate(plan, rules);
    expect(outcome.valid).toBe(true);
  });

  it('accepts a chart block that has chartDataRef', () => {
    const plan: ContentPlan = {
      aspectRatio: '9:16',
      slides: [
        {
          index: 0,
          blocks: [{ type: 'chart', chartDataRef: 'data-ref-1' }],
        },
      ],
    };
    const rules = makeRules();

    const outcome = validator.validate(plan, rules);
    expect(outcome.valid).toBe(true);
  });

  it('accepts a mockup block that has mockupRef', () => {
    const plan: ContentPlan = {
      aspectRatio: '9:16',
      slides: [
        {
          index: 0,
          blocks: [{ type: 'mockup', mockupRef: 'mockup-ref-1' }],
        },
      ],
    };
    const rules = makeRules();

    const outcome = validator.validate(plan, rules);
    expect(outcome.valid).toBe(true);
  });

  it('accepts a block with text exactly at the limit', () => {
    const limit = 80;
    const plan: ContentPlan = {
      aspectRatio: '9:16',
      slides: [
        {
          index: 0,
          blocks: [{ type: 'heading', text: 'x'.repeat(limit) }],
        },
      ],
    };
    const rules = makeRules();

    const outcome = validator.validate(plan, rules);
    expect(outcome.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule R1: aspectRatio ∈ rules.aspectRatios
// ---------------------------------------------------------------------------

describe('DefaultContentPlanValidator — R1 aspectRatio', () => {
  const validator = new DefaultContentPlanValidator();

  it('rejects a plan with an aspectRatio not in rules.aspectRatios', () => {
    const plan: ContentPlan = {
      aspectRatio: '4:5',
      slides: [{ index: 0, blocks: [{ type: 'heading', text: 'Hi' }] }],
    };
    // rules only allow 9:16 and 1:1
    const rules = makeRules({ aspectRatios: ['9:16', '1:1'] });

    const outcome = validator.validate(plan, rules);

    expect(outcome.valid).toBe(false);
    expect(outcome.errors.some((e) => e.includes('aspectRatio'))).toBe(true);
    expect(outcome.errors.some((e) => e.includes('4:5'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule R2: slides.length ≤ rules.maxSlides
// ---------------------------------------------------------------------------

describe('DefaultContentPlanValidator — R2 slide count', () => {
  const validator = new DefaultContentPlanValidator();

  it('rejects a plan with more slides than maxSlides', () => {
    const plan: ContentPlan = {
      aspectRatio: '9:16',
      slides: [
        { index: 0, blocks: [{ type: 'heading', text: 'S1' }] },
        { index: 1, blocks: [{ type: 'body', text: 'S2' }] },
        { index: 2, blocks: [{ type: 'cta', text: 'S3' }] },
      ],
    };
    const rules = makeRules({ maxSlides: 2 });

    const outcome = validator.validate(plan, rules);

    expect(outcome.valid).toBe(false);
    expect(outcome.errors.some((e) => e.includes('maxSlides'))).toBe(true);
  });

  it('accepts a plan with exactly maxSlides slides', () => {
    const plan: ContentPlan = {
      aspectRatio: '9:16',
      slides: [
        { index: 0, blocks: [{ type: 'heading', text: 'S1' }] },
        { index: 1, blocks: [{ type: 'body', text: 'S2' }] },
      ],
    };
    const rules = makeRules({ maxSlides: 2 });

    const outcome = validator.validate(plan, rules);
    expect(outcome.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule R2b: at least one slide
// ---------------------------------------------------------------------------

describe('DefaultContentPlanValidator — R2b minimum slides', () => {
  const validator = new DefaultContentPlanValidator();

  it('rejects a plan with zero slides', () => {
    const plan: ContentPlan = {
      aspectRatio: '9:16',
      slides: [],
    };
    const rules = makeRules();

    const outcome = validator.validate(plan, rules);

    expect(outcome.valid).toBe(false);
    expect(outcome.errors.some((e) => e.includes('at least one slide'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule R3: block.type ∈ rules.allowedBlocks
// ---------------------------------------------------------------------------

describe('DefaultContentPlanValidator — R3 allowedBlocks', () => {
  const validator = new DefaultContentPlanValidator();

  it('rejects a plan containing a disallowed block type', () => {
    const plan: ContentPlan = {
      aspectRatio: '9:16',
      slides: [
        {
          index: 0,
          blocks: [
            { type: 'heading', text: 'Allowed' },
            { type: 'quote', text: 'Not allowed' }, // 'quote' not in allowedBlocks
          ],
        },
      ],
    };
    // allowedBlocks does NOT include 'quote'
    const rules = makeRules({ allowedBlocks: ['heading', 'body'] });

    const outcome = validator.validate(plan, rules);

    expect(outcome.valid).toBe(false);
    expect(outcome.errors.some((e) => e.includes("'quote'"))).toBe(true);
    expect(outcome.errors.some((e) => e.includes('allowedBlocks'))).toBe(true);
  });

  it('reports disallowed block in the correct slide index', () => {
    const plan: ContentPlan = {
      aspectRatio: '9:16',
      slides: [
        { index: 0, blocks: [{ type: 'heading', text: 'OK' }] },
        { index: 1, blocks: [{ type: 'stat', text: 'Bad' }] }, // 'stat' not allowed
      ],
    };
    const rules = makeRules({ allowedBlocks: ['heading', 'body'] });

    const outcome = validator.validate(plan, rules);

    expect(outcome.valid).toBe(false);
    expect(outcome.errors.some((e) => e.includes('Slide 1'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule R4: text.length ≤ textLimits
// ---------------------------------------------------------------------------

describe('DefaultContentPlanValidator — R4 text limits', () => {
  const validator = new DefaultContentPlanValidator();

  it('rejects text exceeding the per-block limit', () => {
    const limit = 80;
    const plan: ContentPlan = {
      aspectRatio: '9:16',
      slides: [
        {
          index: 0,
          blocks: [{ type: 'heading', text: 'x'.repeat(limit + 1) }],
        },
      ],
    };
    const rules = makeRules({ textLimits: [['heading', limit]] });

    const outcome = validator.validate(plan, rules);

    expect(outcome.valid).toBe(false);
    expect(outcome.errors.some((e) => e.includes('text length'))).toBe(true);
    expect(outcome.errors.some((e) => e.includes('heading'))).toBe(true);
  });

  it('does not report an error when no limit is set for that block type', () => {
    const plan: ContentPlan = {
      aspectRatio: '9:16',
      slides: [
        {
          index: 0,
          // 'image' block has no textLimit in rules — text is allowed regardless of length
          blocks: [{ type: 'image', text: 'x'.repeat(10000) }],
        },
      ],
    };
    const rules = makeRules({
      allowedBlocks: ['image'],
      textLimits: [], // no limits
    });

    const outcome = validator.validate(plan, rules);
    expect(outcome.valid).toBe(true);
  });

  it('does not check text length when text is undefined', () => {
    const plan: ContentPlan = {
      aspectRatio: '9:16',
      slides: [
        {
          index: 0,
          blocks: [{ type: 'body' }], // no text field
        },
      ],
    };
    const rules = makeRules({ textLimits: [['body', 10]] });

    const outcome = validator.validate(plan, rules);
    expect(outcome.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule R5: chart → chartDataRef required
// ---------------------------------------------------------------------------

describe('DefaultContentPlanValidator — R5 chart requires chartDataRef', () => {
  const validator = new DefaultContentPlanValidator();

  it('rejects a chart block without chartDataRef', () => {
    const plan: ContentPlan = {
      aspectRatio: '9:16',
      slides: [
        {
          index: 0,
          blocks: [{ type: 'chart' }], // missing chartDataRef
        },
      ],
    };
    const rules = makeRules();

    const outcome = validator.validate(plan, rules);

    expect(outcome.valid).toBe(false);
    expect(outcome.errors.some((e) => e.includes('chart') && e.includes('chartDataRef'))).toBe(true);
  });

  it('accepts a chart block with chartDataRef', () => {
    const plan: ContentPlan = {
      aspectRatio: '9:16',
      slides: [
        {
          index: 0,
          blocks: [{ type: 'chart', chartDataRef: 'ref-1' }],
        },
      ],
    };
    const rules = makeRules();

    const outcome = validator.validate(plan, rules);
    expect(outcome.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule R6: mockup → mockupRef required
// ---------------------------------------------------------------------------

describe('DefaultContentPlanValidator — R6 mockup requires mockupRef', () => {
  const validator = new DefaultContentPlanValidator();

  it('rejects a mockup block without mockupRef', () => {
    const plan: ContentPlan = {
      aspectRatio: '9:16',
      slides: [
        {
          index: 0,
          blocks: [{ type: 'mockup' }], // missing mockupRef
        },
      ],
    };
    const rules = makeRules();

    const outcome = validator.validate(plan, rules);

    expect(outcome.valid).toBe(false);
    expect(outcome.errors.some((e) => e.includes('mockup') && e.includes('mockupRef'))).toBe(true);
  });

  it('accepts a mockup block with mockupRef', () => {
    const plan: ContentPlan = {
      aspectRatio: '9:16',
      slides: [
        {
          index: 0,
          blocks: [{ type: 'mockup', mockupRef: 'ref-m1' }],
        },
      ],
    };
    const rules = makeRules();

    const outcome = validator.validate(plan, rules);
    expect(outcome.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule R7: each slide must have at least one block
// ---------------------------------------------------------------------------

describe('DefaultContentPlanValidator — R7 slide must have at least one block', () => {
  const validator = new DefaultContentPlanValidator();

  it('rejects a slide with zero blocks', () => {
    const plan: ContentPlan = {
      aspectRatio: '9:16',
      slides: [
        { index: 0, blocks: [{ type: 'heading', text: 'OK' }] },
        { index: 1, blocks: [] }, // empty
      ],
    };
    const rules = makeRules();

    const outcome = validator.validate(plan, rules);

    expect(outcome.valid).toBe(false);
    expect(outcome.errors.some((e) => e.includes('Slide 1') && e.includes('at least one block'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multiple errors collected simultaneously
// ---------------------------------------------------------------------------

describe('DefaultContentPlanValidator — multiple errors collected', () => {
  const validator = new DefaultContentPlanValidator();

  it('collects errors from multiple rules without stopping at first', () => {
    const plan: ContentPlan = {
      aspectRatio: '4:5', // violates R1 (not in allowed ratios)
      slides: [
        {
          index: 0,
          blocks: [
            { type: 'stat', text: 'x'.repeat(500) }, // R3 (not in allowedBlocks) + R4 (if limit were checked)
            { type: 'chart' },                         // R5 (chart without chartDataRef)
            { type: 'mockup' },                        // R6 (mockup without mockupRef)
          ],
        },
      ],
    };
    const rules = makeRules({
      aspectRatios: ['9:16'],
      allowedBlocks: ['heading', 'body', 'chart', 'mockup'],
    });

    const outcome = validator.validate(plan, rules);

    expect(outcome.valid).toBe(false);
    // Must have at least errors for: aspectRatio, stat block type, chart missing ref, mockup missing ref
    expect(outcome.errors.length).toBeGreaterThanOrEqual(4);
  });

  it('reports errors for multiple slides simultaneously', () => {
    const plan: ContentPlan = {
      aspectRatio: '9:16',
      slides: [
        { index: 0, blocks: [{ type: 'quote', text: 'Bad block' }] }, // R3
        { index: 1, blocks: [{ type: 'stat', text: 'Also bad' }] },  // R3
      ],
    };
    const rules = makeRules({ allowedBlocks: ['heading', 'body'] });

    const outcome = validator.validate(plan, rules);

    expect(outcome.valid).toBe(false);
    expect(outcome.errors.some((e) => e.includes('Slide 0'))).toBe(true);
    expect(outcome.errors.some((e) => e.includes('Slide 1'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

describe('defaultContentPlanValidator singleton', () => {
  it('is an instance of DefaultContentPlanValidator', () => {
    expect(defaultContentPlanValidator).toBeInstanceOf(DefaultContentPlanValidator);
  });

  it('validates correctly through the singleton', () => {
    const plan = makePlan();
    const rules = makeRules();
    const outcome = defaultContentPlanValidator.validate(plan, rules);
    expect(outcome.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Determinism: same inputs → same outputs
// ---------------------------------------------------------------------------

describe('DefaultContentPlanValidator — determinism', () => {
  const validator = new DefaultContentPlanValidator();

  it('returns identical outcomes for repeated calls with same inputs', () => {
    const plan = makePlan();
    const rules = makeRules();

    const o1 = validator.validate(plan, rules);
    const o2 = validator.validate(plan, rules);

    expect(o1).toEqual(o2);
  });
});

// ---------------------------------------------------------------------------
// parseContentPlan
// ---------------------------------------------------------------------------

describe('parseContentPlan', () => {
  it('returns ok for a well-formed ContentPlan object', () => {
    const raw = {
      aspectRatio: '9:16',
      slides: [
        {
          index: 0,
          blocks: [{ type: 'heading', text: 'Hello' }],
        },
      ],
    };

    const result = parseContentPlan(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aspectRatio).toBe('9:16');
    expect(result.value.slides).toHaveLength(1);
  });

  it('returns err for null input', () => {
    const result = parseContentPlan(null);
    expect(result.ok).toBe(false);
  });

  it('returns err for a plain string (non-JSON already parsed)', () => {
    const result = parseContentPlan('not an object');
    expect(result.ok).toBe(false);
  });

  it('returns err when aspectRatio is an unknown value', () => {
    const raw = {
      aspectRatio: '16:9', // not in allowed enum
      slides: [{ index: 0, blocks: [{ type: 'heading' }] }],
    };
    const result = parseContentPlan(raw);
    expect(result.ok).toBe(false);
  });

  it('returns err when a block type is unknown', () => {
    const raw = {
      aspectRatio: '9:16',
      slides: [
        { index: 0, blocks: [{ type: 'video' }] }, // 'video' is not a valid BlockType
      ],
    };
    const result = parseContentPlan(raw);
    expect(result.ok).toBe(false);
  });

  it('returns err when slides is missing', () => {
    const raw = { aspectRatio: '1:1' };
    const result = parseContentPlan(raw);
    expect(result.ok).toBe(false);
  });

  it('returns err when index is not a number', () => {
    const raw = {
      aspectRatio: '1:1',
      slides: [{ index: 'zero', blocks: [{ type: 'heading' }] }],
    };
    const result = parseContentPlan(raw);
    expect(result.ok).toBe(false);
  });

  it('preserves optional fields (chartDataRef, mockupRef, imageRef, layoutVariantHint)', () => {
    const raw = {
      aspectRatio: '4:5',
      slides: [
        {
          index: 0,
          layoutVariantHint: 'full-bleed',
          blocks: [
            { type: 'chart', chartDataRef: 'c1' },
            { type: 'mockup', mockupRef: 'm1' },
            { type: 'image', imageRef: 'i1' },
          ],
        },
      ],
    };
    const result = parseContentPlan(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slides[0]!.layoutVariantHint).toBe('full-bleed');
    expect(result.value.slides[0]!.blocks[0]!.chartDataRef).toBe('c1');
    expect(result.value.slides[0]!.blocks[1]!.mockupRef).toBe('m1');
    expect(result.value.slides[0]!.blocks[2]!.imageRef).toBe('i1');
  });

  it('returns VALIDATION error code on failure', () => {
    const result = parseContentPlan({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
  });
});

// ===========================================================================
// Property-Based Tests (fast-check) — Properties 8, 9, 10
// ===========================================================================
//
// These tests exercise the PURE, deterministic validator contract
// (`DefaultContentPlanValidator.validate` + `parseContentPlan`). For the
// fail-closed pipeline aspect of Property 9, the worker's validation gate
// (carousel-worker.ts) is impractical to instantiate in a unit test (it
// constructs a live BullMQ Worker bound to Redis), so we model that gate
// deterministically here and drive it with fault injection — the core
// assertions remain on the real `validate`.

// ---------------------------------------------------------------------------
// Shared generators / helpers
// ---------------------------------------------------------------------------

const ALL_BLOCKS: BlockType[] = [
  'heading',
  'body',
  'mockup',
  'chart',
  'quote',
  'stat',
  'bullet',
  'cta',
  'image',
];

const ALL_RATIOS: AspectRatio[] = ['1:1', '4:5', '9:16'];

interface RulesSeed {
  allowedBlocks: BlockType[];
  maxSlides: number;
  aspectRatios: AspectRatio[];
  limitEntries: [BlockType, number][];
}

function toRules(seed: RulesSeed): MasterTemplateRules {
  return {
    allowedBlocks: new Set<BlockType>(seed.allowedBlocks),
    maxSlides: seed.maxSlides,
    textLimits: new Map<BlockType, number>(seed.limitEntries),
    aspectRatios: new Set<AspectRatio>(seed.aspectRatios),
    defaultTone: 'professional',
    brandKitId: 'bk-1',
  };
}

/** Rules whose sets may span the full domains (used for conforming plans). */
const arbRules: fc.Arbitrary<MasterTemplateRules> = fc
  .record({
    allowedBlocks: fc.uniqueArray(fc.constantFrom(...ALL_BLOCKS), {
      minLength: 1,
      maxLength: 9,
    }),
    maxSlides: fc.integer({ min: 1, max: 10 }),
    aspectRatios: fc.uniqueArray(fc.constantFrom(...ALL_RATIOS), {
      minLength: 1,
      maxLength: 3,
    }),
    limitEntries: fc.uniqueArray(
      fc.tuple(fc.constantFrom(...ALL_BLOCKS), fc.integer({ min: 0, max: 200 })),
      { selector: (t) => t[0], maxLength: 9 },
    ),
  })
  .map(toRules);

/**
 * Restrictive rules: allowedBlocks is a PROPER subset (≤ 8) so at least one
 * block type is disallowed; aspectRatios is a PROPER subset (≤ 2) so at least
 * one ratio is disallowed; at least one text limit exists. This guarantees
 * every category of rule violation is feasible.
 */
const arbRestrictiveRules: fc.Arbitrary<MasterTemplateRules> = fc
  .record({
    allowedBlocks: fc.uniqueArray(fc.constantFrom(...ALL_BLOCKS), {
      minLength: 1,
      maxLength: 8,
    }),
    maxSlides: fc.integer({ min: 1, max: 10 }),
    aspectRatios: fc.uniqueArray(fc.constantFrom(...ALL_RATIOS), {
      minLength: 1,
      maxLength: 2,
    }),
    limitEntries: fc.uniqueArray(
      fc.tuple(fc.constantFrom(...ALL_BLOCKS), fc.integer({ min: 1, max: 50 })),
      { selector: (t) => t[0], minLength: 1, maxLength: 9 },
    ),
  })
  .map(toRules);

function mkPlan(aspectRatio: AspectRatio, slides: ContentPlanSlide[]): ContentPlan {
  return { aspectRatio, slides };
}

/**
 * Generates a ContentPlan that fully CONFORMS to `rules`:
 *  - aspectRatio ∈ rules.aspectRatios
 *  - 1..maxSlides slides, each with ≥ 1 block
 *  - every block.type ∈ rules.allowedBlocks
 *  - text length ≤ the per-type limit (when a limit exists)
 *  - chart blocks carry chartDataRef; mockup blocks carry mockupRef
 */
function arbConformingPlanFor(rules: MasterTemplateRules): fc.Arbitrary<ContentPlan> {
  const allowed = [...rules.allowedBlocks];
  const ratios = [...rules.aspectRatios];

  const arbBlock: fc.Arbitrary<ContentPlanBlock> = fc
    .constantFrom(...allowed)
    .chain((type) => {
      const limit = rules.textLimits.get(type);
      const textArb =
        limit !== undefined
          ? fc.option(fc.string({ maxLength: limit }), { nil: undefined })
          : fc.option(fc.string({ maxLength: 40 }), { nil: undefined });
      return textArb.map((text) => {
        const block: ContentPlanBlock = { type };
        if (text !== undefined) block.text = text;
        if (type === 'chart') block.chartDataRef = 'chart-ref';
        if (type === 'mockup') block.mockupRef = 'mockup-ref';
        return block;
      });
    });

  const arbSlideBlocks = fc.array(arbBlock, { minLength: 1, maxLength: 4 });

  return fc
    .array(arbSlideBlocks, { minLength: 1, maxLength: rules.maxSlides })
    .chain((slidesBlocks) =>
      fc.constantFrom(...ratios).map((aspectRatio) =>
        mkPlan(
          aspectRatio,
          slidesBlocks.map((blocks, index) => ({ index, blocks })),
        ),
      ),
    );
}

/**
 * Generates a ContentPlan that VIOLATES `rules` in at least one way. Each
 * variant is guaranteed to be rejected by `validate`:
 *  - chart block without chartDataRef        (R5, or R3 if chart disallowed)
 *  - mockup block without mockupRef           (R6, or R3 if mockup disallowed)
 *  - a slide with zero blocks                 (R7)
 *  - zero slides                              (R2b)
 *  - more than maxSlides slides               (R2)
 *  - aspectRatio not in aspectRatios          (R1)
 *  - a disallowed block type                  (R3)
 *  - text exceeding a per-type limit          (R4)
 */
function arbViolatingPlanFor(rules: MasterTemplateRules): fc.Arbitrary<ContentPlan> {
  const allowed = [...rules.allowedBlocks];
  const ratios = [...rules.aspectRatios];
  const goodRatio = ratios[0]!;
  const anyAllowed = allowed[0]!;
  const disallowed = ALL_BLOCKS.filter((b) => !rules.allowedBlocks.has(b));
  const badRatios = ALL_RATIOS.filter((r) => !rules.aspectRatios.has(r));
  const limitedTypes = ALL_BLOCKS.filter((b) => rules.textLimits.has(b));

  const validBlock = (type: BlockType): ContentPlanBlock => {
    const block: ContentPlanBlock = { type };
    const limit = rules.textLimits.get(type);
    block.text = 'x'.repeat(limit !== undefined ? Math.min(limit, 3) : 1);
    if (type === 'chart') block.chartDataRef = 'ref';
    if (type === 'mockup') block.mockupRef = 'ref';
    return block;
  };

  const chartNoRef: ContentPlanBlock = { type: 'chart' };
  const mockupNoRef: ContentPlanBlock = { type: 'mockup' };

  const variants: fc.Arbitrary<ContentPlan>[] = [
    // chart block missing chartDataRef
    fc.constant(mkPlan(goodRatio, [{ index: 0, blocks: [chartNoRef] }])),
    // mockup block missing mockupRef
    fc.constant(mkPlan(goodRatio, [{ index: 0, blocks: [mockupNoRef] }])),
    // a slide with no blocks
    fc.constant(mkPlan(goodRatio, [{ index: 0, blocks: [] }])),
    // zero slides
    fc.constant(mkPlan(goodRatio, [])),
    // too many slides (each otherwise-valid)
    fc.constant(
      mkPlan(
        goodRatio,
        Array.from({ length: rules.maxSlides + 1 }, (_, i) => ({
          index: i,
          blocks: [validBlock(anyAllowed)],
        })),
      ),
    ),
  ];

  if (badRatios.length > 0) {
    variants.push(
      fc
        .constantFrom(...badRatios)
        .map((ratio) =>
          mkPlan(ratio, [{ index: 0, blocks: [validBlock(anyAllowed)] }]),
        ),
    );
  }

  if (disallowed.length > 0) {
    variants.push(
      fc.constantFrom(...disallowed).map((type) => {
        const block: ContentPlanBlock = { type, text: 'x' };
        if (type === 'chart') block.chartDataRef = 'ref';
        if (type === 'mockup') block.mockupRef = 'ref';
        return mkPlan(goodRatio, [{ index: 0, blocks: [block] }]);
      }),
    );
  }

  if (limitedTypes.length > 0) {
    variants.push(
      fc.constantFrom(...limitedTypes).map((type) => {
        const limit = rules.textLimits.get(type)!;
        const block: ContentPlanBlock = { type, text: 'x'.repeat(limit + 1) };
        if (type === 'chart') block.chartDataRef = 'ref';
        if (type === 'mockup') block.mockupRef = 'ref';
        return mkPlan(goodRatio, [{ index: 0, blocks: [block] }]);
      }),
    );
  }

  return fc.oneof(...variants);
}

// ---------------------------------------------------------------------------
// Property 8 — Content_Plan yang sesuai aturan dinyatakan valid
// ---------------------------------------------------------------------------

describe('DefaultContentPlanValidator — Property 8: Content_Plan yang sesuai aturan dinyatakan valid', () => {
  // Feature: ai-content-carousel-generator, Property 8: Content_Plan yang sesuai aturan dinyatakan valid
  // **Validates: Requirements 4.1, 4.2**

  const validator = new DefaultContentPlanValidator();

  it('returns valid=true with an empty error list for every rule-conforming plan', () => {
    fc.assert(
      fc.property(
        arbRules.chain((rules) =>
          arbConformingPlanFor(rules).map((plan) => ({ rules, plan })),
        ),
        ({ rules, plan }) => {
          const outcome = validator.validate(plan, rules);
          expect(outcome.valid).toBe(true);
          expect(outcome.errors).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9 — Penolakan, perbaikan terbatas, dan fail-closed validasi
// ---------------------------------------------------------------------------

/**
 * Deterministic model of the worker's validation gate (carousel-worker.ts,
 * Step 6). It consumes a `ContentPlanValidator` exactly as the worker does:
 *   - validate(plan) inside try/catch; a throw → fail-closed validation_error
 *   - if invalid, attempt EXACTLY ONE repair via the planner
 *   - re-validate the repaired plan (try/catch; throw → validation_error)
 *   - if still invalid OR repair planner failed → validation_error
 *   - the renderer is reached ONLY when validation ultimately passes
 */
interface GateTrace {
  result: { status: 'success' } | { status: 'failed'; reason: FailureReason };
  repairCalls: number;
  renderCalls: number;
}

function runValidationGate(
  validator: ContentPlanValidator,
  plan: ContentPlan,
  rules: MasterTemplateRules,
  repairPlanner: () => ContentPlan | null,
  onRender: () => void,
): GateTrace {
  let repairCalls = 0;
  let renderCalls = 0;

  let outcome: ValidationOutcome;
  try {
    outcome = validator.validate(plan, rules);
  } catch {
    return { result: { status: 'failed', reason: 'validation_error' }, repairCalls, renderCalls };
  }

  let finalPlan = plan;
  if (!outcome.valid) {
    repairCalls += 1; // repair attempted AT MOST once
    const repaired = repairPlanner();
    if (repaired === null) {
      return { result: { status: 'failed', reason: 'validation_error' }, repairCalls, renderCalls };
    }

    let repairOutcome: ValidationOutcome;
    try {
      repairOutcome = validator.validate(repaired, rules);
    } catch {
      return { result: { status: 'failed', reason: 'validation_error' }, repairCalls, renderCalls };
    }

    if (!repairOutcome.valid) {
      return { result: { status: 'failed', reason: 'validation_error' }, repairCalls, renderCalls };
    }
    finalPlan = repaired;
  }

  // Validation passed → renderer may run.
  void finalPlan;
  renderCalls += 1;
  onRender();
  return { result: { status: 'success' }, repairCalls, renderCalls };
}

/** A fault-injected validator whose `validate` always throws. */
class ThrowingValidator implements ContentPlanValidator {
  validate(): ValidationOutcome {
    throw new Error('injected validator failure');
  }
}

describe('DefaultContentPlanValidator — Property 9: Penolakan, perbaikan terbatas, dan fail-closed validasi', () => {
  // Feature: ai-content-carousel-generator, Property 9: Penolakan, perbaikan terbatas, dan fail-closed validasi
  // **Validates: Requirements 4.3, 4.4, 4.5, 9.4**

  const validator = new DefaultContentPlanValidator();

  // (a) Any rule-violating plan → valid=false with a non-empty error list.
  it('a) rejects every rule-violating plan with valid=false and non-empty errors', () => {
    fc.assert(
      fc.property(
        arbRestrictiveRules.chain((rules) =>
          arbViolatingPlanFor(rules).map((plan) => ({ rules, plan })),
        ),
        ({ rules, plan }) => {
          const outcome = validator.validate(plan, rules);
          expect(outcome.valid).toBe(false);
          expect(outcome.errors.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // (b) Non-JSON / structurally-invalid Planner output is treated as invalid
  //     (parseContentPlan fails ⇒ the plan can never reach the renderer).
  it('b) treats non-JSON / unparseable Planner output as invalid', () => {
    const arbNonPlan = fc.oneof(
      fc.string(),
      fc.double(),
      fc.boolean(),
      fc.constant(null),
      fc.constant(undefined),
      fc.array(fc.anything()),
      // objects that are missing required ContentPlan keys
      fc.record({ foo: fc.anything() }),
      // object with an invalid aspectRatio enum value
      fc.record({
        aspectRatio: fc.string().filter((s) => !ALL_RATIOS.includes(s as AspectRatio)),
        slides: fc.constant([]),
      }),
    );

    fc.assert(
      fc.property(arbNonPlan, (raw) => {
        const parsed = parseContentPlan(raw);
        expect(parsed.ok).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // (c) FAIL-CLOSED via fault injection: a validator that THROWS forces the
  //     gate to fail with reason 'validation_error', NEVER calls the renderer,
  //     and never reaches the repair step.
  it('c) fails closed (validation_error) and never renders when the validator throws', () => {
    const throwing = new ThrowingValidator();
    fc.assert(
      fc.property(
        arbRules.chain((rules) =>
          fc.oneof(arbConformingPlanFor(rules), arbViolatingPlanFor(rules)).map((plan) => ({
            rules,
            plan,
          })),
        ),
        ({ rules, plan }) => {
          let rendered = false;
          const trace = runValidationGate(
            throwing,
            plan,
            rules,
            () => plan, // repair would succeed, but must never be reached
            () => {
              rendered = true;
            },
          );
          expect(trace.result.status).toBe('failed');
          if (trace.result.status === 'failed') {
            expect(trace.result.reason).toBe('validation_error');
          }
          expect(rendered).toBe(false);
          expect(trace.renderCalls).toBe(0);
          expect(trace.repairCalls).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  // (d) Limited repair + fail-closed: an invalid plan whose single repair is
  //     STILL invalid → gate fails 'validation_error', renderer never called,
  //     and repair is attempted EXACTLY once (≤ 1).
  it('d) attempts repair at most once and never renders when the repaired plan is still invalid', () => {
    fc.assert(
      fc.property(
        arbRestrictiveRules.chain((rules) =>
          fc
            .tuple(arbViolatingPlanFor(rules), arbViolatingPlanFor(rules))
            .map(([plan, repaired]) => ({ rules, plan, repaired })),
        ),
        ({ rules, plan, repaired }) => {
          let rendered = false;
          const trace = runValidationGate(
            validator,
            plan,
            rules,
            () => repaired, // repaired plan is also rule-violating
            () => {
              rendered = true;
            },
          );
          expect(trace.result.status).toBe('failed');
          if (trace.result.status === 'failed') {
            expect(trace.result.reason).toBe('validation_error');
          }
          expect(rendered).toBe(false);
          expect(trace.renderCalls).toBe(0);
          expect(trace.repairCalls).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  // (e) Limited repair recovery: an invalid plan whose single repair is valid
  //     → gate succeeds, renderer runs once, repair attempted exactly once.
  it('e) recovers via a single repair and renders once when the repaired plan is valid', () => {
    fc.assert(
      fc.property(
        arbRestrictiveRules.chain((rules) =>
          fc
            .tuple(arbViolatingPlanFor(rules), arbConformingPlanFor(rules))
            .map(([plan, repaired]) => ({ rules, plan, repaired })),
        ),
        ({ rules, plan, repaired }) => {
          let rendered = false;
          const trace = runValidationGate(
            validator,
            plan,
            rules,
            () => repaired, // repaired plan conforms
            () => {
              rendered = true;
            },
          );
          expect(trace.result.status).toBe('success');
          expect(rendered).toBe(true);
          expect(trace.renderCalls).toBe(1);
          expect(trace.repairCalls).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10 — Master menang atas Approved_Example
// ---------------------------------------------------------------------------

const arbApprovedExample: fc.Arbitrary<ApprovedExampleStructure> = fc.record({
  aspectRatio: fc.constantFrom(...ALL_RATIOS),
  tags: fc.array(fc.string(), { maxLength: 5 }),
  slides: fc.array(
    fc
      .record({
        blocks: fc.array(fc.constantFrom(...ALL_BLOCKS), { maxLength: 5 }),
        layoutVariant: fc.option(fc.string(), { nil: undefined }),
      })
      .map((s) => {
        // Omit `layoutVariant` entirely when absent (exactOptionalPropertyTypes).
        const slide: { blocks: BlockType[]; layoutVariant?: string } = { blocks: s.blocks };
        if (s.layoutVariant !== undefined) slide.layoutVariant = s.layoutVariant;
        return slide;
      }),
    { maxLength: 5 },
  ),
});

/**
 * Injects Approved_Example-derived hints into a plan's `layoutVariantHint`
 * fields (the ONLY channel through which an example may influence a plan,
 * per R8.2/R8.3). The validator must ignore these entirely.
 */
function injectExampleHints(
  plan: ContentPlan,
  example: ApprovedExampleStructure,
): ContentPlan {
  const exLen = example.slides.length;
  return {
    aspectRatio: plan.aspectRatio,
    slides: plan.slides.map((slide, i) => {
      const exSlide = exLen > 0 ? example.slides[i % exLen] : undefined;
      const hint = exSlide?.layoutVariant ?? `example-variant-${i}`;
      return { ...slide, layoutVariantHint: hint };
    }),
  };
}

describe('DefaultContentPlanValidator — Property 10: Master menang atas Approved_Example', () => {
  // Feature: ai-content-carousel-generator, Property 10: Master menang atas Approved_Example
  // **Validates: Requirements 8.8, 9.1, 9.2**

  const validator = new DefaultContentPlanValidator();

  // A rule-violating plan stays INVALID regardless of any injected
  // Approved_Example structure; the example-derived layoutVariantHint has no
  // effect on the outcome (validate takes only plan + rules).
  it('keeps a Master-violating plan invalid regardless of injected Approved_Example hints', () => {
    fc.assert(
      fc.property(
        arbRestrictiveRules.chain((rules) =>
          fc
            .tuple(arbViolatingPlanFor(rules), arbApprovedExample)
            .map(([plan, example]) => ({ rules, plan, example })),
        ),
        ({ rules, plan, example }) => {
          const baseline = validator.validate(plan, rules);
          // The plan must be rejected by the Master rules.
          expect(baseline.valid).toBe(false);

          // Injecting example-derived hints must NOT rescue it; the outcome
          // (valid flag and the exact error list) is identical.
          const withHints = injectExampleHints(plan, example);
          const hinted = validator.validate(withHints, rules);
          expect(hinted.valid).toBe(false);
          expect(hinted.errors).toEqual(baseline.errors);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Symmetrically, an Approved_Example hint cannot make a conforming plan
  // invalid either — the hint is inert; Master_Template alone decides.
  it('leaves a conforming plan valid even when an Approved_Example hint is injected', () => {
    fc.assert(
      fc.property(
        arbRules.chain((rules) =>
          fc
            .tuple(arbConformingPlanFor(rules), arbApprovedExample)
            .map(([plan, example]) => ({ rules, plan, example })),
        ),
        ({ rules, plan, example }) => {
          const withHints = injectExampleHints(plan, example);
          const outcome = validator.validate(withHints, rules);
          expect(outcome.valid).toBe(true);
          expect(outcome.errors).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
