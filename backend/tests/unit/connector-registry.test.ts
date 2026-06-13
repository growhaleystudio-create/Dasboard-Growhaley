/**
 * Unit tests for {@link Connector_Registry} (Task 6.2, R3.1, R3.2, R3.3,
 * R3.9).
 *
 * Verifies the in-process registry behavior:
 * - `register` then `listInstalled` reflects the registration; a duplicate
 *   `sourceId` registration throws (R3.9 — loud failure beats silent
 *   overwrite).
 * - `listForTeam` overlays installed connectors with `team_connector`
 *   rows: a connector without a row gets the default `available` status
 *   (R3.2); a connector with a row inherits that row's `status` and
 *   `unavailableReason` (R3.1, R3.3).
 * - Registering a NEW connector after an initial `listForTeam` does NOT
 *   change the descriptors of connectors already in the registry
 *   (R3.9 non-interference).
 *
 * `TeamConnectorRepository` is mocked with `vi.fn()` so the tests run
 * without a database.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ConnectorDescriptor, ConnectorStatus, RawProspect } from '@leads-generator/shared';

import { Connector_Registry } from '../../src/connector/registry.js';
import type { Source_Connector, ScanQuery } from '../../src/connector/source-connector.js';
import type { TeamConnectorRepository } from '../../src/repository/team-connector-repository.js';

/**
 * Build a minimal {@link Source_Connector} stub with the metadata the
 * registry actually reads (`sourceId`, `displayName`, `usagePolicy`).
 *
 * The `fetch`/`normalize`/`checkAvailability` implementations are inert
 * because the registry never invokes them in the methods under test.
 */
function makeConnector(
  sourceId: string,
  overrides: Partial<Source_Connector> = {},
): Source_Connector {
  const base: Source_Connector = {
    sourceId,
    displayName: `${sourceId} display`,
    async checkAvailability(): Promise<ConnectorStatus> {
      return 'available';
    },
    async fetch(_query: ScanQuery, _signal: AbortSignal): Promise<RawProspect[]> {
      return [];
    },
    normalize(_raw: RawProspect, teamId: string) {
      return {
        teamId,
        sources: [sourceId],
        matchedKeywords: [],
        discoveredAt: new Date(0),
      };
    },
  };
  return { ...base, ...overrides };
}

/**
 * Build a mock {@link TeamConnectorRepository}. We only stub the methods
 * the registry actually calls (`listForTeam`, `get`); everything else is
 * an explicit throw so an accidental new dependency surfaces immediately.
 */
function makeMockRepo(rows: ConnectorDescriptor[] = []) {
  const listForTeam = vi.fn(
    async (_teamId: string): Promise<ConnectorDescriptor[]> => rows,
  );
  const get = vi.fn(
    async (_teamId: string, sourceId: string): Promise<ConnectorDescriptor | null> => {
      return rows.find((row) => row.sourceId === sourceId) ?? null;
    },
  );

  const repo = {
    listForTeam,
    get,
    upsertStatus: vi.fn(async () => {
      throw new Error('not used in registry tests');
    }),
    setEncryptedCredentials: vi.fn(async () => {
      throw new Error('not used in registry tests');
    }),
    clearEncryptedCredentials: vi.fn(async () => {
      throw new Error('not used in registry tests');
    }),
    getEncryptedCredentialsForVault: vi.fn(async () => {
      throw new Error('not used in registry tests');
    }),
  } as unknown as TeamConnectorRepository;

  return { repo, listForTeam, get };
}

describe('Connector_Registry.register / listInstalled / get', () => {
  it('register then listInstalled returns the connector', () => {
    const { repo } = makeMockRepo();
    const registry = new Connector_Registry(repo);
    const fiverr = makeConnector('fiverr');
    const threads = makeConnector('threads');

    registry.register(fiverr);
    registry.register(threads);

    expect(registry.listInstalled()).toEqual([fiverr, threads]);
    expect(registry.get('fiverr')).toBe(fiverr);
    expect(registry.get('threads')).toBe(threads);
    expect(registry.get('unknown')).toBeNull();
  });

  it('throws when registering a connector with a duplicate sourceId', () => {
    const { repo } = makeMockRepo();
    const registry = new Connector_Registry(repo);
    registry.register(makeConnector('fiverr'));

    expect(() => registry.register(makeConnector('fiverr'))).toThrowError(
      'connector already registered: fiverr',
    );
  });

  it('returns a fresh array from listInstalled (callers cannot mutate state)', () => {
    const { repo } = makeMockRepo();
    const registry = new Connector_Registry(repo);
    const fiverr = makeConnector('fiverr');
    registry.register(fiverr);

    const snapshot = registry.listInstalled();
    snapshot.length = 0;

    // The internal map is unaffected by external mutation.
    expect(registry.listInstalled()).toEqual([fiverr]);
  });
});

describe('Connector_Registry.listForTeam / getForTeam', () => {
  it('defaults to "available" when no team_connector row exists (R3.2)', async () => {
    const { repo, listForTeam } = makeMockRepo([]);
    const registry = new Connector_Registry(repo);
    const fiverr = makeConnector('fiverr', {
      usagePolicy: { allowedRetentionDays: 30 },
    });
    registry.register(fiverr);

    const descriptors = await registry.listForTeam('team-1');

    expect(listForTeam).toHaveBeenCalledWith('team-1');
    expect(descriptors).toEqual([
      {
        sourceId: 'fiverr',
        displayName: 'fiverr display',
        status: 'available',
        usagePolicy: { allowedRetentionDays: 30 },
      },
    ]);
  });

  it('inherits status and unavailableReason from team_connector row (R3.1, R3.3)', async () => {
    const { repo } = makeMockRepo([
      {
        sourceId: 'linkedin',
        displayName: 'stale linkedin display', // should be overridden
        status: 'unavailable',
        unavailableReason: 'no usable public API',
      },
    ]);
    const registry = new Connector_Registry(repo);
    const linkedin = makeConnector('linkedin', { displayName: 'LinkedIn' });
    registry.register(linkedin);

    const descriptors = await registry.listForTeam('team-1');

    expect(descriptors).toEqual([
      {
        sourceId: 'linkedin',
        // displayName comes from the installed connector, not the row.
        displayName: 'LinkedIn',
        status: 'unavailable',
        unavailableReason: 'no usable public API',
      },
    ]);
  });

  it('merges installed connectors with team rows in registration order', async () => {
    // 'threads' has a row, 'fiverr' does not.
    const { repo } = makeMockRepo([
      {
        sourceId: 'threads',
        displayName: 'ignored',
        status: 'requires_configuration',
      },
    ]);
    const registry = new Connector_Registry(repo);
    registry.register(makeConnector('fiverr'));
    registry.register(makeConnector('threads'));

    const descriptors = await registry.listForTeam('team-1');
    const ids = descriptors.map((d) => d.sourceId);
    const statuses = descriptors.map((d) => d.status);

    expect(ids).toEqual(['fiverr', 'threads']);
    expect(statuses).toEqual(['available', 'requires_configuration']);
  });

  it('getForTeam returns null when the connector is not installed', async () => {
    const { repo, get } = makeMockRepo();
    const registry = new Connector_Registry(repo);

    const descriptor = await registry.getForTeam('team-1', 'unknown');

    expect(descriptor).toBeNull();
    // Repo must NOT be hit when the connector isn't installed; that's a
    // pointless DB round-trip.
    expect(get).not.toHaveBeenCalled();
  });

  it('getForTeam combines installed connector with team row (or default)', async () => {
    const { repo } = makeMockRepo([
      {
        sourceId: 'threads',
        displayName: 'ignored',
        status: 'requires_configuration',
      },
    ]);
    const registry = new Connector_Registry(repo);
    registry.register(makeConnector('fiverr'));
    registry.register(makeConnector('threads', { displayName: 'Threads' }));

    const fiverrDesc = await registry.getForTeam('team-1', 'fiverr');
    const threadsDesc = await registry.getForTeam('team-1', 'threads');

    expect(fiverrDesc).toEqual({
      sourceId: 'fiverr',
      displayName: 'fiverr display',
      status: 'available',
    });
    expect(threadsDesc).toEqual({
      sourceId: 'threads',
      displayName: 'Threads',
      status: 'requires_configuration',
    });
  });

  it('register after listForTeam does not change existing descriptors (R3.9)', async () => {
    const { repo } = makeMockRepo([
      {
        sourceId: 'linkedin',
        displayName: 'ignored',
        status: 'unavailable',
        unavailableReason: 'no usable public API',
      },
    ]);
    const registry = new Connector_Registry(repo);
    registry.register(makeConnector('linkedin', { displayName: 'LinkedIn' }));

    const before = await registry.listForTeam('team-1');
    expect(before).toHaveLength(1);

    // Register a second connector and re-list. The first connector's
    // descriptor must be byte-for-byte identical: R3.9 forbids any
    // observable change to existing connectors when a new one is added.
    registry.register(makeConnector('fiverr'));
    const after = await registry.listForTeam('team-1');

    expect(after).toHaveLength(2);
    // The original linkedin descriptor is unchanged.
    expect(after[0]).toEqual(before[0]);
    // The new connector takes the default available status (R3.2).
    expect(after[1]).toEqual({
      sourceId: 'fiverr',
      displayName: 'fiverr display',
      status: 'available',
    });
  });
});
