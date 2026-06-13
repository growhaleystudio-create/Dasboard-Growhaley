import { query, type DbExecutor } from './types.js';

export interface ContentGeneration {
  id: string;
  teamId: string;
  templateId: string | null;
  prompt: string;
  generatedText: string | null;
  generatedImageUrl: string | null;
  createdAt: Date;
}

interface ContentGenerationRow {
  id: string;
  team_id: string;
  template_id: string | null;
  prompt: string;
  generated_text: string | null;
  generated_image_url: string | null;
  created_at: Date;
}

export class ContentGenerationRepository {
  constructor(private readonly db: DbExecutor) {}

  /** Inserts a new generated content log. Uses tenant-scoping (R2.8). */
  async create(
    teamId: string,
    data: {
      templateId?: string | null;
      prompt: string;
      generatedText?: string | null;
      generatedImageUrl?: string | null;
    }
  ): Promise<ContentGeneration> {
    const rows = await query<ContentGenerationRow>(
      this.db,
      `INSERT INTO content_generation (team_id, template_id, prompt, generated_text, generated_image_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, team_id, template_id, prompt, generated_text, generated_image_url, created_at`,
      [
        teamId,
        data.templateId ?? null,
        data.prompt,
        data.generatedText ?? null,
        data.generatedImageUrl ?? null,
      ]
    );

    const row = rows[0]!;
    return {
      id: row.id,
      teamId: row.team_id,
      templateId: row.template_id,
      prompt: row.prompt,
      generatedText: row.generated_text,
      generatedImageUrl: row.generated_image_url,
      createdAt: row.created_at,
    };
  }

  /** Gets generation history for a team. Uses tenant-scoping (R2.8). */
  async getForTeam(teamId: string): Promise<ContentGeneration[]> {
    const rows = await query<ContentGenerationRow>(
      this.db,
      `SELECT id, team_id, template_id, prompt, generated_text, generated_image_url, created_at
         FROM content_generation
        WHERE team_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [teamId]
    );

    return rows.map((row) => ({
      id: row.id,
      teamId: row.team_id,
      templateId: row.template_id,
      prompt: row.prompt,
      generatedText: row.generated_text,
      generatedImageUrl: row.generated_image_url,
      createdAt: row.created_at,
    }));
  }
}
