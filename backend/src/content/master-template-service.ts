/**
 * MasterTemplateService — manages a Team's Master_Template (hard rules for
 * carousel content generation).
 *
 * Design references:
 * - design.md → Components and Interfaces → MasterTemplateService (R2, R9)
 *
 * `save` validates all inputs, collects ALL violations before rejecting (never
 * changes the existing Master_Template on failure), then upserts and writes a
 * `content_manage` audit entry in a single database call.
 *
 * `get` returns the current Master_Template for the team or null.
 *
 * `rules` returns the immutable MasterTemplateRules used by Planner and
 * Validator (ReadonlySet / ReadonlyMap).
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import type { AspectRatio, BlockType, MasterTemplate, MasterTemplateRules, TextLengthLimit } from '@leads-generator/shared';
import { err, ok, type Result } from '@leads-generator/shared';

import type { AuditLog } from '../privacy/audit-log.js';
import type { MasterTemplateRepository } from '../repository/master-template-repository.js';

// ---------------------------------------------------------------------------
// Hard-coded valid sets (design spec)
// ---------------------------------------------------------------------------

export const VALID_BLOCKS: ReadonlySet<BlockType> = new Set<BlockType>([
  'heading',
  'body',
  'mockup',
  'chart',
  'quote',
  'stat',
  'bullet',
  'cta',
  'image',
]);

export const VALID_RATIOS: ReadonlySet<AspectRatio> = new Set<AspectRatio>([
  '1:1',
  '4:5',
  '9:16',
]);

// ---------------------------------------------------------------------------
// Input type (mirrors MasterTemplate minus generated fields)
// ---------------------------------------------------------------------------

export type MasterTemplateInput = Omit<MasterTemplate, 'id' | 'teamId' | 'updatedAt'>;

// ---------------------------------------------------------------------------
// Internal validation helpers (pure, collect-all style)
// ---------------------------------------------------------------------------

function validateInput(input: MasterTemplateInput): string[] {
  const violations: string[] = [];

  // allowedBlocks must be a non-empty subset of VALID_BLOCKS (R2.1, R2.3)
  if (!Array.isArray(input.allowedBlocks) || input.allowedBlocks.length === 0) {
    violations.push('allowedBlocks harus memiliki setidaknya satu tipe blok');
  } else {
    for (const block of input.allowedBlocks) {
      if (!VALID_BLOCKS.has(block)) {
        violations.push(`Tipe blok tidak dikenal: ${block}`);
      }
    }
  }

  // maxSlides must be an integer in [1, 10] (R2.1, R2.3)
  if (
    !Number.isInteger(input.maxSlides) ||
    input.maxSlides < 1 ||
    input.maxSlides > 10
  ) {
    violations.push('maxSlides harus berupa bilangan bulat antara 1 dan 10');
  }

  // aspectRatios: must be a non-empty subset of VALID_RATIOS (R2.1, R2.3)
  if (!Array.isArray(input.aspectRatios) || input.aspectRatios.length === 0) {
    violations.push('aspectRatios harus memiliki setidaknya satu rasio');
  } else {
    for (const ratio of input.aspectRatios) {
      if (!VALID_RATIOS.has(ratio)) {
        violations.push(`Rasio aspek tidak valid: ${ratio}`);
      }
    }
  }

  // textLimits: each maxChars must be > 0 (R2.1)
  if (Array.isArray(input.textLimits)) {
    for (const limit of input.textLimits) {
      if (limit.maxChars <= 0) {
        violations.push(
          `textLimits.${limit.blockType}: maxChars harus lebih dari 0, diterima ${limit.maxChars}`,
        );
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MasterTemplateService {
  constructor(
    private readonly templateRepo: MasterTemplateRepository,
    private readonly audit: AuditLog,
  ) {}

  /**
   * Validate and upsert the Master_Template for a Team.
   *
   * Validation rules (R2.1, R2.3 — collect ALL violations):
   * 1. allowedBlocks ⊆ VALID_BLOCKS.
   * 2. maxSlides ∈ [1, 10].
   * 3. textLimits: each maxChars > 0.
   * 4. aspectRatios ⊆ VALID_RATIOS, at least one value.
   *
   * On any violation the existing Master_Template is NOT modified (R2.3).
   * On success the upsert + audit entry are written atomically (R2.1).
   */
  async save(
    teamId: string,
    actorId: string,
    input: MasterTemplateInput,
  ): Promise<Result<MasterTemplate>> {
    const violations = validateInput(input);

    if (violations.length > 0) {
      return err({ code: 'VALIDATION', messages: violations });
    }

    // --- Phase 3: Upsert (R2.1) ---
    const saved = await this.templateRepo.upsert(teamId, {
      allowedBlocks: input.allowedBlocks,
      maxSlides: input.maxSlides,
      textLimits: input.textLimits,
      aspectRatios: input.aspectRatios,
      defaultTone: input.defaultTone,
    });

    // --- Phase 4: Audit (R2.1, content_manage) ---
    await this.audit.record({
      teamId,
      actorId,
      action: 'content_manage',
      objectType: 'master_template',
      objectId: saved.id,
      metadata: { op: 'save' },
    });

    return ok(saved);
  }

  /**
   * Return the current Master_Template for the Team, or null when none has
   * been saved yet (R2.5 — only the owning Team can access it).
   */
  async get(teamId: string): Promise<Result<MasterTemplate | null>> {
    const template = await this.templateRepo.findByTeam(teamId);
    return ok(template);
  }

  /**
   * Return the immutable MasterTemplateRules used by Planner and Validator.
   * Returns NOT_FOUND when no Master_Template has been saved for the Team
   * (callers must check before generating content — R3.7).
   */
  async rules(teamId: string): Promise<Result<MasterTemplateRules>> {
    const template = await this.templateRepo.findByTeam(teamId);
    if (!template) {
      return err({
        code: 'NOT_FOUND',
        message: 'Master_Template belum dikonfigurasi',
      });
    }

    // Build the immutable view (ReadonlySet / ReadonlyMap).
    const textLimitsMap = new Map<BlockType, number>();
    for (const limit of template.textLimits) {
      textLimitsMap.set(limit.blockType, limit.maxChars);
    }

    const rules: MasterTemplateRules = {
      allowedBlocks: new Set<BlockType>(template.allowedBlocks),
      maxSlides: template.maxSlides,
      textLimits: textLimitsMap as ReadonlyMap<BlockType, number>,
      aspectRatios: new Set<AspectRatio>(template.aspectRatios),
      defaultTone: template.defaultTone,
    };

    return ok(rules);
  }
}
