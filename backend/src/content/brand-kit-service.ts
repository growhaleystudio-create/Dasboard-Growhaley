/**
 * BrandKitService — manage a Team's Brand_Kit (logo, fonts, colors, chrome).
 *
 * Design references:
 * - design.md → Components and Interfaces → BrandKitService (R1, R16)
 * - design.md → Error Handling → Pola Transaksi & Kompensasi
 *
 * Key invariants:
 * - Validate ALL assets first; collect ALL error messages before rejecting.
 *   Never upload or write DB after a validation failure (R1.3, R1.4).
 * - Upload to Object_Storage ONLY after all validation passes.
 * - Write DB references + Audit_Log in ONE transaction (R1.1).
 * - If any upload fails → return err(INTERNAL) without writing DB (R1.3).
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 16.6
 */

import type { BrandKit, BrandKitInput, Result } from '@leads-generator/shared';
import { err, ok } from '@leads-generator/shared';

import type { Tx } from '../db/transaction.js';
import { withTransaction } from '../db/transaction.js';
import type { Pool } from 'pg';
import type { AuditLog } from '../privacy/audit-log.js';
import type { BrandKitRepository } from '../repository/brand-kit-repository.js';
import type { ObjectStorage } from '../storage/object-storage.js';

// ---------------------------------------------------------------------------
// Validation constants
// ---------------------------------------------------------------------------

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

// ---------------------------------------------------------------------------
// BrandKitService
// ---------------------------------------------------------------------------

export class BrandKitService {
  constructor(
    private readonly pool: Pool,
    private readonly repo: BrandKitRepository,
    private readonly storage: ObjectStorage,
    private readonly audit: AuditLog,
  ) {}

  /**
   * Save (upsert) the Brand_Kit for a Team.
   *
   * Steps:
   * 1. Validate ALL assets; collect ALL messages before rejecting.
   * 2. If any messages → return err({ code: 'VALIDATION', messages }).
   * 3. Upload logo → err(INTERNAL) on failure (no DB write).
   * 4. Upload each font → err(INTERNAL) on first failure (no DB write).
   * 5. In one transaction: upsert brand_kit, delete old fonts, insert new
   *    fonts, record audit_log.
   * 6. Return ok(brandKit).
   *
   * Requirements: 1.1, 1.2, 1.3, 1.4
   */
  async save(
    teamId: string,
    actorId: string,
    input: BrandKitInput,
  ): Promise<Result<BrandKit>> {
    // -----------------------------------------------------------------------
    // Step 1: Collect ALL validation errors before doing anything else
    // -----------------------------------------------------------------------
    const messages: string[] = [];
    const existingKit = await this.repo.findByTeam(teamId);

    // Logo validation: must be PNG, ≤ 5 MB
    if (!input.logo || !input.logo.bytes || input.logo.bytes.length === 0) {
      if (!existingKit?.logoUrl) messages.push('Logo is required');
    } else {
      if (input.logo.contentType !== 'image/png') {
        messages.push(
          `Logo must be a PNG file (received content type: ${input.logo.contentType})`,
        );
      }
      if (input.logo.bytes.length > MAX_BYTES) {
        messages.push(
          `Logo file size must not exceed 5 MB (received ${input.logo.bytes.length} bytes)`,
        );
      }
    }

    // Fonts validation: ≥ 1, each must be ttf|otf, ≤ 5 MB
    if (!input.fonts || input.fonts.length === 0) {
      if (!existingKit || existingKit.fonts.length === 0) messages.push('At least one brand font is required');
    } else {
      for (let i = 0; i < input.fonts.length; i++) {
        const font = input.fonts[i]!;
        if (font.format !== 'ttf' && font.format !== 'otf') {
          messages.push(
            `Font ${i + 1} ("${font.family}"): format must be "ttf" or "otf" (received "${font.format}")`,
          );
        }
        if (!font.bytes || font.bytes.length === 0) {
          messages.push(`Font ${i + 1} ("${font.family}"): file bytes are missing`);
        } else if (font.bytes.length > MAX_BYTES) {
          messages.push(
            `Font ${i + 1} ("${font.family}"): file size must not exceed 5 MB (received ${font.bytes.length} bytes)`,
          );
        }
      }
    }

    // Colors validation: ≥ 1 valid hex color
    if (!input.colors || input.colors.length === 0) {
      messages.push('At least one brand color is required');
    } else {
      for (const color of input.colors) {
        if (!HEX_COLOR_REGEX.test(color)) {
          messages.push(
            `Color "${color}" is not a valid hexadecimal color (expected #RGB or #RRGGBB)`,
          );
        }
      }
    }

    // Chrome validation: all required fields must be present
    if (!input.chrome) {
      messages.push('Chrome definition is required (logoPlacement, pageNumberFormat, siteUrl)');
    } else {
      if (!input.chrome.logoPlacement) {
        messages.push('Chrome logoPlacement is required');
      }
      if (input.chrome.pageNumberFormat === undefined || input.chrome.pageNumberFormat === null) {
        messages.push('Chrome pageNumberFormat is required');
      }
      if (input.chrome.siteUrl === undefined || input.chrome.siteUrl === null) {
        messages.push('Chrome siteUrl is required');
      }
    }

    // Typography validation (optional): all provided colors must be valid hex,
    // and any referenced font family must exist among the uploaded fonts.
    if (input.typography) {
      const t = input.typography;
      const hexFields: [string, string][] = [
        ['cover.color', t.cover?.color],
        ['header.color', t.header?.color],
        ['body.color', t.body?.color],
        ['highlightColor', t.highlightColor],
        ['background', t.background],
        ['paginationColor', t.paginationColor],
        ['metaTextColor', t.metaTextColor],
        ['accent', t.accent],
      ].filter((e): e is [string, string] => typeof e[1] === 'string');
      for (const [field, color] of hexFields) {
        if (!HEX_COLOR_REGEX.test(color)) {
          messages.push(`Typography ${field} ("${color}") is not a valid hex color`);
        }
      }
      const families = new Set([
        ...(input.fonts ?? []).map((f) => f.family),
        ...(existingKit?.fonts ?? []).map((f) => f.family),
      ]);
      for (const [role, fam] of [
        ['cover', t.cover?.fontFamily],
        ['header', t.header?.fontFamily],
        ['body', t.body?.fontFamily],
      ] as const) {
        if (fam && fam.length > 0 && !families.has(fam)) {
          messages.push(`Typography ${role} font "${fam}" is not among the uploaded fonts`);
        }
      }
      for (const [role, size] of [
        ['cover', t.cover?.sizePx],
        ['header', t.header?.sizePx],
        ['body', t.body?.sizePx],
      ] as const) {
        if (size !== undefined && (!Number.isInteger(size) || size < 8 || size > 180)) {
          messages.push(`Typography ${role} size must be an integer between 8 and 180`);
        }
      }
    }

    // -----------------------------------------------------------------------
    // Step 2: Reject with ALL collected messages if any validation failed
    // -----------------------------------------------------------------------
    if (messages.length > 0) {
      return err({ code: 'VALIDATION', messages });
    }

    // -----------------------------------------------------------------------
    // Step 3: Upload logo when provided; otherwise keep the existing asset.
    // -----------------------------------------------------------------------
    let logoUrl = existingKit?.logoUrl ?? '';
    if (input.logo && input.logo.bytes.length > 0) {
      const logoUploadResult = await this.storage.upload(
        teamId,
        'brand-kit/logo.png',
        input.logo.bytes,
        input.logo.contentType,
      );
      if (!logoUploadResult.ok) {
        const errMsg =
          logoUploadResult.error.code !== 'VALIDATION'
            ? logoUploadResult.error.message
            : logoUploadResult.error.messages.join('; ');
        return err({
          code: 'INTERNAL',
          message: `Failed to upload logo: ${errMsg}`,
        });
      }
      logoUrl = logoUploadResult.value;
    }

    // -----------------------------------------------------------------------
    // Step 4: Upload each font; on first failure return err without DB write
    // -----------------------------------------------------------------------
    type FontUploadRecord = {
      url: string;
      family: string;
      format: 'ttf' | 'otf';
      weight?: number;
      style?: 'normal' | 'italic';
    };
    const inputFonts = input.fonts ?? [];
    const fontUrls: FontUploadRecord[] = [];
    for (let i = 0; i < inputFonts.length; i++) {
      const font = inputFonts[i]!;
      const fontMimeType =
        font.format === 'ttf' ? 'font/ttf' : 'font/otf';
      const fontKey = `brand-kit/fonts/${i}.${font.format}`;

      const fontUploadResult = await this.storage.upload(
        teamId,
        fontKey,
        font.bytes,
        fontMimeType,
      );
      if (!fontUploadResult.ok) {
        const errMsg =
          fontUploadResult.error.code !== 'VALIDATION'
            ? fontUploadResult.error.message
            : fontUploadResult.error.messages.join('; ');
        return err({
          code: 'INTERNAL',
          message: `Failed to upload font ${i + 1} ("${font.family}"): ${errMsg}`,
        });
      }
      const fontRecord: FontUploadRecord = {
        url: fontUploadResult.value,
        family: font.family,
        format: font.format,
      };
      if (font.weight !== undefined) fontRecord.weight = font.weight;
      if (font.style !== undefined) fontRecord.style = font.style;
      fontUrls.push(fontRecord);
    }

    // -----------------------------------------------------------------------
    // Step 5: Write DB + Audit_Log in a single transaction
    // -----------------------------------------------------------------------
    let savedBrandKit: BrandKit;
    try {
      savedBrandKit = await withTransaction(this.pool, async (tx: Tx) => {
        // Upsert brand_kit row
        const kit = await this.repo.insert(teamId, {
          logoUrl,
          colors: input.colors,
          chrome: input.chrome,
          ...(input.typography ? { typography: input.typography } : {}),
        });

        if (fontUrls.length > 0) {
          // Replace fonts only when new font files are provided.
          await this.repo.deleteFonts(kit.id);
          for (const fontData of fontUrls) {
            await this.repo.insertFont(kit.id, fontData);
          }
        }

        // Record audit entry within the same transaction
        await this.audit.recordTx(tx, {
          teamId,
          actorId,
          action: 'content_manage',
          objectType: 'brand_kit',
          objectId: kit.id,
          metadata: { op: 'save', fontsCount: fontUrls.length, colorsCount: input.colors.length },
        });

        // Re-fetch the full kit with fonts via the same repo (passes tx via constructor)
        // Since repo uses this.db which is the pool, we build the result from known data.
        const builtFonts: BrandKit['fonts'] = fontUrls.length > 0
          ? fontUrls.map((f, idx) => {
              const font: BrandKit['fonts'][number] = {
                id: `font-pending-${idx}`,
                url: f.url,
                family: f.family,
              };
              if (f.weight !== undefined) font.weight = f.weight;
              if (f.style !== undefined) font.style = f.style;
              return font;
            })
          : (existingKit?.fonts ?? []);

        return {
          ...kit,
          fonts: builtFonts,
          ...(input.typography ? { typography: input.typography } : {}),
        };
      });
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return err({
        code: 'INTERNAL',
        message: `Failed to persist Brand_Kit: ${message}`,
      });
    }

    // -----------------------------------------------------------------------
    // Step 6: Return the saved Brand_Kit
    // -----------------------------------------------------------------------
    return ok(savedBrandKit);
  }

  /**
   * Retrieve the Brand_Kit for a Team, or null if none has been saved.
   * Requirements: 16.2
   */
  async get(teamId: string): Promise<Result<BrandKit | null>> {
    const kit = await this.repo.findByTeam(teamId);
    return ok(kit);
  }
}
