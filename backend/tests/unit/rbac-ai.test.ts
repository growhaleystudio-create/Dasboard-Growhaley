/**
 * Spot-checks for the AI rows of the RBAC permission matrix (Task 17.3).
 *
 * The four AI actions (`ai.configure`, `ai.enable_scan`, `ai.reanalyze`,
 * `ai.read_insight`) implement R13's authorization rules:
 *
 * - `ai.configure` is Admin-only (R13.18).
 * - `ai.enable_scan` and `ai.reanalyze` are Admin + Member (R13.4, R13.16,
 *   R13.17).
 * - `ai.read_insight` is granted to every role, including Viewer (R13.11).
 *
 * The exhaustive cross-product is covered by Property 15 (Task 4.2). This
 * file locks in the AI-specific cells so accidental edits to those rows
 * fail loudly here without waiting for the full property suite.
 */

import { describe, it, expect } from 'vitest';

import { rbacGuard } from '../../src/auth/rbac.js';

describe('rbacGuard.can — AI matrix rows (R13)', () => {
  describe('Viewer', () => {
    it('cannot ai.configure', () => {
      expect(rbacGuard.can('viewer', 'ai.configure')).toBe(false);
    });

    it('cannot ai.enable_scan', () => {
      expect(rbacGuard.can('viewer', 'ai.enable_scan')).toBe(false);
    });

    it('cannot ai.reanalyze', () => {
      expect(rbacGuard.can('viewer', 'ai.reanalyze')).toBe(false);
    });

    it('can ai.read_insight', () => {
      expect(rbacGuard.can('viewer', 'ai.read_insight')).toBe(true);
    });
  });

  describe('Member', () => {
    it('cannot ai.configure', () => {
      expect(rbacGuard.can('member', 'ai.configure')).toBe(false);
    });

    it('can ai.enable_scan', () => {
      expect(rbacGuard.can('member', 'ai.enable_scan')).toBe(true);
    });

    it('can ai.reanalyze', () => {
      expect(rbacGuard.can('member', 'ai.reanalyze')).toBe(true);
    });

    it('can ai.read_insight', () => {
      expect(rbacGuard.can('member', 'ai.read_insight')).toBe(true);
    });
  });

  describe('Admin', () => {
    it('can ai.configure', () => {
      expect(rbacGuard.can('admin', 'ai.configure')).toBe(true);
    });

    it('can ai.enable_scan', () => {
      expect(rbacGuard.can('admin', 'ai.enable_scan')).toBe(true);
    });

    it('can ai.reanalyze', () => {
      expect(rbacGuard.can('admin', 'ai.reanalyze')).toBe(true);
    });

    it('can ai.read_insight', () => {
      expect(rbacGuard.can('admin', 'ai.read_insight')).toBe(true);
    });
  });
});
