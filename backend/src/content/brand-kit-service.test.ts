/**
 * Property-based tests for {@link BrandKitService}.
 *
 * Two design-level Correctness Properties live here (fast-check, numRuns:100):
 *
 * - **Property 1: Roundtrip & audit penyimpanan Brand_Kit**
 *   **Validates: Requirements 1.1, 1.2** — for every valid Brand_Kit input
 *   (transparent PNG logo ≤ 5 MB, ≥ 1 .ttf/.otf font ≤ 5 MB, ≥ 1 valid hex
 *   color, complete chrome), `save` then `get` returns logo/fonts as
 *   Object_Storage URL references, colors and chrome identical to the input,
 *   and writes exactly one Audit_Log entry (`content_manage`).
 *
 * - **Property 2: Validasi Brand_Kit menolak tanpa partial-save**
 *   **Validates: Requirements 1.3, 1.4** — for every input that violates one
 *   or more rules, `save` rejects with VALIDATION + a non-empty `messages`
 *   array, uploads zero assets, never calls `insert`, leaves any existing
 *   Brand_Kit unchanged, and returns ALL applicable messages at once.
 *
 * The collaborators are lightweight in-memory fakes (no real DB / network):
 *   - FakeObjectStorage: records every upload and returns an https URL.
 *   - FakeBrandKitRepository: in-memory kit + fonts keyed by team.
 *   - FakeAuditLog: records each audit entry into an array.
 *   - A minimal fake `Pool` whose `connect()` returns a client satisfying
 *     `withTransaction` (query/release) so the transaction body runs for real.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import type {
  BrandFont,
  BrandFontInput,
  BrandKit,
  BrandKitInput,
  ChromeDefinition,
  Result,
} from '@leads-generator/shared';
import { ok, err } from '@leads-generator/shared';

import type { Pool } from 'pg';
import type { Tx } from '../db/transaction.js';
import type { AuditEntry, AuditLog } from '../privacy/audit-log.js';
import type { BrandKitRepository } from '../repository/brand-kit-repository.js';
import type { ObjectStorage } from '../storage/object-storage.js';
import { BrandKitService } from './brand-kit-service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — mirrors the validation constant.
const VALID_BYTES = Buffer.from([1, 2, 3, 4]);

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** Records every upload; always succeeds with an https URL reference. */
class FakeObjectStorage implements ObjectStorage {
  uploadCalls = 0;
  readonly uploaded: Array<{ teamId: string; key: string; contentType: string; size: number }> =
    [];

  async upload(
    teamId: string,
    key: string,
    bytes: Buffer,
    contentType: string,
  ): Promise<Result<string>> {
    this.uploadCalls += 1;
    this.uploaded.push({ teamId, key, contentType, size: bytes.length });
    return ok(`https://storage.test/${teamId}/${key}`);
  }

  async resolveForTeam(_teamId: string, objectUrl: string): Promise<Result<string>> {
    return ok(objectUrl);
  }
}

/** Variant whose every upload fails — used to assert no partial-save. */
class FailingObjectStorage implements ObjectStorage {
  uploadCalls = 0;

  async upload(): Promise<Result<string>> {
    this.uploadCalls += 1;
    return err({ code: 'INTERNAL', message: 'boom' });
  }

  async resolveForTeam(_teamId: string, objectUrl: string): Promise<Result<string>> {
    return ok(objectUrl);
  }
}

/** In-memory stand-in for the parts of BrandKitRepository the service uses. */
class FakeBrandKitRepository {
  insertCalls = 0;
  private seq = 0;
  private readonly kits = new Map<string, BrandKit>();
  private readonly fonts = new Map<string, BrandFont[]>();

  /** Seed an existing Brand_Kit directly (does NOT count as an insert). */
  seed(teamId: string, kit: BrandKit): void {
    this.kits.set(teamId, kit);
    this.fonts.set(kit.id, [...kit.fonts]);
  }

  async insert(
    teamId: string,
    input: { logoUrl: string; colors: string[]; chrome: ChromeDefinition },
  ): Promise<BrandKit> {
    this.insertCalls += 1;
    const existing = this.kits.get(teamId);
    const id = existing?.id ?? `kit-${(this.seq += 1)}`;
    const kit: BrandKit = {
      id,
      teamId,
      logoUrl: input.logoUrl,
      fonts: [],
      colors: input.colors,
      chrome: input.chrome,
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };
    this.kits.set(teamId, kit);
    return kit;
  }

  async deleteFonts(brandKitId: string): Promise<void> {
    this.fonts.set(brandKitId, []);
  }

  async insertFont(
    brandKitId: string,
    font: {
      url: string;
      family: string;
      weight?: number;
      style?: 'normal' | 'italic';
      format: 'ttf' | 'otf';
    },
  ): Promise<void> {
    const arr = this.fonts.get(brandKitId) ?? [];
    const record: BrandFont = { id: `font-${(this.seq += 1)}`, url: font.url, family: font.family };
    if (font.weight !== undefined) record.weight = font.weight;
    if (font.style !== undefined) record.style = font.style;
    arr.push(record);
    this.fonts.set(brandKitId, arr);
  }

  async findByTeam(teamId: string): Promise<BrandKit | null> {
    const kit = this.kits.get(teamId);
    if (!kit) return null;
    return { ...kit, fonts: [...(this.fonts.get(kit.id) ?? [])] };
  }
}

/** Records each audit entry; supports both standalone and transactional writes. */
class FakeAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];

  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }

  async recordTx(_tx: Tx, entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

/** Minimal Pool whose `connect()` returns a client `withTransaction` accepts. */
function makeFakePool(): Pool {
  const client = {
    query: async () => ({ rows: [], rowCount: 0 }),
    release: () => undefined,
  };
  return { connect: async () => client } as unknown as Pool;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Always produces a valid `#rrggbb` color (matches the service hex regex). */
const hexColorArb = fc
  .integer({ min: 0, max: 0xffffff })
  .map((n) => `#${n.toString(16).padStart(6, '0')}`);

const logoPlacementArb = fc.constantFrom(
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
) as fc.Arbitrary<ChromeDefinition['logoPlacement']>;

const chromeArb: fc.Arbitrary<ChromeDefinition> = fc.record({
  logoPlacement: logoPlacementArb,
  pageNumberFormat: fc.string(),
  siteUrl: fc.string(),
});

/** A fully valid BrandKitInput (small buffers keep generation cheap). */
const validBrandKitInputArb: fc.Arbitrary<BrandKitInput> = fc
  .record({
    logoBytes: fc.uint8Array({ minLength: 1, maxLength: 64 }),
    fonts: fc.array(
      fc.record({
        bytes: fc.uint8Array({ minLength: 1, maxLength: 64 }),
        family: fc.string(),
        format: fc.constantFrom('ttf', 'otf') as fc.Arbitrary<'ttf' | 'otf'>,
      }),
      { minLength: 1, maxLength: 4 },
    ),
    colors: fc.array(hexColorArb, { minLength: 1, maxLength: 5 }),
    chrome: chromeArb,
  })
  .map((seed) => {
    const fonts: BrandFontInput[] = seed.fonts.map((f) => ({
      bytes: Buffer.from(f.bytes),
      family: f.family,
      format: f.format,
    }));
    return {
      logo: { bytes: Buffer.from(seed.logoBytes), contentType: 'image/png' },
      fonts,
      colors: seed.colors,
      chrome: seed.chrome,
    };
  });

// Invalid-input modeling: each asset group is independently set to a valid or
// a specific violating state. A run is kept only if ≥ 1 group is invalid.
type LogoState = 'valid' | 'wrongType' | 'oversize' | 'missing';
type FontState = 'valid' | 'badFormat' | 'oversize' | 'missing';
type ColorState = 'valid' | 'nonHex' | 'missing';

const badContentTypes: string[] = [
  'image/jpeg',
  'image/gif',
  'application/octet-stream',
  'font/ttf',
  'text/plain',
  'image/svg+xml',
];
const badFormats: string[] = ['woff', 'woff2', 'png', 'ttff', 'eot', ''];
const badColors: string[] = [
  'red',
  'blue',
  '#GGG',
  '#12',
  '#1234',
  'rgb(0,0,0)',
  '123456',
  'ABCDEF',
  '#xyzxyz',
  '',
];

interface InvalidSeed {
  logoState: LogoState;
  fontState: FontState;
  colorState: ColorState;
  badContentType: string;
  fontFamily: string;
  badFormat: string;
  badColorList: string[];
}

const invalidSeedArb: fc.Arbitrary<InvalidSeed> = fc
  .record({
    logoState: fc.constantFrom<LogoState>('valid', 'wrongType', 'oversize', 'missing'),
    fontState: fc.constantFrom<FontState>('valid', 'badFormat', 'oversize', 'missing'),
    colorState: fc.constantFrom<ColorState>('valid', 'nonHex', 'missing'),
    badContentType: fc.constantFrom(...badContentTypes),
    fontFamily: fc.string(),
    badFormat: fc.constantFrom(...badFormats),
    badColorList: fc.array(fc.constantFrom(...badColors), { minLength: 1, maxLength: 3 }),
  })
  .filter(
    (s) => s.logoState !== 'valid' || s.fontState !== 'valid' || s.colorState !== 'valid',
  );

/** Build a BrandKitInput from a seed; report violations after optional existing asset reuse. */
function buildInvalidInput(
  seed: InvalidSeed,
  existingAssets = false,
): { input: BrandKitInput; violationCount: number } {
  let violationCount = 0;

  let logo: BrandKitInput['logo'] = { bytes: VALID_BYTES, contentType: 'image/png' };
  if (seed.logoState === 'wrongType') {
    logo = { bytes: VALID_BYTES, contentType: seed.badContentType };
    violationCount += 1;
  } else if (seed.logoState === 'oversize') {
    logo = { bytes: Buffer.alloc(MAX_BYTES + 1), contentType: 'image/png' };
    violationCount += 1;
  } else if (seed.logoState === 'missing') {
    logo = { bytes: Buffer.alloc(0), contentType: 'image/png' };
    if (!existingAssets) violationCount += 1;
  }

  let fonts: BrandFontInput[] = [{ bytes: VALID_BYTES, family: seed.fontFamily, format: 'ttf' }];
  if (seed.fontState === 'badFormat') {
    fonts = [
      {
        bytes: VALID_BYTES,
        family: seed.fontFamily,
        format: seed.badFormat as BrandFontInput['format'],
      },
    ];
    violationCount += 1;
  } else if (seed.fontState === 'oversize') {
    fonts = [{ bytes: Buffer.alloc(MAX_BYTES + 1), family: seed.fontFamily, format: 'ttf' }];
    violationCount += 1;
  } else if (seed.fontState === 'missing') {
    fonts = [];
    if (!existingAssets) violationCount += 1;
  }

  let colors: string[] = ['#FFFFFF'];
  if (seed.colorState === 'nonHex') {
    colors = seed.badColorList;
    violationCount += 1;
  } else if (seed.colorState === 'missing') {
    colors = [];
    violationCount += 1;
  }

  const chrome: ChromeDefinition = {
    logoPlacement: 'top-left',
    pageNumberFormat: '{current}/{total}',
    siteUrl: 'https://example.test',
  };

  return { input: { logo, fonts, colors, chrome }, violationCount };
}

/** A known-good seeded Brand_Kit used to assert "existing kit unchanged". */
function seededKit(teamId: string): BrandKit {
  return {
    id: 'existing-kit',
    teamId,
    logoUrl: 'https://storage.test/existing/brand-kit/logo.png',
    fonts: [{ id: 'existing-font', url: 'https://storage.test/existing/font.ttf', family: 'Existing' }],
    colors: ['#000000'],
    chrome: { logoPlacement: 'bottom-left', pageNumberFormat: '{n}/{t}', siteUrl: 'https://kept.test' },
    updatedAt: new Date('2023-06-01T00:00:00.000Z'),
  };
}

// ---------------------------------------------------------------------------
// Property 1
// ---------------------------------------------------------------------------

describe('BrandKitService.save/get — Property 1', () => {
  // Feature: ai-content-carousel-generator, Property 1: Roundtrip & audit penyimpanan Brand_Kit
  it('save then get returns URL references with identical colors/chrome and exactly one audit entry', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBrandKitInputArb,
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 1, maxLength: 12 }),
        async (input, teamId, actorId) => {
          const storage = new FakeObjectStorage();
          const repo = new FakeBrandKitRepository();
          const audit = new FakeAuditLog();
          const service = new BrandKitService(
            makeFakePool(),
            repo as unknown as BrandKitRepository,
            storage,
            audit,
          );

          const saveRes = await service.save(teamId, actorId, input);
          if (!saveRes.ok) {
            throw new Error(
              `expected save to succeed, got error: ${JSON.stringify(saveRes.error)}`,
            );
          }

          const getRes = await service.get(teamId);
          if (!getRes.ok) throw new Error('expected get to succeed');
          const kit = getRes.value;
          if (kit === null) throw new Error('expected a persisted Brand_Kit');

          // Colors + chrome are identical to the input (deterministic roundtrip).
          expect(kit.colors).toEqual(input.colors);
          expect(kit.chrome).toEqual(input.chrome);

          // Logo is stored as an https Object_Storage URL reference, not base64.
          expect(typeof kit.logoUrl).toBe('string');
          expect(kit.logoUrl.startsWith('https://')).toBe(true);
          expect(kit.logoUrl.startsWith('data:')).toBe(false);

          // Every font is stored as an https URL reference, not base64.
          expect(kit.fonts.length).toBe((input.fonts ?? []).length);
          for (const font of kit.fonts) {
            expect(typeof font.url).toBe('string');
            expect(font.url.startsWith('https://')).toBe(true);
            expect(font.url.startsWith('data:')).toBe(false);
          }

          // One asset upload per file (logo + each font), all https references.
          expect(storage.uploadCalls).toBe(1 + (input.fonts ?? []).length);

          // Exactly one Audit_Log entry, action `content_manage`.
          expect(audit.entries.length).toBe(1);
          expect(audit.entries[0]?.action).toBe('content_manage');
          expect(audit.entries[0]?.teamId).toBe(teamId);
          expect(audit.entries[0]?.actorId).toBe(actorId);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2
// ---------------------------------------------------------------------------

describe('BrandKitService.save — Property 2', () => {
  // Feature: ai-content-carousel-generator, Property 2: Validasi Brand_Kit menolak tanpa partial-save
  it('rejects invalid input with all messages at once, uploads nothing, and leaves existing kit unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidSeedArb,
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 1, maxLength: 12 }),
        async (seed, teamId, actorId) => {
          const { input, violationCount } = buildInvalidInput(seed, true);
          if (violationCount === 0) return;

          const storage = new FakeObjectStorage();
          const repo = new FakeBrandKitRepository();
          const audit = new FakeAuditLog();

          // Seed a pre-existing Brand_Kit that must remain untouched.
          repo.seed(teamId, seededKit(teamId));
          const before = structuredClone(await repo.findByTeam(teamId));

          const service = new BrandKitService(
            makeFakePool(),
            repo as unknown as BrandKitRepository,
            storage,
            audit,
          );

          const saveRes = await service.save(teamId, actorId, input);

          // Save is rejected as a VALIDATION error with a non-empty message list.
          expect(saveRes.ok).toBe(false);
          if (saveRes.ok) throw new Error('expected save to be rejected');
          expect(saveRes.error.code).toBe('VALIDATION');
          if (saveRes.error.code !== 'VALIDATION') {
            throw new Error('expected a VALIDATION error');
          }
          expect(saveRes.error.messages.length).toBeGreaterThan(0);

          // ALL applicable messages are returned at once: at least one per
          // violating asset group (so multiple violations ⇒ ≥ 2 messages).
          expect(saveRes.error.messages.length).toBeGreaterThanOrEqual(violationCount);
          if (violationCount >= 2) {
            expect(saveRes.error.messages.length).toBeGreaterThanOrEqual(2);
          }

          // No asset uploaded (no partial-save) and the DB insert was not called.
          expect(storage.uploadCalls).toBe(0);
          expect(repo.insertCalls).toBe(0);

          // No audit entry written for a rejected save.
          expect(audit.entries.length).toBe(0);

          // The pre-existing Brand_Kit is left exactly as it was.
          const after = await repo.findByTeam(teamId);
          expect(after).toEqual(before);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: ai-content-carousel-generator, Property 2: Validasi Brand_Kit menolak tanpa partial-save
  it('returns multiple messages simultaneously for an input with several violations', async () => {
    const storage = new FakeObjectStorage();
    const repo = new FakeBrandKitRepository();
    const audit = new FakeAuditLog();
    const service = new BrandKitService(
      makeFakePool(),
      repo as unknown as BrandKitRepository,
      storage,
      audit,
    );

    // Three simultaneous violations: non-PNG logo, bad font format, non-hex color.
    const input: BrandKitInput = {
      logo: { bytes: VALID_BYTES, contentType: 'image/jpeg' },
      fonts: [{ bytes: VALID_BYTES, family: 'Bad', format: 'woff' as BrandFontInput['format'] }],
      colors: ['not-a-color'],
      chrome: { logoPlacement: 'top-left', pageNumberFormat: '{n}/{t}', siteUrl: 'https://x.test' },
    };

    const res = await service.save('team-multi', 'actor-1', input);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected rejection');
    expect(res.error.code).toBe('VALIDATION');
    if (res.error.code !== 'VALIDATION') throw new Error('expected VALIDATION');
    expect(res.error.messages.length).toBeGreaterThanOrEqual(2);
    expect(storage.uploadCalls).toBe(0);
    expect(repo.insertCalls).toBe(0);
  });

  it('keeps existing logo and fonts when saving color/chrome changes without new uploads', async () => {
    const storage = new FakeObjectStorage();
    const repo = new FakeBrandKitRepository();
    const audit = new FakeAuditLog();
    const teamId = 'team-existing-assets';
    const beforeKit = seededKit(teamId);
    repo.seed(teamId, beforeKit);
    const service = new BrandKitService(
      makeFakePool(),
      repo as unknown as BrandKitRepository,
      storage,
      audit,
    );

    const input: BrandKitInput = {
      colors: ['#111111', '#F5F5F5'],
      chrome: { logoPlacement: 'top-right', pageNumberFormat: '{current}/{total}', siteUrl: 'leads.test' },
      typography: {
        header: { fontFamily: 'Existing', color: '#111111', sizePx: 48 },
        body: { fontFamily: 'Existing', color: '#444444', sizePx: 22 },
        highlightColor: '#111111',
        background: '#F5F5F5',
        paginationColor: '#444444',
        metaTextColor: '#444444',
        accent: '#111111',
      },
    };

    const res = await service.save(teamId, 'actor-1', input);

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected save to succeed');
    expect(storage.uploadCalls).toBe(0);
    expect(res.value.logoUrl).toBe(beforeKit.logoUrl);
    expect(res.value.fonts).toEqual(beforeKit.fonts);
    expect(res.value.colors).toEqual(input.colors);
    expect(res.value.chrome).toEqual(input.chrome);
    expect(audit.entries.length).toBe(1);
  });

  // Feature: ai-content-carousel-generator, Property 2: Validasi Brand_Kit menolak tanpa partial-save
  it('does not persist any DB reference when an upload fails (no partial-save)', async () => {
    const storage = new FailingObjectStorage();
    const repo = new FakeBrandKitRepository();
    const audit = new FakeAuditLog();
    const service = new BrandKitService(
      makeFakePool(),
      repo as unknown as BrandKitRepository,
      storage,
      audit,
    );

    // Valid input — validation passes, but the logo upload fails.
    const input: BrandKitInput = {
      logo: { bytes: VALID_BYTES, contentType: 'image/png' },
      fonts: [{ bytes: VALID_BYTES, family: 'Inter', format: 'ttf' }],
      colors: ['#FFFFFF'],
      chrome: { logoPlacement: 'top-left', pageNumberFormat: '{n}/{t}', siteUrl: 'https://x.test' },
    };

    const res = await service.save('team-upload', 'actor-1', input);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected upload failure to reject the save');
    expect(res.error.code).toBe('INTERNAL');
    // Upload was attempted but nothing was written to the DB / audit log.
    expect(storage.uploadCalls).toBeGreaterThan(0);
    expect(repo.insertCalls).toBe(0);
    expect(audit.entries.length).toBe(0);
  });
});
