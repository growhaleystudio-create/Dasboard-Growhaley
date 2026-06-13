/**
 * Unit tests for BrandKitService.
 *
 * Validates:
 * - Requirements 1.1, 1.2: valid input saves assets to Object_Storage and
 *   persists references + Audit_Log in a transaction.
 * - Requirements 1.3, 1.4: multiple validation errors are ALL returned
 *   together (not just the first); no upload or DB write occurs on failure.
 * - Requirements 1.3: upload failure → err(INTERNAL) without writing DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrandKit, BrandKitInput } from '@leads-generator/shared';
import { ok, err } from '@leads-generator/shared';
import type { Pool } from 'pg';

import { BrandKitService } from '../../src/content/brand-kit-service.js';
import type { BrandKitRepository } from '../../src/repository/brand-kit-repository.js';
import type { ObjectStorage } from '../../src/storage/object-storage.js';
import type { AuditLog } from '../../src/privacy/audit-log.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEAM_ID = 'team-abc';
const ACTOR_ID = 'user-xyz';

/** Create a Buffer of the given size. */
function makeBytes(size: number): Buffer {
  return Buffer.alloc(size, 0x00);
}

const ONE_MB = 1024 * 1024;
const SIX_MB = 6 * ONE_MB;

/** A valid BrandKitInput for happy-path tests. */
function makeValidInput(overrides?: Partial<BrandKitInput>): BrandKitInput {
  return {
    logo: { bytes: makeBytes(ONE_MB), contentType: 'image/png' },
    fonts: [
      { bytes: makeBytes(ONE_MB), family: 'Inter', format: 'ttf', weight: 400 },
    ],
    colors: ['#FF5733', '#1A1A2E'],
    chrome: {
      logoPlacement: 'top-left',
      pageNumberFormat: '{n}/{total}',
      siteUrl: 'https://example.com',
    },
    ...overrides,
  };
}

/** Stub BrandKit returned by repo.insert. */
function makeKitRow(id = 'kit-1'): BrandKit {
  return {
    id,
    teamId: TEAM_ID,
    logoUrl: `https://storage.example.com/${TEAM_ID}/brand-kit/logo.png`,
    fonts: [],
    colors: ['#FF5733', '#1A1A2E'],
    chrome: {
      logoPlacement: 'top-left',
      pageNumberFormat: '{n}/{total}',
      siteUrl: 'https://example.com',
    },
    updatedAt: new Date('2024-01-01'),
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeRepo(): BrandKitRepository {
  return {
    findByTeam: vi.fn().mockResolvedValue(null),
    insert: vi.fn().mockResolvedValue(makeKitRow()),
    insertFont: vi.fn().mockResolvedValue(undefined),
    deleteFonts: vi.fn().mockResolvedValue(undefined),
  } as unknown as BrandKitRepository;
}

function makeStorage(
  uploadResult: Awaited<ReturnType<ObjectStorage['upload']>> = ok('https://storage.example.com/uploaded'),
): ObjectStorage {
  return {
    upload: vi.fn().mockResolvedValue(uploadResult),
    resolveForTeam: vi.fn(),
  } as unknown as ObjectStorage;
}

function makeAuditLog(): AuditLog {
  return {
    record: vi.fn().mockResolvedValue(undefined),
    recordTx: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditLog;
}

/**
 * Build a mock Pool whose `connect()` returns a fake PoolClient that
 * executes queries via the provided `queryFn` and tracks BEGIN/COMMIT/ROLLBACK.
 */
function makePool(): Pool {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
  return {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;
}

// ---------------------------------------------------------------------------
// Helper: build service with all mocks
// ---------------------------------------------------------------------------

function makeService(overrides?: {
  repo?: BrandKitRepository;
  storage?: ObjectStorage;
  audit?: AuditLog;
  pool?: Pool;
}) {
  const repo = overrides?.repo ?? makeRepo();
  const storage = overrides?.storage ?? makeStorage();
  const audit = overrides?.audit ?? makeAuditLog();
  const pool = overrides?.pool ?? makePool();
  const service = new BrandKitService(pool, repo, storage, audit);
  return { service, repo, storage, audit, pool };
}

// ---------------------------------------------------------------------------
// Happy path: valid input saves assets and writes DB
// ---------------------------------------------------------------------------

describe('BrandKitService.save — valid input', () => {
  it('returns ok(BrandKit) for a complete, valid input', async () => {
    const { service } = makeService();
    const input = makeValidInput();

    const result = await service.save(TEAM_ID, ACTOR_ID, input);

    expect(result.ok).toBe(true);
  });

  it('uploads logo with correct key and content type', async () => {
    const { service, storage } = makeService();
    const input = makeValidInput();

    await service.save(TEAM_ID, ACTOR_ID, input);

    expect(storage.upload).toHaveBeenCalledWith(
      TEAM_ID,
      'brand-kit/logo.png',
      input.logo.bytes,
      'image/png',
    );
  });

  it('uploads each font with indexed key and correct mime type', async () => {
    const { service, storage } = makeService();
    const fonts = [
      { bytes: makeBytes(ONE_MB), family: 'Inter', format: 'ttf' as const },
      { bytes: makeBytes(ONE_MB), family: 'Roboto', format: 'otf' as const },
    ];
    const input = makeValidInput({ fonts });

    await service.save(TEAM_ID, ACTOR_ID, input);

    expect(storage.upload).toHaveBeenCalledWith(
      TEAM_ID,
      'brand-kit/fonts/0.ttf',
      fonts[0]!.bytes,
      'font/ttf',
    );
    expect(storage.upload).toHaveBeenCalledWith(
      TEAM_ID,
      'brand-kit/fonts/1.otf',
      fonts[1]!.bytes,
      'font/otf',
    );
  });

  it('calls repo.insert, repo.deleteFonts, and repo.insertFont in transaction', async () => {
    const { service, repo } = makeService();
    const input = makeValidInput();

    await service.save(TEAM_ID, ACTOR_ID, input);

    expect(repo.insert).toHaveBeenCalledWith(TEAM_ID, {
      logoUrl: expect.any(String),
      colors: input.colors,
      chrome: input.chrome,
    });
    expect(repo.deleteFonts).toHaveBeenCalledWith('kit-1');
    expect(repo.insertFont).toHaveBeenCalledTimes(1);
  });

  it('records a content_manage audit entry within the transaction', async () => {
    const { service, audit } = makeService();
    const input = makeValidInput();

    await service.save(TEAM_ID, ACTOR_ID, input);

    expect(audit.recordTx).toHaveBeenCalledWith(
      expect.anything(), // the Tx object
      expect.objectContaining({
        teamId: TEAM_ID,
        actorId: ACTOR_ID,
        action: 'content_manage',
        objectType: 'brand_kit',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Happy path: get
// ---------------------------------------------------------------------------

describe('BrandKitService.get', () => {
  it('returns ok(null) when no Brand_Kit exists', async () => {
    const { service } = makeService();
    const result = await service.get(TEAM_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value).toBeNull();
  });

  it('returns ok(BrandKit) when a Brand_Kit exists', async () => {
    const kit = makeKitRow();
    const repo = makeRepo();
    (repo.findByTeam as ReturnType<typeof vi.fn>).mockResolvedValue(kit);
    const { service } = makeService({ repo });

    const result = await service.get(TEAM_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value).toBe(kit);
  });
});

// ---------------------------------------------------------------------------
// Validation: ALL errors collected before rejecting (Requirements 1.3, 1.4)
// ---------------------------------------------------------------------------

describe('BrandKitService.save — validation errors (all collected, not just first)', () => {
  it('returns VALIDATION error for non-PNG logo', async () => {
    const { service } = makeService();
    const input = makeValidInput({
      logo: { bytes: makeBytes(ONE_MB), contentType: 'image/jpeg' },
    });

    const result = await service.save(TEAM_ID, ACTOR_ID, input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    const messages = (result.error as { code: 'VALIDATION'; messages: string[] }).messages;
    expect(messages.some((m) => m.includes('PNG') || m.includes('content type'))).toBe(true);
  });

  it('returns VALIDATION error when logo exceeds 5 MB', async () => {
    const { service } = makeService();
    const input = makeValidInput({
      logo: { bytes: makeBytes(SIX_MB), contentType: 'image/png' },
    });

    const result = await service.save(TEAM_ID, ACTOR_ID, input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    expect((result.error as { code: 'VALIDATION'; messages: string[] }).messages.some(
      (m) => m.includes('5 MB') || m.includes('size'),
    )).toBe(true);
  });

  it('returns VALIDATION error when no fonts are provided', async () => {
    const { service } = makeService();
    const input = makeValidInput({ fonts: [] });

    const result = await service.save(TEAM_ID, ACTOR_ID, input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    expect((result.error as { code: 'VALIDATION'; messages: string[] }).messages.some(
      (m) => m.toLowerCase().includes('font'),
    )).toBe(true);
  });

  it('returns VALIDATION error for an invalid font format', async () => {
    const { service } = makeService();
    const input = makeValidInput({
      fonts: [
        {
          bytes: makeBytes(ONE_MB),
          family: 'BadFont',
          format: 'woff' as unknown as 'ttf',
        },
      ],
    });

    const result = await service.save(TEAM_ID, ACTOR_ID, input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    expect((result.error as { code: 'VALIDATION'; messages: string[] }).messages.some(
      (m) => m.includes('ttf') || m.includes('otf') || m.includes('format'),
    )).toBe(true);
  });

  it('returns VALIDATION error when no colors are provided', async () => {
    const { service } = makeService();
    const input = makeValidInput({ colors: [] });

    const result = await service.save(TEAM_ID, ACTOR_ID, input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    expect((result.error as { code: 'VALIDATION'; messages: string[] }).messages.some(
      (m) => m.toLowerCase().includes('color'),
    )).toBe(true);
  });

  it('returns VALIDATION error for invalid hex color', async () => {
    const { service } = makeService();
    const input = makeValidInput({ colors: ['not-a-color', '#ZZZZZZ'] });

    const result = await service.save(TEAM_ID, ACTOR_ID, input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    const messages = (result.error as { code: 'VALIDATION'; messages: string[] }).messages;
    // Both invalid colors should produce errors
    expect(messages.length).toBeGreaterThanOrEqual(2);
  });

  it('collects ALL validation errors in a single response — not just the first (R1.3, R1.4)', async () => {
    const { service } = makeService();

    // Intentionally many simultaneous violations:
    // - logo: wrong content type AND too large
    // - fonts: empty list
    // - colors: all invalid
    // - chrome: missing fields
    const input: BrandKitInput = {
      logo: { bytes: makeBytes(SIX_MB), contentType: 'image/jpeg' },
      fonts: [],
      colors: ['bad-color', '#XYZ'],
      chrome: {
        logoPlacement: undefined as unknown as 'top-left',
        pageNumberFormat: undefined as unknown as string,
        siteUrl: undefined as unknown as string,
      },
    };

    const result = await service.save(TEAM_ID, ACTOR_ID, input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    const messages = (result.error as { code: 'VALIDATION'; messages: string[] }).messages;

    // Must include ALL of these problems in one response
    expect(messages.some((m) => m.includes('PNG') || m.includes('content type'))).toBe(true);
    expect(messages.some((m) => m.includes('5 MB') || m.includes('size'))).toBe(true);
    expect(messages.some((m) => m.toLowerCase().includes('font'))).toBe(true);
    expect(messages.some((m) => m.toLowerCase().includes('color'))).toBe(true);
    expect(messages.length).toBeGreaterThanOrEqual(4);
  });

  it('does NOT upload anything when validation fails (no partial-save, R1.3)', async () => {
    const { service, storage } = makeService();
    const input = makeValidInput({
      logo: { bytes: makeBytes(ONE_MB), contentType: 'image/jpeg' }, // invalid
      colors: ['bad-color'], // invalid
    });

    await service.save(TEAM_ID, ACTOR_ID, input);

    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('does NOT write to DB when validation fails (no partial-save, R1.3)', async () => {
    const { service, repo } = makeService();
    const input = makeValidInput({
      logo: { bytes: makeBytes(ONE_MB), contentType: 'image/jpeg' },
    });

    await service.save(TEAM_ID, ACTOR_ID, input);

    expect(repo.insert).not.toHaveBeenCalled();
    expect(repo.insertFont).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Upload failure → no DB write (Requirements 1.3)
// ---------------------------------------------------------------------------

describe('BrandKitService.save — upload failure prevents DB write', () => {
  it('returns INTERNAL err when logo upload fails', async () => {
    const storage = makeStorage(err({ code: 'INTERNAL', message: 'S3 unavailable' }));
    const { service, repo } = makeService({ storage });
    const input = makeValidInput();

    const result = await service.save(TEAM_ID, ACTOR_ID, input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('INTERNAL');
    // DB must not be touched
    expect(repo.insert).not.toHaveBeenCalled();
    expect(repo.insertFont).not.toHaveBeenCalled();
    expect(repo.deleteFonts).not.toHaveBeenCalled();
  });

  it('returns INTERNAL err when a font upload fails — no DB write', async () => {
    // Logo upload succeeds; second call (font) fails
    const storage = {
      upload: vi
        .fn()
        .mockResolvedValueOnce(ok('https://storage.example.com/logo.png'))   // logo succeeds
        .mockResolvedValueOnce(err({ code: 'INTERNAL', message: 'Font upload failed' })), // font fails
      resolveForTeam: vi.fn(),
    } as unknown as ObjectStorage;

    const { service, repo } = makeService({ storage });
    const input = makeValidInput();

    const result = await service.save(TEAM_ID, ACTOR_ID, input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('INTERNAL');
    // No DB write
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('does NOT record an audit entry when upload fails', async () => {
    const storage = makeStorage(err({ code: 'INTERNAL', message: 'Network error' }));
    const { service, audit } = makeService({ storage });
    const input = makeValidInput();

    await service.save(TEAM_ID, ACTOR_ID, input);

    expect(audit.recordTx).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
