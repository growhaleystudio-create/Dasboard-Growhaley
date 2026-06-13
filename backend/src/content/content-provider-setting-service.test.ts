/**
 * Unit tests for ContentProviderSettingService (task 7.1)
 *
 * Core scenarios verified:
 *   1. `set` stores the setting and emits a content_manage audit entry.
 *   2. `get` returns the google_official default when no setting is stored.
 *   3. `set` rejects baseUrl that does not start with 'https://'.
 *
 * Requirements: 14.1, 14.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProviderSetting } from '@leads-generator/shared';
import type { AuditLog, AuditEntry } from '../privacy/audit-log.js';
import type { ContentProviderSettingRepository } from '../repository/content-provider-setting-repository.js';
import { ContentProviderSettingService } from './content-provider-setting-service.js';

// ---------------------------------------------------------------------------
// Helpers / Fakes
// ---------------------------------------------------------------------------

function makeRepo(stored: ProviderSetting | null = null): ContentProviderSettingRepository {
  return {
    findByTeam: vi.fn().mockResolvedValue(stored),
    upsert: vi.fn().mockImplementation(
      async (teamId: string, kind: ProviderSetting['kind'], baseUrl: string) =>
        ({ teamId, kind, baseUrl }) satisfies ProviderSetting,
    ),
  } as unknown as ContentProviderSettingRepository;
}

function makeAudit(): { audit: Pick<AuditLog, 'record'>; recorded: AuditEntry[] } {
  const recorded: AuditEntry[] = [];
  const audit: Pick<AuditLog, 'record'> = {
    record: vi.fn().mockImplementation(async (entry: AuditEntry) => {
      recorded.push(entry);
    }),
  };
  return { audit, recorded };
}

function makeSvc(
  repo: ContentProviderSettingRepository,
  audit: Pick<AuditLog, 'record'>,
): ContentProviderSettingService {
  return new ContentProviderSettingService({ repo, audit });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContentProviderSettingService.set', () => {
  it('stores the setting and returns ok with the saved ProviderSetting', async () => {
    const repo = makeRepo();
    const { audit } = makeAudit();
    const svc = makeSvc(repo, audit);

    const result = await svc.set('team-1', 'actor-1', {
      kind: 'google_official',
      baseUrl: 'https://generativelanguage.googleapis.com',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');

    expect(result.value.teamId).toBe('team-1');
    expect(result.value.kind).toBe('google_official');
    expect(result.value.baseUrl).toBe('https://generativelanguage.googleapis.com');

    // Repository upsert was called with the correct args
    expect(repo.upsert).toHaveBeenCalledWith(
      'team-1',
      'google_official',
      'https://generativelanguage.googleapis.com',
    );
  });

  it('emits a content_manage audit entry with op:set, kind, and baseUrl', async () => {
    const repo = makeRepo();
    const { audit, recorded } = makeAudit();
    const svc = makeSvc(repo, audit);

    await svc.set('team-2', 'admin-99', {
      kind: 'third_party_proxy',
      baseUrl: 'https://proxy.example.com',
    });

    expect(recorded).toHaveLength(1);
    const entry = recorded[0]!;
    expect(entry.teamId).toBe('team-2');
    expect(entry.actorId).toBe('admin-99');
    expect(entry.action).toBe('content_manage');
    expect(entry.objectType).toBe('content_provider_setting');
    expect(entry.metadata).toMatchObject({
      kind: 'third_party_proxy',
      baseUrl: 'https://proxy.example.com',
      op: 'set',
    });
  });

  it('rejects baseUrl that starts with http:// with VALIDATION error containing HTTPS message', async () => {
    const repo = makeRepo();
    const { audit, recorded } = makeAudit();
    const svc = makeSvc(repo, audit);

    const result = await svc.set('team-3', 'actor-1', {
      kind: 'third_party_proxy',
      baseUrl: 'http://insecure.example.com',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    // AppError VALIDATION variant uses messages (array), not message (string)
    if (result.error.code !== 'VALIDATION') throw new Error('expected VALIDATION');
    expect(result.error.messages).toEqual(['AI provider endpoint must use HTTPS']);

    // No upsert, no audit when validation fails
    expect(repo.upsert).not.toHaveBeenCalled();
    expect(recorded).toHaveLength(0);
  });

  it('rejects baseUrl that has no scheme with VALIDATION error', async () => {
    const repo = makeRepo();
    const { audit } = makeAudit();
    const svc = makeSvc(repo, audit);

    const result = await svc.set('team-4', 'actor-1', {
      kind: 'google_official',
      baseUrl: 'example.com/api',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    if (result.error.code !== 'VALIDATION') throw new Error('expected VALIDATION');
    expect(result.error.messages).toEqual(['AI provider endpoint must use HTTPS']);
  });

  it('rejects empty baseUrl with VALIDATION error', async () => {
    const repo = makeRepo();
    const { audit, recorded } = makeAudit();
    const svc = makeSvc(repo, audit);

    const result = await svc.set('team-5', 'actor-1', {
      kind: 'google_official',
      baseUrl: '',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('VALIDATION');
    // No audit or upsert on validation failure
    expect(repo.upsert).not.toHaveBeenCalled();
    expect(recorded).toHaveLength(0);
  });

  it('stores third_party_proxy kind correctly', async () => {
    const repo = makeRepo();
    const { audit } = makeAudit();
    const svc = makeSvc(repo, audit);

    const result = await svc.set('team-6', 'actor-6', {
      kind: 'third_party_proxy',
      baseUrl: 'https://my-proxy.internal.corp',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.kind).toBe('third_party_proxy');
    expect(result.value.baseUrl).toBe('https://my-proxy.internal.corp');
  });

  it('does not call audit.record when baseUrl validation fails', async () => {
    const repo = makeRepo();
    const { audit } = makeAudit();
    const svc = makeSvc(repo, audit);

    await svc.set('team-7', 'actor-1', {
      kind: 'google_official',
      baseUrl: 'http://bad.example.com',
    });

    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('ContentProviderSettingService.get', () => {
  it('returns the stored setting when one exists', async () => {
    const stored: ProviderSetting = {
      teamId: 'team-10',
      kind: 'third_party_proxy',
      baseUrl: 'https://proxy.example.com',
    };
    const repo = makeRepo(stored);
    const { audit } = makeAudit();
    const svc = makeSvc(repo, audit);

    const result = await svc.get('team-10');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value).toEqual(stored);
  });

  it('returns google_official default when no setting has been stored', async () => {
    const repo = makeRepo(null); // nothing stored
    const { audit } = makeAudit();
    const svc = makeSvc(repo, audit);

    const result = await svc.get('team-99');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.teamId).toBe('team-99');
    expect(result.value.kind).toBe('google_official');
    expect(result.value.baseUrl).toBe('https://generativelanguage.googleapis.com');
  });

  it('default baseUrl starts with https://', async () => {
    const repo = makeRepo(null);
    const { audit } = makeAudit();
    const svc = makeSvc(repo, audit);

    const result = await svc.get('any-team');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.baseUrl.startsWith('https://')).toBe(true);
  });

  it('scopes the repository query to the correct teamId', async () => {
    const repo = makeRepo(null);
    const { audit } = makeAudit();
    const svc = makeSvc(repo, audit);

    await svc.get('specific-team-id');

    expect(repo.findByTeam).toHaveBeenCalledWith('specific-team-id');
  });
});
