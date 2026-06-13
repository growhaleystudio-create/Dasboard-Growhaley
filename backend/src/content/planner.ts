/**
 * Planner — memanggil model teks AI_Provider untuk mengubah prompt User,
 * aturan Master_Template, dan Approved_Example relevan menjadi sebuah
 * Content_Plan terstruktur (JSON).
 *
 * Alur eksekusi:
 *   1. Resolve endpoint via ProviderEndpointResolver.resolve(teamId)
 *   2. Bangun systemPrompt + userPrompt dari input
 *   3. Jalankan wrapper.execute(ctx, async (apiKey) => {
 *        - assertAllowed(endpoint url) → gagal bila endpoint_mismatch / insecure
 *        - POST ke Gemini generateContent API dengan timeout 30 detik
 *        - Kembalikan raw text string
 *      })
 *   4. Parse text: JSON.parse → parseContentPlan → non-valid → PlannerError.non_json
 *   5. Petakan kegagalan wrapper → PlannerError yang sesuai
 *   6. Kembalikan ok(plan) atau err(PlannerError)
 *
 * Aturan penting (R7.3, R8.2, R8.3):
 *   - Planner HANYA menandai chart/mockup via chartDataRef/mockupRef tanpa
 *     mengarang nilai data.
 *   - Approved_Example hanya memengaruhi layoutVariantHint/komposisi blok,
 *     BUKAN warna/logo/font.
 *
 * Design: Components and Interfaces → Content_Plan & Planner
 * Requirements: 3.2, 3.3, 3.4, 3.5, 7.3, 8.2, 8.3
 */

import { ok, err } from '@leads-generator/shared';
import type { Result, ContentPlan, MasterTemplateRules, ApprovedExampleStructure } from '@leads-generator/shared';

import type { AiCallWrapper, AiCallContext } from './ai-call-wrapper.js';
import { parseContentPlan } from './content-plan-validator.js';
import { providerKindFromBaseUrl, requireProviderBaseUrl } from './provider-key-routing.js';
import type { TeamAiSettingsService } from '../auth/team-ai-settings-service.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PlannerInput {
  teamId: string;
  jobId: string;
  actorId: string;
  prompt: string;
  rules: MasterTemplateRules;
  examples: ApprovedExampleStructure[];
  requestedSlideCount?: number;
  expectsData?: boolean;
  repairOf?: ContentPlan;
  validationErrors?: string[];
}

export type PlannerError =
  | { kind: 'non_json' }
  | { kind: 'budget_exceeded' }
  | { kind: 'endpoint_mismatch' }
  | { kind: 'insecure_transport' }
  | { kind: 'privacy_violation' }
  | { kind: 'timeout' }
  | { kind: 'provider_error'; message: string };

export interface Planner {
  plan(input: PlannerInput, signal: AbortSignal): Promise<Result<ContentPlan, PlannerError>>;
}

// ---------------------------------------------------------------------------
// Gemini API URL
// ---------------------------------------------------------------------------

const GEMINI_TEXT_PATH =
  '/v1beta/models/gemini-2.5-flash-lite:generateContent';

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

/**
 * Build the system prompt (in Indonesian) that instructs the AI to return a
 * valid ContentPlan JSON only. Approved_Example structure is provided as
 * few-shot layout inspiration — brand data is deliberately omitted (R8.3).
 */
function buildSystemPrompt(rules: MasterTemplateRules, examples: ApprovedExampleStructure[]): string {
  const allowedBlocks = [...rules.allowedBlocks].join(', ');
  const aspectRatios = [...rules.aspectRatios].join(', ');
  const textLimitsDesc = [...rules.textLimits.entries()]
    .map(([type, max]) => `${type}: maks ${max} karakter`)
    .join('; ');

  const examplesSection =
    examples.length > 0
      ? `\n\nContoh yang disetujui (gunakan HANYA sebagai inspirasi susunan blok dan layoutVariantHint, BUKAN data brand):\n${JSON.stringify(
          examples.map((ex) => ({
            aspectRatio: ex.aspectRatio,
            slides: ex.slides.map((s) => ({ blocks: s.blocks, layoutVariant: s.layoutVariant })),
          })),
          null,
          2,
        )}`
      : '';

  return `Kamu adalah generator rencana konten carousel. Kembalikan HANYA JSON yang valid sesuai skema ContentPlan berikut, tanpa markdown, tanpa penjelasan, tanpa blok kode.

Skema ContentPlan:
{
  "aspectRatio": "${aspectRatios.split(', ')[0]}" (pilih dari: ${aspectRatios}),
  "slides": [
    {
      "index": number (mulai dari 0),
      "layoutVariantHint": string (opsional, dari katalog varian layout),
      "blocks": [
        {
          "type": BlockType (salah satu dari: ${allowedBlocks}),
          "text": string (opsional, untuk heading/body/quote/stat/bullet/cta),
          "chartDataRef": string (WAJIB untuk blok chart; gunakan id ref data yang disediakan user),
          "mockupRef": string (WAJIB untuk blok mockup; gunakan id ref mockup yang disediakan user),
          "imageRef": string (opsional, untuk blok image)
        }
      ]
    }
  ]
}

Aturan keras yang WAJIB dipatuhi:
- Hanya gunakan tipe blok yang diizinkan: ${allowedBlocks}
- Jumlah slide maksimum: ${rules.maxSlides}
- Batas panjang teks per blok: ${textLimitsDesc || '(tidak ada batasan khusus)'}
- Blok chart HARUS memiliki chartDataRef (gunakan id yang disediakan user, JANGAN mengarang nilai data)
- Blok mockup HARUS memiliki mockupRef (gunakan id yang disediakan user, JANGAN mengarang konten)
- Setiap slide harus memiliki setidaknya satu blok
- Nada konten: ${rules.defaultTone}
- JANGAN mengubah warna brand, logo, atau font brand — itu bukan tugasmu
- Approved_Example hanya untuk inspirasi susunan blok dan layoutVariantHint${examplesSection}

Kembalikan HANYA JSON, tanpa markdown, tanpa penjelasan.`;
}

/**
 * Build the user prompt, incorporating slide count constraint, data
 * expectation, and optional repair feedback.
 */
function buildUserPrompt(input: PlannerInput): string {
  const parts: string[] = [];

  // Core prompt
  parts.push(`Prompt: ${input.prompt}`);

  // Slide count constraint (R3.3)
  if (
    input.requestedSlideCount !== undefined &&
    input.requestedSlideCount >= 1 &&
    input.requestedSlideCount <= input.rules.maxSlides
  ) {
    parts.push(`Jumlah slide yang diminta: ${input.requestedSlideCount} (harus persis sebanyak ini)`);
  }

  // Data expectation (R3.4)
  if (input.expectsData) {
    parts.push('Pengguna meminta penyajian data atau angka: sertakan SETIDAKNYA SATU blok chart atau stat.');
  }

  // Repair mode (R4.3)
  if (input.repairOf !== undefined && input.validationErrors && input.validationErrors.length > 0) {
    parts.push(
      `\nPerbaikan diperlukan. Rencana sebelumnya ditolak dengan kesalahan berikut:\n${input.validationErrors.map((e) => `- ${e}`).join('\n')}\n\nSilakan hasilkan Content_Plan yang memperbaiki seluruh kesalahan tersebut.`,
    );
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Error mapping helpers
// ---------------------------------------------------------------------------

/**
 * Extract a string message from an AppError, handling the VALIDATION variant
 * that uses `messages[]` instead of a single `message` string.
 */
function extractErrorMessage(error: import('@leads-generator/shared').AppError): string {
  if (error.code === 'VALIDATION') {
    return error.messages.join(', ');
  }
  return error.message;
}

/**
 * Map an AiCallWrapper error message string to a PlannerError.
 */
function mapWrapperError(message: string): PlannerError {
  switch (message) {
    case 'budget_exceeded':
      return { kind: 'budget_exceeded' };
    case 'endpoint_mismatch':
      return { kind: 'endpoint_mismatch' };
    case 'insecure_transport':
      return { kind: 'insecure_transport' };
    case 'privacy_violation':
      return { kind: 'privacy_violation' };
    case 'timeout':
      return { kind: 'timeout' };
    case 'no_api_key':
      return { kind: 'provider_error', message: 'no_api_key' };
    default:
      return { kind: 'provider_error', message };
  }
}

// ---------------------------------------------------------------------------
// DefaultPlanner
// ---------------------------------------------------------------------------

/**
 * Dependencies injected into {@link DefaultPlanner}.
 */
export interface DefaultPlannerDeps {
  wrapper: AiCallWrapper;
  /** @deprecated Provider endpoints are no longer configured by users. */
  endpointResolver?: any;
  settings: TeamAiSettingsService;
}

/**
 * Default implementation of {@link Planner}.
 *
 * Calls the Gemini text model via the team's configured AI provider endpoint.
 * Uses AiCallWrapper for budget pre-check, audit logging, and API key
 * retrieval. Uses ProviderEndpointResolver to get the configured endpoint
 * (never inferred from API key prefix — R14.1).
 *
 * Requirements: 3.2, 3.3, 3.4, 3.5, 7.3, 8.2, 8.3
 */
export class DefaultPlanner implements Planner {
  constructor(private readonly deps: DefaultPlannerDeps) {}

  async plan(input: PlannerInput, signal: AbortSignal): Promise<Result<ContentPlan, PlannerError>> {
    // -----------------------------------------------------------------------
    // Step 2: Build prompts
    // -----------------------------------------------------------------------
    const systemPrompt = buildSystemPrompt(input.rules, input.examples);
    const userPrompt = buildUserPrompt(input);
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    // -----------------------------------------------------------------------
    // Step 3: Build AI call context
    // -----------------------------------------------------------------------
    let textBaseUrl = '';
    if (this.deps.endpointResolver) {
      const resolveRes = await this.deps.endpointResolver.resolve(input.teamId);
      if (!resolveRes.ok) {
        return err({ kind: 'provider_error', message: resolveRes.error.message });
      }
      textBaseUrl = resolveRes.value.baseUrl;
    } else {
      textBaseUrl = await this.deps.settings.loadApiBaseUrl(input.teamId, 'content_suggestion');
    }

    const settings = await this.deps.settings.getSettings(input.teamId);
    const textModel = settings.textModel || 'gemini-2.5-flash-lite';

    const ctx: AiCallContext = {
      teamId: input.teamId,
      jobId: input.jobId,
      actorId: input.actorId,
      trigger: 'manual',
      callType: 'planner_text',
      apiKeyPurpose: 'content_suggestion',
      endpointUrl: 'dynamic:text-provider',
      dataScope: 'prompt + master_template_rules + approved_examples_structure',
    };

    // -----------------------------------------------------------------------
    // Step 4: Execute AI call via wrapper (budget + audit trail enforced)
    // -----------------------------------------------------------------------
    const wrapperResult = await this.deps.wrapper.execute(ctx, async (apiKey) => {
      const baseUrl = requireProviderBaseUrl(textBaseUrl);
      const providerKind = providerKindFromBaseUrl(baseUrl);

      let response: Response;
      if (providerKind === 'openai_compatible') {
        response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: textModel,
            messages: [{ role: 'user', content: fullPrompt }],
            temperature: 0.7,
          }),
          signal,
        });
      } else {
        // Google official: POST with ?key= query param
        const targetUrl = `${baseUrl}/v1beta/models/${textModel}:generateContent`;
        const callUrl = `${targetUrl}?key=${encodeURIComponent(apiKey)}`;
        response = await fetch(callUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: {
              temperature: 0.7,
              responseMimeType: 'application/json',
            },
          }),
          signal,
        });
      }

      if (!response.ok) {
        const body = await response.text().catch(() => response.statusText);
        throw new Error(`provider_http_${response.status}: ${body}`);
      }

      let text: string | undefined;
      if (providerKind === 'openai_compatible') {
        const data = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        text = data?.choices?.[0]?.message?.content;
      } else {
        // Extract text from Gemini response structure
        const data = (await response.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      }
      if (typeof text !== 'string') {
        throw new Error('provider_empty_response');
      }

      return text;
    });

    // -----------------------------------------------------------------------
    // Step 5: Map wrapper error to PlannerError
    // -----------------------------------------------------------------------
    if (!wrapperResult.ok) {
      const msg = extractErrorMessage(wrapperResult.error);
      return err(mapWrapperError(msg));
    }

    // -----------------------------------------------------------------------
    // Step 6: Parse and validate the returned JSON text
    // -----------------------------------------------------------------------
    const rawText = wrapperResult.value;

    // Strip markdown code fences that some OpenAI-compatible providers
    // wrap around the JSON payload, e.g. ```json\n{...}\n```
    const cleaned = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return err({ kind: 'non_json' });
    }

    const planResult = parseContentPlan(parsed);
    if (!planResult.ok) {
      return err<PlannerError>({ kind: 'non_json' });
    }

    return ok(planResult.value) as Result<ContentPlan, PlannerError>;
  }
}
