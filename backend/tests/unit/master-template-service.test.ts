/**
 * Unit tests for MasterTemplateService.
 *
 * Validates:
 * - Requirements 2.1 (valid save → upsert + audit)
 * - Requirements 2.3 (invalid input rejected with named violations, existing
 *   template unchanged)
 * - Multiple error collection (all violations reported at once)
 */

import { describe, it, expect, vi } from 'vitest';

import type { MasterTemplate } from '@leads-generator/shared';
import type { AuditLog } from '../../src/privacy/audit-log.js';
import type { MasterTemplateRepository } from '../../src/repository/master-template-repository.js';
import { MasterTemplateService } from '../../src/content/master-template-service.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEAM_ID = 'team-abc';
const ACTOR_ID = 'user-xyz';

const VALID_INPUT = {
  allowedBlocks: ['heading', 'body', 'cta'] as const,
  maxSlides: 5,
  textLimits: [
    { blockType: 'heading' as const, maxChars: 80 },
    { blockType: 'body' as const, maxChars: 300 },
  ],
  aspectRatios: ['1:1', '9:16'] as const,
  defaultTone: 'professional',
};

const SAVED_TEMPLATE: MasterTemplate = {
  id: 'mt-001',
  teamId: TEAM_ID,
  ...VALID_INPUT,
  allowedBlocks: [...VALID_INPUT.allowedBlocks],
  aspectRatios: [...VALID_INPUT.aspectRatios],
  updatedAt: new Date('2024-06-01'),
};

// ---------------------------------------------------------------------------
// Helpers: create mock dependencies
// ---------------------------------------------------------------------------

function makeMocks(overrides?: { existingTemplate?: MasterTemplate | null }) {
  const templateRepo: MasterTemplateRepository = {
    findByTeam: vi.fn().mockResolvedValue(overrides?.existingTemplate ?? null),
    upsert: vi.fn().mockResolvedValue(SAVED_TEMPLATE),
  } as unknown as MasterTemplateRepository;

  const audit: AuditLog = {
    record: vi.fn().mockResolvedValue(undefined),
    recordTx: vi.fn().mockResolvedValue(undefined),
  };

  return { templateRepo, audit };
}

function makeService(overrides?: Parameters<typeof makeMocks>[0]) {
  const mocks = makeMocks(overrides);
  const service = new MasterTemplateService(mocks.templateRepo, mocks.audit);
  return { service, ...mocks };
}

// ---------------------------------------------------------------------------
// Tests: valid save
// ---------------------------------------------------------------------------

describe('MasterTemplateService.save — valid input', () => {
  it('returns ok with saved template', async () => {
    const { service } = makeService();

    const result = await service.save(TEAM_ID, ACTOR_ID, VALID_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.id).toBe('mt-001');
    expect(result.value.teamId).toBe(TEAM_ID);
    expect(result.value.maxSlides).toBe(5);
  });

  it('calls upsert on the repository with correct data', async () => {
    const { service, templateRepo } = makeService();

    await service.save(TEAM_ID, ACTOR_ID, VALID_INPUT);

    expect(templateRepo.upsert).toHaveBeenCalledOnce();
    const [calledTeamId, calledData] = (templateRepo.upsert as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledTeamId).toBe(TEAM_ID);
    expect(calledData.maxSlides).toBe(5);
    expect(calledData.allowedBlocks).toEqual(['heading', 'body', 'cta']);
  });

  it('writes a content_manage audit entry after save', async () => {
    const { service, audit } = makeService();

    await service.save(TEAM_ID, ACTOR_ID, VALID_INPUT);

    expect(audit.record).toHaveBeenCalledOnce();
    const entry = (audit.record as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(entry.teamId).toBe(TEAM_ID);
    expect(entry.actorId).toBe(ACTOR_ID);
    expect(entry.action).toBe('content_manage');
    expect(entry.objectType).toBe('master_template');
    expect(entry.metadata?.op).toBe('save');
  });
});

// ---------------------------------------------------------------------------
// Tests: invalid block type (R2.3)
// ---------------------------------------------------------------------------

describe('MasterTemplateService.save — invalid block type (R2.3)', () => {
  it('rejects when allowedBlocks contains an unknown type', async () => {
    const { service, templateRepo } = makeService();

    const badInput = {
      ...VALID_INPUT,
      allowedBlocks: ['heading', 'UNSUPPORTED_BLOCK'] as never,
    };

    const result = await service.save(TEAM_ID, ACTOR_ID, badInput);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    // Message must name the offending block type (Indonesian: "Tipe blok tidak dikenal: X")
    expect(result.error.messages.some((m) => m.includes('UNSUPPORTED_BLOCK'))).toBe(true);
    expect(templateRepo.upsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: maxSlides out of range (R2.3)
// ---------------------------------------------------------------------------

describe('MasterTemplateService.save — maxSlides out of range', () => {
  it('rejects maxSlides = 0', async () => {
    const { service, templateRepo } = makeService();

    const result = await service.save(TEAM_ID, ACTOR_ID, { ...VALID_INPUT, maxSlides: 0 });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    // Indonesian message: "maxSlides harus berupa bilangan bulat antara 1 dan 10"
    expect(result.error.messages.some((m) => m.includes('maxSlides'))).toBe(true);
    expect(templateRepo.upsert).not.toHaveBeenCalled();
  });

  it('rejects maxSlides = 11', async () => {
    const { service } = makeService();

    const result = await service.save(TEAM_ID, ACTOR_ID, { ...VALID_INPUT, maxSlides: 11 });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.messages.some((m) => m.includes('maxSlides'))).toBe(true);
  });

  it('accepts maxSlides = 1 (lower bound)', async () => {
    const { service } = makeService();
    const result = await service.save(TEAM_ID, ACTOR_ID, { ...VALID_INPUT, maxSlides: 1 });
    expect(result.ok).toBe(true);
  });

  it('accepts maxSlides = 10 (upper bound)', async () => {
    const { service } = makeService();
    const result = await service.save(TEAM_ID, ACTOR_ID, { ...VALID_INPUT, maxSlides: 10 });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: multiple errors collected simultaneously (R2.3)
// ---------------------------------------------------------------------------

describe('MasterTemplateService.save — multiple errors collected at once (R2.3)', () => {
  it('reports all violated rules simultaneously', async () => {
    const { service, templateRepo, audit } = makeService();

    const badInput = {
      allowedBlocks: ['NOT_A_BLOCK'] as never,
      maxSlides: 0,
      textLimits: [{ blockType: 'heading' as const, maxChars: -5 }],
      aspectRatios: ['3:4'] as never, // not in valid set
      defaultTone: 'casual',
    };

    const result = await service.save(TEAM_ID, ACTOR_ID, badInput);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');

    const msgs = result.error.messages;
    // Should report unknown block type with the actual block name
    expect(msgs.some((m) => m.includes('NOT_A_BLOCK'))).toBe(true);
    // Should report maxSlides violation
    expect(msgs.some((m) => m.includes('maxSlides'))).toBe(true);
    // Should report invalid aspect ratio
    expect(msgs.some((m) => m.includes('3:4'))).toBe(true);
    // Multiple messages, not just the first
    expect(msgs.length).toBeGreaterThan(1);

    // No mutation should have happened
    expect(templateRepo.upsert).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('reports invalid aspect ratio with the ratio name', async () => {
    const { service } = makeService();
    const result = await service.save(TEAM_ID, ACTOR_ID, {
      ...VALID_INPUT,
      aspectRatios: ['16:9'] as never,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    // Indonesian: "Rasio aspek tidak valid: 16:9"
    expect(result.error.messages.some((m) => m.includes('16:9'))).toBe(true);
  });

  it('reports empty allowedBlocks', async () => {
    const { service } = makeService();
    const result = await service.save(TEAM_ID, ACTOR_ID, {
      ...VALID_INPUT,
      allowedBlocks: [] as never,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    // Indonesian: "allowedBlocks harus memiliki setidaknya satu tipe blok"
    expect(result.error.messages.some((m) => m.includes('allowedBlocks'))).toBe(true);
  });

  it('reports empty aspectRatios', async () => {
    const { service } = makeService();
    const result = await service.save(TEAM_ID, ACTOR_ID, {
      ...VALID_INPUT,
      aspectRatios: [] as never,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    // Indonesian: "aspectRatios harus memiliki setidaknya satu rasio"
    expect(result.error.messages.some((m) => m.includes('aspectRatios'))).toBe(true);
  });

  it('reports textLimits with maxChars <= 0', async () => {
    const { service } = makeService();
    const result = await service.save(TEAM_ID, ACTOR_ID, {
      ...VALID_INPUT,
      textLimits: [{ blockType: 'body' as const, maxChars: 0 }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.messages.some((m) => m.includes('body'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: get
// ---------------------------------------------------------------------------

describe('MasterTemplateService.get', () => {
  it('returns null when no template exists', async () => {
    const { service } = makeService({ existingTemplate: null });
    const result = await service.get(TEAM_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value).toBeNull();
  });

  it('returns the existing template', async () => {
    const { service } = makeService({ existingTemplate: SAVED_TEMPLATE });
    const result = await service.get(TEAM_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value?.id).toBe('mt-001');
  });
});

// ---------------------------------------------------------------------------
// Tests: rules
// ---------------------------------------------------------------------------

describe('MasterTemplateService.rules', () => {
  it('returns NOT_FOUND when no template exists', async () => {
    const { service } = makeService({ existingTemplate: null });
    const result = await service.rules(TEAM_ID);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('returns MasterTemplateRules with ReadonlySet and ReadonlyMap', async () => {
    const { service } = makeService({ existingTemplate: SAVED_TEMPLATE });
    const result = await service.rules(TEAM_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');

    const rules = result.value;
    expect(rules.allowedBlocks).toBeInstanceOf(Set);
    expect(rules.textLimits).toBeInstanceOf(Map);
    expect(rules.aspectRatios).toBeInstanceOf(Set);
    expect(rules.maxSlides).toBe(5);
    expect(rules.allowedBlocks.has('heading')).toBe(true);
    expect(rules.textLimits.get('heading')).toBe(80);
    expect(rules.aspectRatios.has('1:1')).toBe(true);
    expect(rules.aspectRatios.has('9:16')).toBe(true);
  });

  it('textLimits map contains all provided limits', async () => {
    const { service } = makeService({ existingTemplate: SAVED_TEMPLATE });
    const result = await service.rules(TEAM_ID);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.textLimits.get('body')).toBe(300);
  });
});
