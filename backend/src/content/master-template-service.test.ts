/**
 * Property-based tests for MasterTemplateService (tasks 6.2 and 6.3).
 *
 * Uses fast-check (>= 100 runs) with fully in-memory fakes for the repository
 * and audit dependencies — no database connection required.
 *
 * Covers:
 *   - Property 4: Roundtrip Master_Template & aturan Planner (Requirements 2.1, 2.2)
 *   - Property 5: Validasi Master_Template menolak masukan tak valid (Requirements 2.3)
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type {
  AspectRatio,
  BlockType,
  BrandKit,
  MasterTemplate,
  TextLengthLimit,
} from '@leads-generator/shared';

import {
  MasterTemplateService,
  VALID_BLOCKS,
  VALID_RATIOS,
  type MasterTemplateInput,
} from './master-template-service.js';
import type { MasterTemplateRepository } from '../repository/master-template-repository.js';
import type { BrandKitRepository } from '../repository/brand-kit-repository.js';
import type { AuditEntry, AuditLog } from '../privacy/audit-log.js';

// ---------------------------------------------------------------------------
// In-memory fakes
// ---------------------------------------------------------------------------

/**
 * In-memory MasterTemplateRepository fake.
 * `upsert` stores and echoes the input plus a generated id/teamId/updatedAt;
 * `findByTeam` returns the currently stored template. Tracks how many times
 * `upsert` was invoked so negative tests can assert it was never called.
 */
class FakeMasterTemplateRepo {
  stored: MasterTemplate | null;
  upsertCount = 0;
  private nextId = 1;

  constructor(seed: MasterTemplate | null = null) {
    this.stored = seed;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async findByTeam(_teamId: string): Promise<MasterTemplate | null> {
    return this.stored;
  }

  async upsert(
    teamId: string,
    data: {
      brandKitId: string;
      allowedBlocks: BlockType[];
      maxSlides: number;
      textLimits: TextLengthLimit[];
      aspectRatios: AspectRatio[];
      defaultTone: string;
    },
  ): Promise<MasterTemplate> {
    this.upsertCount++;
    const saved: MasterTemplate = {
      id: this.stored?.id ?? `mt-${this.nextId++}`,
      teamId,
      brandKitId: data.brandKitId,
      allowedBlocks: data.allowedBlocks,
      maxSlides: data.maxSlides,
      textLimits: data.textLimits,
      aspectRatios: data.aspectRatios,
      defaultTone: data.defaultTone,
      updatedAt: new Date(),
    };
    this.stored = saved;
    return saved;
  }
}

/** In-memory BrandKitRepository fake — only `findByTeam` is exercised. */
class FakeBrandKitRepo {
  constructor(private readonly kit: BrandKit | null) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async findByTeam(_teamId: string): Promise<BrandKit | null> {
    return this.kit;
  }
}

/** Fake AuditLog that records entries in memory. */
class FakeAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];

  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }

  async recordTx(_tx: unknown, entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function makeBrandKit(teamId = 'team-1'): BrandKit {
  return {
    id: 'bk-1',
    teamId,
    logoUrl: 'https://cdn.example.com/logo.png',
    fonts: [{ id: 'f-1', url: 'https://cdn.example.com/font.ttf', family: 'Inter' }],
    colors: ['#112233'],
    chrome: { logoPlacement: 'top-left', pageNumberFormat: '{current}/{total}', siteUrl: 'https://example.com' },
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  };
}

function makeSeedTemplate(teamId = 'team-1'): MasterTemplate {
  return {
    id: 'mt-seed',
    teamId,
    brandKitId: 'bk-1',
    allowedBlocks: ['heading', 'body'],
    maxSlides: 5,
    textLimits: [{ blockType: 'heading', maxChars: 80 }],
    aspectRatios: ['1:1'],
    defaultTone: 'professional',
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  };
}

function buildSut(opts: { brandKit: BrandKit | null; seedTemplate?: MasterTemplate | null }) {
  const templateRepo = new FakeMasterTemplateRepo(opts.seedTemplate ?? null);
  const brandKitRepo = new FakeBrandKitRepo(opts.brandKit);
  const audit = new FakeAuditLog();
  const sut = new MasterTemplateService(
    templateRepo as unknown as MasterTemplateRepository,
    brandKitRepo as unknown as BrandKitRepository,
    audit,
  );
  return { sut, templateRepo, brandKitRepo, audit };
}

function sameSet<T>(a: Iterable<T>, b: Iterable<T>): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Shared arbitraries
// ---------------------------------------------------------------------------

/** Unique-by-blockType text limits with maxChars > 0 (so map roundtrip is clean). */
const textLimitsArb: fc.Arbitrary<TextLengthLimit[]> = fc.uniqueArray(
  fc.record({
    blockType: fc.constantFrom(...VALID_BLOCKS),
    maxChars: fc.integer({ min: 1, max: 5000 }),
  }),
  { selector: (x) => x.blockType },
);

/** A fully valid MasterTemplateInput (brand kit assumed to exist on the team). */
const validInputArb: fc.Arbitrary<MasterTemplateInput> = fc.record({
  brandKitId: fc.string(),
  allowedBlocks: fc.subarray([...VALID_BLOCKS], { minLength: 1 }),
  maxSlides: fc.integer({ min: 1, max: 10 }),
  textLimits: textLimitsArb,
  aspectRatios: fc.subarray([...VALID_RATIOS], { minLength: 1 }),
  defaultTone: fc.string(),
});

// ---------------------------------------------------------------------------
// Task 6.2 — Property 4
// ---------------------------------------------------------------------------

describe('MasterTemplateService — Property 4 (roundtrip + Planner rules)', () => {
  // Feature: ai-content-carousel-generator, Property 4: Roundtrip Master_Template & aturan Planner
  // **Validates: Requirements 2.1, 2.2**
  it('save then rules returns identical allowedBlocks, maxSlides, textLimits, aspectRatios, defaultTone and writes exactly one content_manage audit entry', async () => {
    await fc.assert(
      fc.asyncProperty(validInputArb, async (input) => {
        const { sut, audit } = buildSut({ brandKit: makeBrandKit() });

        const saveResult = await sut.save('team-1', 'actor-1', input);
        expect(saveResult.ok).toBe(true);

        const rulesResult = await sut.rules('team-1');
        expect(rulesResult.ok).toBe(true);
        if (!rulesResult.ok) return;
        const rules = rulesResult.value;

        // allowedBlocks: set-equal to input
        expect(sameSet(rules.allowedBlocks, input.allowedBlocks)).toBe(true);

        // maxSlides: identical
        expect(rules.maxSlides).toBe(input.maxSlides);

        // aspectRatios: set-equal to input
        expect(sameSet(rules.aspectRatios, input.aspectRatios)).toBe(true);

        // textLimits: map matches input (unique keys guarantee size equality)
        expect(rules.textLimits.size).toBe(input.textLimits.length);
        for (const limit of input.textLimits) {
          expect(rules.textLimits.get(limit.blockType)).toBe(limit.maxChars);
        }

        // defaultTone: identical
        expect(rules.defaultTone).toBe(input.defaultTone);

        // brandKitId is also carried through (sanity)
        expect(rules.brandKitId).toBe(input.brandKitId);

        // Exactly ONE content_manage audit entry was written for the save.
        expect(audit.entries).toHaveLength(1);
        expect(audit.entries[0]!.action).toBe('content_manage');
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 6.3 — Property 5
// ---------------------------------------------------------------------------

/** Invalid maxSlides values: <= 0, > 10, or non-integer in range. */
const invalidMaxSlidesArb = fc.oneof(
  fc.integer({ min: -50, max: 0 }),
  fc.integer({ min: 11, max: 50 }),
  fc.double({ min: 1.1, max: 9.9, noNaN: true }).filter((n) => !Number.isInteger(n)),
);

type Violation =
  | { kind: 'brandkit_absent'; input: MasterTemplateInput }
  | { kind: 'bad_block'; input: MasterTemplateInput; badBlock: string }
  | { kind: 'bad_maxslides'; input: MasterTemplateInput }
  | { kind: 'bad_ratio'; input: MasterTemplateInput };

const violationArb: fc.Arbitrary<Violation> = fc.oneof(
  // (a) Brand_Kit absent — input otherwise valid; repo returns null.
  validInputArb.map((input) => ({ kind: 'brandkit_absent' as const, input })),

  // (b) allowedBlocks contains a type outside the 9 valid types.
  fc
    .tuple(validInputArb, fc.constantFrom('video', 'table', 'gif', 'embed', 'audio'))
    .map(([input, badBlock]) => ({
      kind: 'bad_block' as const,
      input: { ...input, allowedBlocks: [...input.allowedBlocks, badBlock as BlockType] },
      badBlock,
    })),

  // (c) maxSlides outside 1..10 (or non-integer).
  fc.tuple(validInputArb, invalidMaxSlidesArb).map(([input, maxSlides]) => ({
    kind: 'bad_maxslides' as const,
    input: { ...input, maxSlides },
  })),

  // (d) aspectRatios empty or containing an unsupported ratio.
  fc
    .tuple(
      validInputArb,
      fc.oneof(
        fc.constant([] as AspectRatio[]),
        fc.constantFrom('16:9', '3:4', '2:1', '21:9').map((r) => [r as AspectRatio]),
      ),
    )
    .map(([input, aspectRatios]) => ({
      kind: 'bad_ratio' as const,
      input: { ...input, aspectRatios },
    })),
);

describe('MasterTemplateService — Property 5 (rejects invalid input, no mutation)', () => {
  // Feature: ai-content-carousel-generator, Property 5: Validasi Master_Template menolak masukan tak valid
  // **Validates: Requirements 2.3**
  it('rejects invalid input with VALIDATION + non-empty messages, never upserts, and leaves the existing template unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(violationArb, async (violation) => {
        const brandKit = violation.kind === 'brandkit_absent' ? null : makeBrandKit();
        const seed = makeSeedTemplate();
        // Deep snapshot of the pre-existing template to prove it is unchanged.
        const snapshot = structuredClone(seed);

        const { sut, templateRepo, audit } = buildSut({ brandKit, seedTemplate: seed });

        const result = await sut.save('team-1', 'actor-1', violation.input);

        // Rejected as VALIDATION with at least one message.
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.code).toBe('VALIDATION');
        if (result.error.code !== 'VALIDATION') return;
        expect(result.error.messages.length).toBeGreaterThan(0);

        // upsert was never called; the existing template is byte-identical.
        expect(templateRepo.upsertCount).toBe(0);
        expect(templateRepo.stored).toEqual(snapshot);

        // No audit entry is written on rejection.
        expect(audit.entries).toHaveLength(0);

        // Messages reference the violated rule.
        const messages = result.error.messages;
        switch (violation.kind) {
          case 'brandkit_absent':
            expect(messages.some((m) => m.includes('Brand_Kit'))).toBe(true);
            break;
          case 'bad_block':
            expect(messages.some((m) => m.includes(violation.badBlock))).toBe(true);
            break;
          case 'bad_maxslides':
            expect(messages.some((m) => m.includes('maxSlides'))).toBe(true);
            break;
          case 'bad_ratio':
            expect(
              messages.some(
                (m) => m.toLowerCase().includes('rasio') || m.includes('aspectRatios'),
              ),
            ).toBe(true);
            break;
        }
      }),
      { numRuns: 100 },
    );
  });
});
