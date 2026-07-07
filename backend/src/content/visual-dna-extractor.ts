/**
 * visual-dna-extractor.ts — Vision AI service that reverse-engineers a
 * carousel reference image into its Visual DNA (component sequence + typography
 * scale ratio + layout archetype). Brand colors/fonts are NEVER extracted
 * (FR-2.1).
 *
 * feature-update.md → Modul 2 (Structural Reference Dataset), FR-2.1, FR-2.1.a, FR-2.2.
 */

import type { VisualDna } from '@leads-generator/shared';
import type { AiCallWrapper, AiCallContext } from './ai-call-wrapper.js';
import { providerKindFromBaseUrl, requireProviderBaseUrl } from './provider-key-routing.js';
import type { TeamAiSettingsService } from '../auth/team-ai-settings-service.js';

const GEMINI_VISION_PATH = '/v1beta/models/gemini-2.5-flash-lite:generateContent';

const SYSTEM_PROMPT = `You are a carousel layout analyst. Given an image of a social media carousel slide, extract ONLY the structural information below. Do NOT extract colors, fonts, logos, or brand assets — those are forbidden.

Return ONLY valid JSON (no markdown, no explanation):
{
  "component_sequence": ["header","body","image_placeholder"],
  "header_to_body_ratio": 3.5,
  "layout_archetype": "text_dominant" | "split_screen" | "background_overlay"
}

Rules:
- component_sequence: ordered list of component types present (use only: "header","body","checklist","quote","stat","tag","image_placeholder","button_cta")
- header_to_body_ratio: float ratio of the header font height to the body font height. If no body text, default to 4.0. Range 1.2–5.0.
- layout_archetype: "text_dominant" if slide is mostly text, "split_screen" if text + image side by side or stacked 60/40, "background_overlay" if image fills the full background with text overlay.
- Do NOT include any brand colors, font names, logos, or pixel dimensions.`;

function mapScale(ratio: number): VisualDna['typographyScale'] {
  if (ratio >= 3.5) return 'editorial_bold';
  if (ratio >= 2.0) return 'balanced_classic';
  return 'information_dense';
}

function sanitizeDna(raw: unknown): VisualDna | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const seq = Array.isArray(r.component_sequence)
    ? (r.component_sequence as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const ratio = typeof r.header_to_body_ratio === 'number'
    ? Math.max(1.2, Math.min(5.0, r.header_to_body_ratio))
    : 2.2;
  const archetype: VisualDna['layoutArchetype'] =
    r.layout_archetype === 'split_screen' ? 'split_screen'
    : r.layout_archetype === 'background_overlay' ? 'background_overlay'
    : 'text_dominant';

  return {
    componentSequence: seq.length > 0 ? seq : ['header', 'body'],
    headerToBodyRatio: ratio,
    layoutArchetype: archetype,
    typographyScale: mapScale(ratio),
  };
}

export interface VisualDnaExtractorDeps {
  wrapper: AiCallWrapper;
  settings: TeamAiSettingsService;
}

export class VisualDnaExtractor {
  constructor(private readonly deps: VisualDnaExtractorDeps) {}

  /**
   * Analyze a base64-encoded PNG/JPEG image and return its Visual DNA.
   * @param imageBase64 Raw base64 (no data URI prefix).
   * @param mimeType e.g. "image/png".
   */
  async extract(teamId: string, imageBase64: string, mimeType: string): Promise<VisualDna> {
    const textBaseUrl = await this.deps.settings.loadApiBaseUrl(teamId, 'content_suggestion');
    const settings = await this.deps.settings.getSettings(teamId);
    const textModel = settings.textModel || 'gemini-2.5-flash-lite';

    const ctx: AiCallContext = {
      teamId,
      jobId: 'visual_dna_extract',
      actorId: 'system',
      trigger: 'manual',
      callType: 'planner_text',
      apiKeyPurpose: 'content_suggestion',
      endpointUrl: 'dynamic:text-provider',
      dataScope: 'reference image structure only (no brand data)',
    };

    const wrapperResult = await this.deps.wrapper.execute(ctx, async (apiKey) => {
      const baseUrl = requireProviderBaseUrl(textBaseUrl);
      const providerKind = providerKindFromBaseUrl(baseUrl);
      let response: Response;
      const signal = AbortSignal.timeout(20_000);

      if (providerKind === 'openai_compatible') {
        response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: textModel,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: SYSTEM_PROMPT },
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
              ],
            }],
            temperature: 0.1,
          }),
          signal,
        });
      } else {
        const targetUrl = `${baseUrl}/v1beta/models/${textModel}:generateContent`;
        response = await fetch(targetUrl, {
          method: 'POST',
          // Key in header, never the URL query (avoids proxy/CDN log leaks).
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: SYSTEM_PROMPT },
                { inlineData: { mimeType, data: imageBase64 } },
              ],
            }],
            generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
          }),
          signal,
        });
      }

      if (!response.ok) throw new Error(`vision_api_${response.status}`);

      let text: string | undefined;
      if (providerKind === 'openai_compatible') {
        const d = (await response.json()) as { choices?: { message?: { content?: string } }[] };
        text = d?.choices?.[0]?.message?.content;
      } else {
        const d = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        text = d?.candidates?.[0]?.content?.parts?.[0]?.text;
      }
      if (!text) throw new Error('vision_empty_response');
      return text;
    });

    if (!wrapperResult.ok) {
      return { componentSequence: ['header', 'body'], headerToBodyRatio: 2.2, layoutArchetype: 'text_dominant', typographyScale: 'balanced_classic' };
    }

    const cleaned = wrapperResult.value.trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
      const dna = sanitizeDna(JSON.parse(cleaned));
      if (dna) return dna;
    } catch { /* fallthrough */ }

    return { componentSequence: ['header', 'body'], headerToBodyRatio: 2.2, layoutArchetype: 'text_dominant', typographyScale: 'balanced_classic' };
  }
}
