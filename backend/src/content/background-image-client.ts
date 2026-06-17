/**
 * BackgroundImageClient — calls the AI image model to generate a Background_Image.
 *
 * Enforces the full pre-call pipeline mandated by the spec:
 *   1. Resolve AI provider endpoint via ProviderEndpointResolver (R14).
 *   2. Validate referenceImageUrl (Opsi B) with UrlSafetyGuard before any call (R15.1).
 *   3. Build a background-only prompt: "abstract background art, no text, no logo, no faces".
 *   4. Execute via AiCallWrapper (budget precheck + api-key + audit, R13).
 *   5. Parse the Imagen API response: base64 → Buffer.
 *
 * The implementation targets Google Imagen 3 (imagen-3.0-generate-002) by default.
 * Third-party proxy endpoints that follow the same Predict API shape also work,
 * as the endpoint is sourced exclusively from ProviderEndpointResolver (R14.1).
 *
 * Design: Components and Interfaces → BackgroundImageClient; Strategi Kesetiaan Brand Hibrida
 * Requirements: 5.4, 7.5
 */

import { err, ok, type Result } from '@leads-generator/shared';
import type { AspectRatio } from '@leads-generator/shared';

import type { AiCallWrapper, AiCallContext } from './ai-call-wrapper.js';
import { providerKindFromBaseUrl, requireProviderBaseUrl } from './provider-key-routing.js';
import type { UrlSafetyGuardImpl } from './url-safety-guard.js';
import type { TeamAiSettingsService } from '../auth/team-ai-settings-service.js';
import { generateMiravaImage } from './mirava-image-client.js';

// ---------------------------------------------------------------------------
// Public types (mirror the design contract)
// ---------------------------------------------------------------------------

export interface BackgroundRequest {
  /** The user-intended visual theme; must NOT contain text/logo instructions (added here). */
  prompt: string;
  /** Original user prompt, used only to preserve an explicitly requested visual style. */
  stylePrompt?: string;
  aspectRatio: AspectRatio;
  /**
   * Opsi B: a reference image URL for style guidance — validated by UrlSafetyGuard.
   * Only the visual style of the reference is used, never text/logo from it.
   */
  referenceImageUrl?: string;
  /** Brand hex colors used as a palette hint in the prompt and available for solid-color fallback. */
  palette: string[];
  /**
   * 'background' (default) = abstract decorative background, no subject.
   * 'content'    = a relevant, subject-focused editorial illustration for an
   *                image_placeholder block (people/objects allowed).
   */
  kind?: 'background' | 'content';
}

export interface BackgroundImageClient {
  /**
   * Generate a Background_Image for one slide.
   *
   * Returns `ok(Buffer)` with PNG bytes, or `err(AppError)` on failure.
   * The Buffer must be scanned by BackgroundScanner before compositing (R5.5).
   */
  generate(teamId: string, req: BackgroundRequest, signal: AbortSignal): Promise<Result<Buffer>>;
}

// ---------------------------------------------------------------------------
// Imagen API response shape
// ---------------------------------------------------------------------------

/** Minimal type for the Imagen 3 predict response body. */
interface ImagenPredictResponse {
  predictions?: { bytesBase64Encoded?: string }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps AspectRatio union to the string format Imagen API accepts. */
const ASPECT_RATIO_MAP: Record<AspectRatio, string> = {
  '1:1': '1:1',
  '4:5': '4:5',
  '9:16': '9:16',
};

const REFERENCE_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function compactPrompt(value: string | undefined, maxLength: number): string | undefined {
  const compact = value?.replace(/\s+/g, ' ').trim();
  if (!compact) return undefined;
  return compact.slice(0, maxLength);
}

function requestsTransparentBackground(...prompts: Array<string | undefined>): boolean {
  return prompts.some((prompt) =>
    /\b(transparent|transparan|no background|tanpa background|remove background|cutout|sticker|isolated)\b/i.test(prompt ?? ''),
  );
}

function buildContentStyleHint(userPrompt: string, stylePrompt: string | undefined): string {
  const explicitStyle = compactPrompt(stylePrompt, 360);
  const styleHint = explicitStyle
    ? ` Follow the user's requested image style when present; it overrides any generic style words in the subject description: "${explicitStyle}".`
    : '';
  const fallbackHint =
    explicitStyle
      ? ''
      : ` If the user did not request a specific visual style, use a clean professional editorial illustration style.`;
  const doodleHint = /\b(doodle|hand[-\s]?drawn|sketch|line art|marker drawing)\b/i.test(
    `${userPrompt} ${stylePrompt ?? ''}`,
  )
    ? ` Render the image as a true hand-drawn doodle: loose black ink sketch lines, simple playful shapes, minimal flat color accents, white or transparent-feeling negative space. Avoid photorealism, 3D render, stock photo, polished corporate vector art, and generic editorial illustration.`
    : '';
  const transparencyHint = requestsTransparentBackground(userPrompt, stylePrompt)
    ? ` Use a transparent/no-background cutout composition if supported; keep the subject isolated with alpha transparency.`
    : '';

  return styleHint + fallbackHint + doodleHint + transparencyHint;
}

/**
 * Builds the background-only prompt by injecting explicit guards against
 * text, logos, and human faces, regardless of what the caller's prompt says.
 * Also hints at the brand palette.
 */
function buildBackgroundPrompt(
  userPrompt: string,
  palette: string[],
  referenceDescription?: string,
  kind: 'background' | 'content' = 'background',
  stylePrompt?: string,
): string {
  const paletteHint =
    palette.length > 0
      ? ` Color palette inspired by these brand colors: ${palette.slice(0, 5).join(', ')}.`
      : '';

  const referenceHint = referenceDescription
    ? ` Reference style: ${referenceDescription}.`
    : '';

  if (kind === 'content') {
    // Subject-focused editorial illustration for an image_placeholder.
    // Style stays anchored to the original user request when they specify one.
    return (
      `${userPrompt}.` +
      buildContentStyleHint(userPrompt, stylePrompt) +
      ` Keep the image clean, professional, high quality, and useful as a content visual.` +
      ` No text, no words, no letters, no numbers, no captions, no watermark, no logo, no UI mockup chrome.` +
      paletteHint +
      referenceHint
    );
  }

  return (
    `Abstract background art only. ${userPrompt}.` +
    ` No text, no letters, no numbers, no logos, no icons, no symbols, no brand marks,` +
    ` no human faces, no people. Pure background visual only.` +
    paletteHint +
    referenceHint
  );
}

// ---------------------------------------------------------------------------
// DefaultBackgroundImageClient
// ---------------------------------------------------------------------------

export interface BackgroundImageClientDeps {
  wrapper: AiCallWrapper;
  /** @deprecated Provider endpoints are no longer configured by users. */
  endpointResolver?: any;
  urlGuard: UrlSafetyGuardImpl;
  settings: TeamAiSettingsService;
}

export class DefaultBackgroundImageClient implements BackgroundImageClient {
  constructor(private readonly deps: BackgroundImageClientDeps) {}

  async generate(
    teamId: string,
    req: BackgroundRequest,
    signal: AbortSignal,
  ): Promise<Result<Buffer>> {
    if (this.deps.endpointResolver) {
      const resolveRes = await this.deps.endpointResolver.resolve(teamId);
      if (!resolveRes.ok) {
        return err(resolveRes.error);
      }
    }

    // -----------------------------------------------------------------------
    // Step 2: Validate reference image URL (Opsi B) with SSRF guard (R15.1)
    // -----------------------------------------------------------------------
    let referenceDescription: string | undefined;

    if (req.referenceImageUrl) {
      const safeResult = await this.deps.urlGuard.fetchSafely(req.referenceImageUrl, {
        maxBytes: REFERENCE_IMAGE_MAX_BYTES,
        allow: ['image/'],
        timeoutMs: 10_000,
      });
      if (!safeResult.ok) {
        // Propagate the SSRF / validation failure with a clear message.
        const errorMsg =
          safeResult.error.code === 'VALIDATION'
            ? (safeResult.error.messages[0] ?? 'unknown error')
            : safeResult.error.message;
        return err({
          code: 'VALIDATION',
          messages: [`Reference image URL is not safe: ${errorMsg}`],
        });
      }
      // Use the content-type as a brief reference description for the prompt.
      referenceDescription = `style from reference image (${safeResult.value.contentType})`;
    }

    // -----------------------------------------------------------------------
    // Step 3: Build background-only prompt
    // -----------------------------------------------------------------------
    const finalPrompt = buildBackgroundPrompt(
      req.prompt,
      req.palette,
      referenceDescription,
      req.kind ?? 'background',
      req.stylePrompt,
    );
    const imageBaseUrl = await this.deps.settings.loadApiBaseUrl(teamId, 'image_generation');

    // -----------------------------------------------------------------------
    // Step 5: Execute via AiCallWrapper (budget + audit, R13)
    // -----------------------------------------------------------------------
    const ctx: AiCallContext = {
      teamId,
      jobId: 'background_image_generate',
      actorId: 'system',
      trigger: 'manual',
      callType: 'background_image',
      apiKeyPurpose: 'image_generation',
      endpointUrl: 'dynamic:image-provider',
      dataScope:
        'background prompt (no personal data, no lead data, brand palette hint only)',
    };

    const imagenAspectRatio = ASPECT_RATIO_MAP[req.aspectRatio];

    const settings = await this.deps.settings.getSettings(teamId);
    const imageModel = settings.imageModel || 'gpt-image-1';

    const result = await this.deps.wrapper.execute(ctx, async (apiKey) => {
      const baseUrl = requireProviderBaseUrl(imageBaseUrl);
      const providerKind = providerKindFromBaseUrl(baseUrl);

      // Detect mirava.studio → use async polling client
      if (baseUrl.includes('mirava.studio')) {
        return generateMiravaImage(baseUrl, apiKey, imageModel, finalPrompt, req.aspectRatio, signal);
      }

      if (providerKind === 'openai_compatible') {
        return callOpenAiCompatibleImageApi(baseUrl, apiKey, finalPrompt, req.aspectRatio, imageModel, signal);
      }
      const targetBaseUrl = `${baseUrl}/v1beta/models/${imageModel}:predict`;
      return callImagenApi(targetBaseUrl, apiKey, finalPrompt, imagenAspectRatio, signal);
    });

    return result;
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible image API call
// ---------------------------------------------------------------------------

const OPENAI_COMPATIBLE_SIZE_MAP: Record<AspectRatio, string> = {
  '1:1': '1024x1024',
  '4:5': '1024x1280',
  '9:16': '1024x1792',
};

async function callOpenAiCompatibleImageApi(
  baseUrl: string,
  apiKey: string,
  prompt: string,
  aspectRatio: AspectRatio,
  imageModel: string,
  signal: AbortSignal,
): Promise<Buffer> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/images/generations`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: imageModel,
      prompt: `${prompt} (aspect ratio ${aspectRatio})`,
      n: 1,
      size: OPENAI_COMPATIBLE_SIZE_MAP[aspectRatio],
      ...(shouldRequestOpenAiImageResponseFormat(imageModel) ? { response_format: 'b64_json' } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(`openai_compatible_image_api_${response.status}: ${errorText}`);
  }

  const json = (await response.json()) as { data?: { b64_json?: string; url?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, 'base64');

  // Some proxies return a URL instead of base64
  const imageUrl = json.data?.[0]?.url;
  if (imageUrl) {
    const imgResp = await fetch(imageUrl, { signal });
    if (imgResp.ok) return Buffer.from(await imgResp.arrayBuffer());
  }

  throw new Error('openai_compatible_image_api_empty_response');
}

function shouldRequestOpenAiImageResponseFormat(imageModel: string): boolean {
  return !imageModel.trim().toLowerCase().startsWith('gpt-image');
}

// ---------------------------------------------------------------------------
// Imagen API call
// ---------------------------------------------------------------------------

/**
 * Calls the Imagen 3 Predict API and returns the first generated image as a Buffer.
 *
 * POST `${baseUrl}?key=${apiKey}`
 * Body: { instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio, personGeneration } }
 * Response: { predictions: [{ bytesBase64Encoded: "..." }] }
 */
async function callImagenApi(
  baseUrl: string,
  apiKey: string,
  prompt: string,
  aspectRatio: string,
  signal: AbortSignal,
): Promise<Buffer> {
  const url = `${baseUrl}?key=${encodeURIComponent(apiKey)}`;

  const body = JSON.stringify({
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio,
      personGeneration: 'dont_allow',
    },
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(`Imagen API error ${response.status}: ${errorText}`);
  }

  const json = (await response.json()) as ImagenPredictResponse;
  const base64 = json.predictions?.[0]?.bytesBase64Encoded;

  if (!base64) {
    throw new Error('Imagen API returned no image data in predictions[0].bytesBase64Encoded');
  }

  return Buffer.from(base64, 'base64');
}
