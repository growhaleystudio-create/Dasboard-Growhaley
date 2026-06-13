/**
 * Unit tests for ApprovedExampleService (task 11.1)
 *
 * Tests use in-memory fakes for all repository / audit dependencies so
 * no database connection is required.
 *
 * Requirements: 8.1, 8.5, 8.6
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import type { ApprovedExampleStructure, AspectRatio, BlockType } from '@leads-generator/shared';

import { ApprovedExampleService } from './approved-example-service.js';
import type { ApprovedExampleResult } from '../repository/approved-example-repository.js';
import type { JobFullRow } from '../repository/content-generation-job-repository.js';
import type { SlideResult } from '../repository/content-generation-slide-repository.js';
import type { AuditEntry, AuditLog } from '../privacy/audit-log.js';

// ---------------------------------------------------------------------------
// In-memory fakes
// ---------------------------------------------------------------------------

function makeJobRow(overrides?: Partial<JobFullRow>): JobFullRow {
  return {
    id: 'job-1',
    teamId: 'team-1',
    masterTemplateId: null,
    prompt: 'test prompt',
    aspectRatio: '1:1' as AspectRatio,
    status: 'success',
    reason: null,
    inputs: {},
    createdAt: new Date('2024-01-01'),
    finishedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeSlideResult(
  jobId: string,
  index: number,
  blocks: BlockType[],
): SlideResult {
  return {
    jobId,
    index,
    status: 'success',
    imageUrl: `https://cdn.example.com/slide-${index}.png`,
    reason: null,
    usedFallback: false,
    blockComposition: blocks,
  };
}

/** Fake ApprovedExampleRepository backed by a Map. */
class FakeApprovedExampleRepo {
  private store = new Map<string, ApprovedExampleResult>();
  private nextId = 1;

  async insert(
    teamId: string,
    data: {
      layoutStructure: ApprovedExampleStructure;
      tags: string[];
      aspectRatio: AspectRatio;
      sourceJobId?: string | null;
    },
  ): Promise<ApprovedExampleResult> {
    const id = `example-${this.nextId++}`;
    const row: ApprovedExampleResult = {
      id,
      teamId,
      layoutStructure: data.layoutStructure,
      tags: data.tags,
      aspectRatio: data.aspectRatio,
      sourceJobId: data.sourceJobId ?? null,
      createdAt: new Date(),
    };
    this.store.set(id, row);
    return row;
  }

  async delete(teamId: string, exampleId: string): Promise<boolean> {
    const row = this.store.get(exampleId);
    if (!row || row.teamId !== teamId) return false;
    this.store.delete(exampleId);
    return true;
  }

  async listForTeam(teamId: string): Promise<ApprovedExampleResult[]> {
    return [...this.store.values()]
      .filter((r) => r.teamId === teamId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findById(teamId: string, id: string): Promise<ApprovedExampleResult | null> {
    const row = this.store.get(id);
    if (!row || row.teamId !== teamId) return null;
    return row;
  }
}

/** Fake ContentGenerationJobRepository. */
class FakeJobRepo {
  private jobs = new Map<string, JobFullRow>();

  seed(job: JobFullRow): void {
    this.jobs.set(`${job.teamId}:${job.id}`, job);
  }

  async findById(teamId: string, jobId: string): Promise<JobFullRow | null> {
    return this.jobs.get(`${teamId}:${jobId}`) ?? null;
  }
}

/** Fake ContentGenerationSlideRepository. */
class FakeSlideRepo {
  private slides = new Map<string, SlideResult[]>();

  seed(teamId: string, jobId: string, results: SlideResult[]): void {
    this.slides.set(`${teamId}:${jobId}`, results);
  }

  async listSlides(teamId: string, jobId: string): Promise<SlideResult[]> {
    return this.slides.get(`${teamId}:${jobId}`) ?? [];
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
// Test setup helpers
// ---------------------------------------------------------------------------

function buildSut(): {
  sut: ApprovedExampleService;
  exampleRepo: FakeApprovedExampleRepo;
  jobRepo: FakeJobRepo;
  slideRepo: FakeSlideRepo;
  audit: FakeAuditLog;
} {
  const exampleRepo = new FakeApprovedExampleRepo();
  const jobRepo = new FakeJobRepo();
  const slideRepo = new FakeSlideRepo();
  const audit = new FakeAuditLog();

  const sut = new ApprovedExampleService(
    exampleRepo as never,
    jobRepo as never,
    slideRepo as never,
    audit,
  );

  return { sut, exampleRepo, jobRepo, slideRepo, audit };
}

// ---------------------------------------------------------------------------
// Tests: approve
// ---------------------------------------------------------------------------

describe('ApprovedExampleService.approve', () => {
  it('returns ok with the approved example when job exists', async () => {
    const { sut, jobRepo, slideRepo } = buildSut();

    const job = makeJobRow({ id: 'job-1', teamId: 'team-1', aspectRatio: '9:16' });
    jobRepo.seed(job);
    slideRepo.seed('team-1', 'job-1', [
      makeSlideResult('job-1', 0, ['heading', 'body']),
      makeSlideResult('job-1', 1, ['image', 'cta']),
    ]);

    const result = await sut.approve('team-1', 'actor-1', 'job-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.teamId).toBe('team-1');
    expect(result.value.sourceJobId).toBe('job-1');
    expect(result.value.structure.aspectRatio).toBe('9:16');
    expect(result.value.structure.slides).toHaveLength(2);
    expect(result.value.structure.slides[0]!.blocks).toEqual(['heading', 'body']);
    expect(result.value.structure.slides[1]!.blocks).toEqual(['image', 'cta']);
  });

  it('structure contains no brand data (tags array is empty by default)', async () => {
    const { sut, jobRepo, slideRepo } = buildSut();

    jobRepo.seed(makeJobRow({ id: 'job-2', teamId: 'team-1' }));
    slideRepo.seed('team-1', 'job-2', [makeSlideResult('job-2', 0, ['heading'])]);

    const result = await sut.approve('team-1', 'actor-1', 'job-2');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Tags must be an empty array (structure-only, no brand metadata)
    expect(result.value.structure.tags).toEqual([]);
  });

  it('emits a content_manage audit entry with op=approve', async () => {
    const { sut, jobRepo, slideRepo, audit } = buildSut();

    jobRepo.seed(makeJobRow({ id: 'job-3', teamId: 'team-1' }));
    slideRepo.seed('team-1', 'job-3', [makeSlideResult('job-3', 0, ['body'])]);

    const result = await sut.approve('team-1', 'actor-audit', 'job-3');
    expect(result.ok).toBe(true);

    expect(audit.entries).toHaveLength(1);
    const entry = audit.entries[0]!;
    expect(entry.teamId).toBe('team-1');
    expect(entry.actorId).toBe('actor-audit');
    expect(entry.action).toBe('content_manage');
    expect(entry.objectType).toBe('approved_example');
    expect(entry.metadata).toMatchObject({ op: 'approve', jobId: 'job-3' });
  });

  it('returns NOT_FOUND when job does not exist', async () => {
    const { sut } = buildSut();

    const result = await sut.approve('team-1', 'actor-1', 'nonexistent-job');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('returns NOT_FOUND when job belongs to a different team (tenant isolation)', async () => {
    const { sut, jobRepo, slideRepo } = buildSut();

    // Job is seeded for team-A
    jobRepo.seed(makeJobRow({ id: 'job-x', teamId: 'team-A' }));
    slideRepo.seed('team-A', 'job-x', [makeSlideResult('job-x', 0, ['heading'])]);

    // team-B tries to approve team-A's job
    const result = await sut.approve('team-B', 'actor-1', 'job-x');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('stores one example per approve call (no duplicate merging)', async () => {
    const { sut, jobRepo, slideRepo, exampleRepo } = buildSut();

    jobRepo.seed(makeJobRow({ id: 'job-4', teamId: 'team-1' }));
    slideRepo.seed('team-1', 'job-4', [makeSlideResult('job-4', 0, ['cta'])]);

    await sut.approve('team-1', 'actor-1', 'job-4');
    await sut.approve('team-1', 'actor-1', 'job-4');

    const listed = await exampleRepo.listForTeam('team-1');
    expect(listed).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: unapprove
// ---------------------------------------------------------------------------

describe('ApprovedExampleService.unapprove', () => {
  it('returns ok and removes the example on success', async () => {
    const { sut, jobRepo, slideRepo, exampleRepo } = buildSut();

    jobRepo.seed(makeJobRow({ id: 'job-5', teamId: 'team-1' }));
    slideRepo.seed('team-1', 'job-5', [makeSlideResult('job-5', 0, ['heading'])]);

    const approveResult = await sut.approve('team-1', 'actor-1', 'job-5');
    expect(approveResult.ok).toBe(true);
    if (!approveResult.ok) return;

    const exampleId = approveResult.value.id;

    const unapproveResult = await sut.unapprove('team-1', 'actor-1', exampleId);
    expect(unapproveResult.ok).toBe(true);

    // Example should no longer be in the library
    const listed = await exampleRepo.listForTeam('team-1');
    expect(listed).toHaveLength(0);
  });

  it('emits a content_manage audit entry with op=unapprove', async () => {
    const { sut, jobRepo, slideRepo, audit } = buildSut();

    jobRepo.seed(makeJobRow({ id: 'job-6', teamId: 'team-1' }));
    slideRepo.seed('team-1', 'job-6', [makeSlideResult('job-6', 0, ['body'])]);

    const approveResult = await sut.approve('team-1', 'actor-1', 'job-6');
    expect(approveResult.ok).toBe(true);
    if (!approveResult.ok) return;

    audit.entries.length = 0; // clear the approve audit entry

    await sut.unapprove('team-1', 'actor-1', approveResult.value.id);

    expect(audit.entries).toHaveLength(1);
    const entry = audit.entries[0]!;
    expect(entry.action).toBe('content_manage');
    expect(entry.metadata).toMatchObject({ op: 'unapprove' });
  });

  it('returns NOT_FOUND for a non-existent example id', async () => {
    const { sut } = buildSut();

    const result = await sut.unapprove('team-1', 'actor-1', 'does-not-exist');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('returns NOT_FOUND when example belongs to a different team (tenant isolation)', async () => {
    const { sut, jobRepo, slideRepo } = buildSut();

    // Create example under team-A
    jobRepo.seed(makeJobRow({ id: 'job-7', teamId: 'team-A' }));
    slideRepo.seed('team-A', 'job-7', [makeSlideResult('job-7', 0, ['stat'])]);
    const approveResult = await sut.approve('team-A', 'actor-1', 'job-7');
    expect(approveResult.ok).toBe(true);
    if (!approveResult.ok) return;

    // team-B tries to unapprove team-A's example
    const result = await sut.unapprove('team-B', 'actor-1', approveResult.value.id);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Tests: list
// ---------------------------------------------------------------------------

describe('ApprovedExampleService.list', () => {
  it('returns an empty array when no examples exist', async () => {
    const { sut } = buildSut();

    const result = await sut.list('team-empty');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('returns all examples for the team', async () => {
    const { sut, jobRepo, slideRepo } = buildSut();

    jobRepo.seed(makeJobRow({ id: 'job-a', teamId: 'team-2' }));
    jobRepo.seed(makeJobRow({ id: 'job-b', teamId: 'team-2' }));
    slideRepo.seed('team-2', 'job-a', [makeSlideResult('job-a', 0, ['heading'])]);
    slideRepo.seed('team-2', 'job-b', [makeSlideResult('job-b', 0, ['cta'])]);

    await sut.approve('team-2', 'actor-1', 'job-a');
    await sut.approve('team-2', 'actor-1', 'job-b');

    const result = await sut.list('team-2');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
  });

  it('scopes list to the requesting team — no cross-team leakage', async () => {
    const { sut, jobRepo, slideRepo } = buildSut();

    // Create examples for two different teams
    jobRepo.seed(makeJobRow({ id: 'job-t1', teamId: 'team-alpha' }));
    jobRepo.seed(makeJobRow({ id: 'job-t2', teamId: 'team-beta' }));
    slideRepo.seed('team-alpha', 'job-t1', [makeSlideResult('job-t1', 0, ['heading'])]);
    slideRepo.seed('team-beta', 'job-t2', [makeSlideResult('job-t2', 0, ['body'])]);

    await sut.approve('team-alpha', 'actor-1', 'job-t1');
    await sut.approve('team-beta', 'actor-1', 'job-t2');

    const result = await sut.list('team-alpha');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]!.teamId).toBe('team-alpha');
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

const BLOCK_TYPES: BlockType[] = [
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

const ASPECT_RATIOS: AspectRatio[] = ['1:1', '4:5', '9:16'];

const aspectRatioArb = fc.constantFrom<AspectRatio>(...ASPECT_RATIOS);
const blockArb = fc.constantFrom<BlockType>(...BLOCK_TYPES);
// A source carousel is an arbitrary, non-empty sequence of slides; each slide
// is an arbitrary (possibly empty) block composition.
const slidesArb = fc.array(fc.array(blockArb, { maxLength: 6 }), {
  minLength: 1,
  maxLength: 8,
});

describe('ApprovedExampleService — Property 22: Roundtrip & audit Approved_Example', () => {
  // Feature: ai-content-carousel-generator, Property 22: Roundtrip & audit Approved_Example
  // **Validates: Requirements 8.1**
  it('approve persists a brand-free layout structure equivalent to the source carousel, team-scoped, and writes exactly one content_manage Audit_Log entry', async () => {
    await fc.assert(
      fc.asyncProperty(
        aspectRatioArb,
        slidesArb,
        fc.string({ minLength: 1 }), // teamId
        fc.string({ minLength: 1 }), // actorId
        fc.string({ minLength: 1 }), // jobId
        async (aspectRatio, slideBlocks, teamId, actorId, jobId) => {
          // Fresh SUT per run so the audit log only reflects this approve call.
          const { sut, jobRepo, slideRepo, exampleRepo, audit } = buildSut();

          // Source Carousel / job whose layout structure is generated.
          jobRepo.seed(makeJobRow({ id: jobId, teamId, aspectRatio }));
          slideRepo.seed(
            teamId,
            jobId,
            slideBlocks.map((blocks, i) => makeSlideResult(jobId, i, blocks)),
          );

          const result = await sut.approve(teamId, actorId, jobId);

          expect(result.ok).toBe(true);
          if (!result.ok) return;

          // Layout structure equivalent to the source carousel structure
          // (structural JSON only — aspect ratio + per-slide blocks; brand-free).
          const expectedStructure: ApprovedExampleStructure = {
            aspectRatio,
            tags: [],
            slides: slideBlocks.map((blocks) => ({ blocks })),
          };

          // (1) Returned structure is equivalent to the source structure.
          expect(result.value.structure).toEqual(expectedStructure);

          // (2) Stored in the Example_Library, scoped to the team.
          const stored = await exampleRepo.listForTeam(teamId);
          expect(stored).toHaveLength(1);
          expect(stored[0]!.teamId).toBe(teamId);
          expect(stored[0]!.layoutStructure).toEqual(expectedStructure);

          // Same entry is surfaced via the team-scoped service.list.
          const listResult = await sut.list(teamId);
          expect(listResult.ok).toBe(true);
          if (listResult.ok) {
            expect(listResult.value).toHaveLength(1);
            expect(listResult.value[0]!.structure).toEqual(expectedStructure);
          }

          // (3) Brand-free: the structure carries no brand metadata
          // (no colors/fonts/logo keys) and tags stay empty.
          expect(Object.keys(result.value.structure).sort()).toEqual([
            'aspectRatio',
            'slides',
            'tags',
          ]);
          expect(result.value.structure.tags).toEqual([]);

          // (4) Exactly one Audit_Log entry, action content_manage.
          expect(audit.entries).toHaveLength(1);
          const entry = audit.entries[0]!;
          expect(entry.action).toBe('content_manage');
          expect(entry.teamId).toBe(teamId);
          expect(entry.objectType).toBe('approved_example');
        },
      ),
      { numRuns: 100 },
    );
  });
});
