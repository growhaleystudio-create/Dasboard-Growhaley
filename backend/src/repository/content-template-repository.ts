import { query, type DbExecutor } from './types.js';

export interface StyleGuide {
  brandColors?: string[] | undefined;
  fontStyle?: string | undefined;
  mood?: string | undefined;
  layoutRules?: string[] | undefined;
  doNot?: string[] | undefined;
}

export interface ContentTemplate {
  id: string;
  teamId: string;
  name: string;
  type:
    | 'instagram'
    | 'email_marketing'
    | 'threads'
    | 'linkedin'
    | 'facebook'
    | 'twitter_x'
    | 'social_post'
    | 'email_banner'
    | 'carousel'
    | 'story'
    | 'other';
  styleGuide: StyleGuide;
  systemPrompt: string;
  referenceImages?: string[] | undefined;
  createdAt: Date;
  updatedAt: Date;
}

interface ContentTemplateRow {
  id: string;
  team_id: string;
  name: string;
  type: string;
  style_guide: any;
  system_prompt: string;
  created_at: Date;
  updated_at: Date;
}

export class ContentTemplateRepository {
  constructor(private readonly db: DbExecutor) {}

  /** Get all templates for a team. Uses tenant-scoping (R2.8). */
  async getForTeam(teamId: string): Promise<ContentTemplate[]> {
    // 1. Fetch templates
    const templateRows = await query<ContentTemplateRow>(
      this.db,
      `SELECT id, team_id, name, type, style_guide, system_prompt, created_at, updated_at
         FROM content_template
        WHERE team_id = $1
        ORDER BY created_at DESC`,
      [teamId]
    );

    if (templateRows.length === 0) return [];

    // 2. Fetch all reference images for these templates in a batch
    const templateIds = templateRows.map((r) => r.id);
    const referenceRows = await query<{ template_id: string; image_url: string }>(
      this.db,
      `SELECT template_id, image_url
         FROM content_template_reference
        WHERE template_id = ANY($1)`,
      [templateIds]
    );

    // Group references by template_id
    const referencesMap: Record<string, string[]> = {};
    for (const ref of referenceRows) {
      const tid = ref.template_id;
      if (!referencesMap[tid]) {
        referencesMap[tid] = [];
      }
      referencesMap[tid]!.push(ref.image_url);
    }

    return templateRows.map((row) => ({
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      type: row.type as any,
      styleGuide: row.style_guide as StyleGuide,
      systemPrompt: row.system_prompt,
      referenceImages: referencesMap[row.id] || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /** Get a single template by ID. Uses tenant-scoping (R2.8). */
  async getById(teamId: string, id: string): Promise<ContentTemplate | null> {
    const rows = await query<ContentTemplateRow>(
      this.db,
      `SELECT id, team_id, name, type, style_guide, system_prompt, created_at, updated_at
         FROM content_template
        WHERE team_id = $1 AND id = $2`,
      [teamId, id]
    );

    if (rows.length === 0) return null;
    const row = rows[0]!;

    const referenceRows = await query<{ image_url: string }>(
      this.db,
      `SELECT image_url
         FROM content_template_reference
        WHERE template_id = $1`,
      [id]
    );

    return {
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      type: row.type as any,
      styleGuide: row.style_guide as StyleGuide,
      systemPrompt: row.system_prompt,
      referenceImages: referenceRows.map((r) => r.image_url),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Creates a new template. Uses tenant-scoping (R2.8). */
  async create(
    teamId: string,
    data: {
      id?: string;
      name: string;
      type: string;
      styleGuide: StyleGuide;
      systemPrompt: string;
    }
  ): Promise<ContentTemplate> {
    const rows = await query<ContentTemplateRow>(
      this.db,
      `INSERT INTO content_template (id, team_id, name, type, style_guide, system_prompt)
       VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5::jsonb, $6)
       RETURNING id, team_id, name, type, style_guide, system_prompt, created_at, updated_at`,
      [data.id || null, teamId, data.name, data.type, JSON.stringify(data.styleGuide), data.systemPrompt]
    );

    const row = rows[0]!;
    return {
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      type: row.type as any,
      styleGuide: row.style_guide as StyleGuide,
      systemPrompt: row.system_prompt,
      referenceImages: [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Updates an existing template. Uses tenant-scoping (R2.8). */
  async update(
    teamId: string,
    id: string,
    data: {
      name?: string | undefined;
      type?: string | undefined;
      styleGuide?: StyleGuide | undefined;
      systemPrompt?: string | undefined;
    }
  ): Promise<ContentTemplate | null> {
    const fields: string[] = [];
    const params: unknown[] = [teamId, id];

    if (data.name !== undefined) {
      fields.push(`name = $${params.push(data.name)}`);
    }
    if (data.type !== undefined) {
      fields.push(`type = $${params.push(data.type)}`);
    }
    if (data.styleGuide !== undefined) {
      fields.push(`style_guide = $${params.push(JSON.stringify(data.styleGuide))}::jsonb`);
    }
    if (data.systemPrompt !== undefined) {
      fields.push(`system_prompt = $${params.push(data.systemPrompt)}`);
    }

    if (fields.length === 0) {
      return this.getById(teamId, id);
    }

    fields.push(`updated_at = now()`);

    const sql = `
      UPDATE content_template
         SET ${fields.join(', ')}
       WHERE team_id = $1 AND id = $2
       RETURNING id, team_id, name, type, style_guide, system_prompt, created_at, updated_at
    `;

    const rows = await query<ContentTemplateRow>(this.db, sql, params);
    if (rows.length === 0) return null;
    const row = rows[0]!;

    const referenceRows = await query<{ image_url: string }>(
      this.db,
      `SELECT image_url
         FROM content_template_reference
        WHERE template_id = $1`,
      [id]
    );

    return {
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      type: row.type as any,
      styleGuide: row.style_guide as StyleGuide,
      systemPrompt: row.system_prompt,
      referenceImages: referenceRows.map((r) => r.image_url),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Deletes a template. Uses tenant-scoping (R2.8). */
  async delete(teamId: string, id: string): Promise<boolean> {
    const rows = await query(
      this.db,
      `DELETE FROM content_template
        WHERE team_id = $1 AND id = $2
        RETURNING id`,
      [teamId, id]
    );
    return rows.length > 0;
  }

  /** Adds a reference image URL to a template. */
  async addReferenceImage(templateId: string, imageUrl: string): Promise<string> {
    const rows = await query<{ id: string }>(
      this.db,
      `INSERT INTO content_template_reference (template_id, image_url)
       VALUES ($1, $2)
       RETURNING id`,
      [templateId, imageUrl]
    );
    return rows[0]!.id;
  }

  /** Clears all reference image URLs for a template. */
  async clearReferenceImages(templateId: string): Promise<void> {
    await query(
      this.db,
      `DELETE FROM content_template_reference
        WHERE template_id = $1`,
      [templateId]
    );
  }
}
