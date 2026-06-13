/**
 * Spot-checks for the RBAC permission matrix (Task 4.1).
 *
 * The exhaustive cross-product is covered by the property test that
 * Task 4.2 owns (Property 15). This file only locks in six representative
 * cells from design.md so accidental edits to the matrix (e.g. flipping
 * `export.run` to allow Member) fail loudly here without waiting for the
 * full property suite.
 */

import { describe, it, expect } from 'vitest';

import { rbacGuard } from '../../src/auth/rbac.js';

describe('rbacGuard.can — permission matrix spot-checks (R2.4–R2.7)', () => {
  it('Viewer can lead.read', () => {
    expect(rbacGuard.can('viewer', 'lead.read')).toBe(true);
  });

  it('Viewer cannot lead.write', () => {
    expect(rbacGuard.can('viewer', 'lead.write')).toBe(false);
  });

  it('Member can scan.execute', () => {
    expect(rbacGuard.can('member', 'scan.execute')).toBe(true);
  });

  it('Member cannot team.manage', () => {
    expect(rbacGuard.can('member', 'team.manage')).toBe(false);
  });

  it('Admin can export.run', () => {
    expect(rbacGuard.can('admin', 'export.run')).toBe(true);
  });

  it('Admin can team.manage', () => {
    expect(rbacGuard.can('admin', 'team.manage')).toBe(true);
  });
});
