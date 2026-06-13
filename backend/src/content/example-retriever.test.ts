/**
 * Unit tests for DefaultExampleRetriever (task 11.2)
 *
 * Tests use an in-memory fake repository — no database connection required.
 *
 * Requirements: 8.2, 8.4, 8.7
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import type { ApprovedExampleStructure, AspectRatio, BlockType } from '@leads-generator/shared';

import { DefaultExampleRetriever } from './example-retriever.js';
import type { RetrievalQuery } from './example-retriever.js';
import type {
  ApprovedExampleRepository,
  ApprovedExampleResult,
} from '../repository/approved-example-repository.js';

// ---------------------------------------------------------------------------
// In-memory fake
// ---------------------------------------------------------------------------

function makeResult(
  id: string,
  teamId: string,
  structure: ApprovedExampleStructure,
): ApprovedExampleResult {
  return {
    id,
    teamId,
    layoutStructure: structure,
    tags: structure.tags,
    aspectRatio: structure.aspectRatio,
    sourceJobId: null,
    createdAt: new Date('2024-01-01'),
  };
}

class FakeApprovedExampleRepo
  implements Pick<ApprovedExampleRepository, 'listForTeam'>
{
  private readonly store: ApprovedExampleResult[];

  constructor(items: ApprovedExampleResult[] = []) {
    this.store = items;
  }

  async listForTeam(teamId: string): Promise<ApprovedExampleResult[]> {
    return this.store.filter((r) => r.teamId === teamId);
  }

  // Satisfy structural type requirements of the full interface
  async insert(): Promise<never> {
    throw new Error('not implemented in fake');
  }
  async delete(): Promise<never> {
    throw new Error('not implemented in fake');
  }
  async findById(): Promise<never> {
    throw new Error('not implemented in fake');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRetriever(items: ApprovedExampleResult[] = []): DefaultExampleRetriever {
  const repo = new FakeApprovedExampleRepo(items) as unknown as ApprovedExampleRepository;
  return new DefaultExampleRetriever(repo);
}

function makeStructure(
  aspectRatio: AspectRatio,
  tags: string[],
  slideBlocks: BlockType[][],
): ApprovedExampleStructure {
  return {
    aspectRatio,
    tags,
    slides: slideBlocks.map((blocks) => ({ blocks })),
  };
}

// ---------------------------------------------------------------------------
// Tests: empty library
// ---------------------------------------------------------------------------

describe('DefaultExampleRetriever.topRelevant — empty library', () => {
  it('returns [] when the example library is empty (R8.4)', async () => {
    const retriever = buildRetriever([]);
    const query: RetrievalQuery = {
      aspectRatio: '1:1',
      tags: ['product'],
      intendedBlocks: ['heading', 'body'],
    };

    const result = await retriever.topRelevant('team-1', query);

    expect(result).toEqual([]);
  });

  it('returns [] for a team with no examples even if another team has some', async () => {
    const items: ApprovedExampleResult[] = [
      makeResult('ex-1', 'team-other', makeStructure('1:1', ['product'], [['heading']])),
    ];
    const retriever = buildRetriever(items);
    const query: RetrievalQuery = {
      aspectRatio: '1:1',
      tags: ['product'],
      intendedBlocks: ['heading'],
    };

    const result = await retriever.topRelevant('team-1', query);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: aspect ratio match boosts score
// ---------------------------------------------------------------------------

describe('DefaultExampleRetriever.topRelevant — aspect ratio influence', () => {
  it('ranks examples with matching aspect ratio above non-matching ones (all else equal)', async () => {
    const matchingStructure = makeStructure('4:5', [], [['body']]);
    const nonMatchingStructure = makeStructure('1:1', [], [['body']]);

    const items: ApprovedExampleResult[] = [
      makeResult('ex-match', 'team-1', matchingStructure),
      makeResult('ex-nomatch', 'team-1', nonMatchingStructure),
    ];
    const retriever = buildRetriever(items);

    // Query for 4:5 with empty tags and blocks (so only aspect ratio differentiates)
    const query: RetrievalQuery = {
      aspectRatio: '4:5',
      tags: [],
      intendedBlocks: [],
    };

    const result = await retriever.topRelevant('team-1', query);

    // W_ASPECT=0.3 >= THRESHOLD=0.1, so at least the matching one should be included
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.aspectRatio).toBe('4:5');
  });

  it('filters out examples with only non-matching aspect ratio when score < threshold', async () => {
    // A non-matching example with no tags or block overlap scores 0 — below threshold
    const items: ApprovedExampleResult[] = [
      makeResult('ex-low', 'team-1', makeStructure('9:16', [], [['body']])),
    ];
    const retriever = buildRetriever(items);

    const query: RetrievalQuery = {
      aspectRatio: '1:1',
      tags: [],
      intendedBlocks: [],
    };

    const result = await retriever.topRelevant('team-1', query);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: perfect match returns first
// ---------------------------------------------------------------------------

describe('DefaultExampleRetriever.topRelevant — perfect match', () => {
  it('returns the perfect-match example first when multiple examples exist', async () => {
    const perfect = makeStructure('9:16', ['launch', 'B2B'], [['heading', 'body', 'cta']]);
    const partial = makeStructure('1:1', ['launch'], [['heading']]);
    const unrelated = makeStructure('4:5', ['recipe'], [['image', 'body']]);

    const items: ApprovedExampleResult[] = [
      makeResult('ex-partial', 'team-1', partial),
      makeResult('ex-unrelated', 'team-1', unrelated),
      makeResult('ex-perfect', 'team-1', perfect),
    ];
    const retriever = buildRetriever(items);

    const query: RetrievalQuery = {
      aspectRatio: '9:16',
      tags: ['launch', 'B2B'],
      intendedBlocks: ['heading', 'body', 'cta'],
    };

    const result = await retriever.topRelevant('team-1', query);

    expect(result.length).toBeGreaterThanOrEqual(1);
    // Perfect match must be ranked first
    expect(result[0]).toEqual(perfect);
  });

  it('perfect match scores 1.0 (all weights sum to 1)', async () => {
    // Verify via rank: a perfect match should beat any partial match
    const perfect = makeStructure('1:1', ['tag-a', 'tag-b'], [['heading', 'body']]);
    const partial = makeStructure('1:1', ['tag-a'], [['heading']]);

    const items: ApprovedExampleResult[] = [
      makeResult('ex-partial', 'team-1', partial),
      makeResult('ex-perfect', 'team-1', perfect),
    ];
    const retriever = buildRetriever(items);

    const query: RetrievalQuery = {
      aspectRatio: '1:1',
      tags: ['tag-a', 'tag-b'],
      intendedBlocks: ['heading', 'body'],
    };

    const result = await retriever.topRelevant('team-1', query);

    expect(result[0]).toEqual(perfect);
  });
});

// ---------------------------------------------------------------------------
// Tests: threshold filters low-score examples
// ---------------------------------------------------------------------------

describe('DefaultExampleRetriever.topRelevant — threshold filtering', () => {
  it('returns [] when no examples meet the threshold (R8.7)', async () => {
    // score=0: no tag overlap, wrong aspect ratio, no block overlap
    const items: ApprovedExampleResult[] = [
      makeResult('ex-1', 'team-1', makeStructure('9:16', ['unrelated'], [['chart']])),
    ];
    const retriever = buildRetriever(items);

    const query: RetrievalQuery = {
      aspectRatio: '1:1',
      tags: [],
      intendedBlocks: [],
    };

    const result = await retriever.topRelevant('team-1', query);

    expect(result).toEqual([]);
  });

  it('excludes low-scoring examples while keeping high-scoring ones', async () => {
    // High scorer: matching aspect (0.3) + matching tags (0.4) = 0.7  >=  threshold
    const highScore = makeStructure('4:5', ['promo'], [['heading', 'cta']]);
    // Zero scorer: nothing matches
    const lowScore = makeStructure('9:16', ['unrelated'], [['chart', 'stat']]);

    const items: ApprovedExampleResult[] = [
      makeResult('ex-high', 'team-1', highScore),
      makeResult('ex-low', 'team-1', lowScore),
    ];
    const retriever = buildRetriever(items);

    const query: RetrievalQuery = {
      aspectRatio: '4:5',
      tags: ['promo'],
      intendedBlocks: [],
    };

    const result = await retriever.topRelevant('team-1', query);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(highScore);
  });

  it('respects the n parameter — returns at most n results', async () => {
    const items: ApprovedExampleResult[] = Array.from({ length: 5 }, (_, i) =>
      makeResult(
        `ex-${i}`,
        'team-1',
        makeStructure('1:1', ['tag'], [['heading']]),
      ),
    );
    const retriever = buildRetriever(items);

    const query: RetrievalQuery = {
      aspectRatio: '1:1',
      tags: ['tag'],
      intendedBlocks: ['heading'],
    };

    const result = await retriever.topRelevant('team-1', query, 2);

    expect(result).toHaveLength(2);
  });

  it('defaults to n=3 when not specified', async () => {
    const items: ApprovedExampleResult[] = Array.from({ length: 5 }, (_, i) =>
      makeResult(
        `ex-${i}`,
        'team-1',
        makeStructure('1:1', ['tag'], [['heading']]),
      ),
    );
    const retriever = buildRetriever(items);

    const query: RetrievalQuery = {
      aspectRatio: '1:1',
      tags: ['tag'],
      intendedBlocks: ['heading'],
    };

    const result = await retriever.topRelevant('team-1', query);

    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Tests: flatBlockSet — union of all slides
// ---------------------------------------------------------------------------

describe('DefaultExampleRetriever — block scoring uses union across slides', () => {
  it('counts blocks from all slides when computing block similarity', async () => {
    // Two slides: slide 0 has 'heading', slide 1 has 'cta'
    // flatBlockSet = {heading, cta}
    const twoSlide = makeStructure('1:1', [], [['heading'], ['cta']]);
    // Single slide with only 'heading'
    const oneSlide = makeStructure('1:1', [], [['heading']]);

    const items: ApprovedExampleResult[] = [
      makeResult('ex-two', 'team-1', twoSlide),
      makeResult('ex-one', 'team-1', oneSlide),
    ];
    const retriever = buildRetriever(items);

    // Query asks for both 'heading' and 'cta'
    const query: RetrievalQuery = {
      aspectRatio: '1:1',
      tags: [],
      intendedBlocks: ['heading', 'cta'],
    };

    const result = await retriever.topRelevant('team-1', query);

    // twoSlide should rank higher (jaccard = 2/2 = 1) vs oneSlide (jaccard = 1/2 = 0.5)
    expect(result[0]).toEqual(twoSlide);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

/**
 * Mutable in-memory example source so we can simulate an `unapprove`
 * (removal) between successive retrievals.
 */
class MutableExampleRepo {
  private items: ApprovedExampleResult[];

  constructor(items: ApprovedExampleResult[]) {
    this.items = items;
  }

  async listForTeam(teamId: string): Promise<ApprovedExampleResult[]> {
    return this.items.filter((r) => r.teamId === teamId);
  }

  /** Remove an example by id (the effect of unapprove on the source). */
  remove(id: string): void {
    this.items = this.items.filter((r) => r.id !== id);
  }
}

// --- Reference scoring: must mirror DefaultExampleRetriever EXACTLY ---------
const W_TAG = 0.4;
const W_ASPECT = 0.3;
const W_BLOCK = 0.3;
const THRESHOLD = 0.1;

function jaccardRef(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function flatBlocksRef(structure: ApprovedExampleStructure): BlockType[] {
  const seen = new Set<BlockType>();
  for (const slide of structure.slides) {
    for (const block of slide.blocks) {
      seen.add(block);
    }
  }
  return [...seen];
}

function scoreRef(structure: ApprovedExampleStructure, query: RetrievalQuery): number {
  const tagScore = jaccardRef(structure.tags, query.tags);
  const aspectScore = structure.aspectRatio === query.aspectRatio ? 1 : 0;
  const blockScore = jaccardRef(flatBlocksRef(structure), query.intendedBlocks);
  return W_TAG * tagScore + W_ASPECT * aspectScore + W_BLOCK * blockScore;
}

// --- Generators ------------------------------------------------------------
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
const ALL_ASPECTS: AspectRatio[] = ['1:1', '4:5', '9:16'];
// Small tag pool so matches between examples and queries are likely but varied.
const TAG_POOL = ['product', 'launch', 'B2B', 'promo', 'recipe', 'tips'];

const aspectArb = fc.constantFrom<AspectRatio>(...ALL_ASPECTS);
const blockArb = fc.constantFrom<BlockType>(...ALL_BLOCKS);
const tagsArb = fc.uniqueArray(fc.constantFrom(...TAG_POOL), { maxLength: 4 });

const structureArb: fc.Arbitrary<ApprovedExampleStructure> = fc.record({
  aspectRatio: aspectArb,
  tags: tagsArb,
  slides: fc.array(fc.record({ blocks: fc.array(blockArb, { maxLength: 4 }) }), {
    minLength: 1,
    maxLength: 4,
  }),
});

const queryArb: fc.Arbitrary<RetrievalQuery> = fc.record({
  aspectRatio: aspectArb,
  tags: tagsArb,
  intendedBlocks: fc.uniqueArray(blockArb, { maxLength: 5 }),
});

const libraryArb = fc.array(structureArb, { maxLength: 8 });

describe('DefaultExampleRetriever — Property 23: Relevansi retrieval dan pembatalan persetujuan', () => {
  // Feature: ai-content-carousel-generator, Property 23: Relevansi retrieval dan pembatalan persetujuan
  // **Validates: Requirements 8.2, 8.4, 8.6, 8.7**
  it('returns only examples with score >= threshold (empty when none relevant or library empty), capped at n, sorted by descending score; an unapproved example is never returned afterwards', async () => {
    await fc.assert(
      fc.asyncProperty(
        libraryArb,
        queryArb,
        fc.integer({ min: 1, max: 6 }),
        async (structures, query, n) => {
          const teamId = 'team-1';
          const items = structures.map((s, i) => makeResult(`ex-${i}`, teamId, s));
          const repo = new MutableExampleRepo(items);
          const retriever = new DefaultExampleRetriever(
            repo as unknown as ApprovedExampleRepository,
          );

          const results = await retriever.topRelevant(teamId, query, n);

          // (b) Never returns more than n results.
          expect(results.length).toBeLessThanOrEqual(n);

          // (a) Every returned example has relevance score >= threshold.
          for (const r of results) {
            expect(scoreRef(r, query)).toBeGreaterThanOrEqual(THRESHOLD);
          }

          // (d) Results are sorted by descending relevance score.
          for (let i = 1; i < results.length; i++) {
            expect(scoreRef(results[i - 1]!, query)).toBeGreaterThanOrEqual(
              scoreRef(results[i]!, query),
            );
          }

          // (c) Empty library OR no example meeting the threshold => [].
          const anyRelevant = items.some(
            (it) => scoreRef(it.layoutStructure, query) >= THRESHOLD,
          );
          if (items.length === 0 || !anyRelevant) {
            expect(results).toEqual([]);
          } else {
            // Some example is relevant, so retrieval surfaces at least one.
            expect(results.length).toBeGreaterThanOrEqual(1);
          }

          // (e) After an Approved_Example is unapproved (removed from the
          // source), it is never returned by a subsequent retrieval.
          if (results.length > 0) {
            // The retriever returns the exact stored structure reference, so we
            // can identify the source example by reference identity.
            const removed = items.find((it) => it.layoutStructure === results[0]);
            if (removed) {
              repo.remove(removed.id);
              const after = await retriever.topRelevant(teamId, query, n);
              for (const r of after) {
                expect(r).not.toBe(removed.layoutStructure);
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
