/**
 * mirava-image-client.ts — async polling image client for imaginer.mirava.studio.
 *
 * API flow (async, unlike OpenAI):
 *   1. POST /api/public/v1/generate → { generation_id, status: "processing" }
 *   2. Poll GET /api/public/v1/generate/{id} until status = "success" or "failed"
 *   3. Fetch image from urls[0] → return as Buffer
 *
 * Auth: Authorization: Bearer <key>
 * docs: https://docs-imaginer.mirava.studio/api-reference
 */

import type { AspectRatio } from '@leads-generator/shared';

type MiravaRatio = '1:1' | '2:3' | '3:2' | '4:5' | '16:9' | '9:16';

interface MiravaModelCapabilities {
  ratios: readonly MiravaRatio[];
  qualities: readonly string[];
  styles: readonly string[];
}

const DEFAULT_CAPABILITIES: MiravaModelCapabilities = {
  ratios: ['1:1', '4:5', '9:16'],
  qualities: ['1K'],
  styles: [],
};

const MIRAVA_MODEL_CAPABILITIES: Record<string, MiravaModelCapabilities> = {
  'nano-banana-2': {
    ratios: ['1:1', '16:9', '9:16'],
    qualities: ['1K', '2K', '4K'],
    styles: ['anime'],
  },
  'gpt-image-2': {
    ratios: ['1:1', '2:3', '3:2', '16:9', '9:16'],
    qualities: ['low', 'medium'],
    styles: ['dynamic'],
  },
};

const MODEL_RATIO_MAP: Record<string, Partial<Record<AspectRatio, MiravaRatio>>> = {
  'nano-banana-2': {
    '1:1': '1:1',
    '4:5': '9:16',
    '9:16': '9:16',
  },
  'gpt-image-2': {
    '1:1': '1:1',
    '4:5': '2:3',
    '9:16': '9:16',
  },
};

interface GenerateResponse {
  status: string;
  generation_id: string;
  message?: string;
  error?: string;
}

interface StatusResponse {
  generation_id: string;
  status: 'processing' | 'polling' | 'success' | 'failed' | 'cancelled';
  progress?: number;
  urls?: string[];
  error?: string;
}

function getMiravaCapabilities(modelId: string): MiravaModelCapabilities {
  return MIRAVA_MODEL_CAPABILITIES[modelId] ?? DEFAULT_CAPABILITIES;
}

export function getMiravaRatio(modelId: string, aspectRatio: AspectRatio): MiravaRatio {
  const direct = MODEL_RATIO_MAP[modelId]?.[aspectRatio];
  if (direct) return direct;

  const fallback = aspectRatio as MiravaRatio;
  const supported = getMiravaCapabilities(modelId).ratios;
  if (supported.includes(fallback)) return fallback;
  return supported[0] ?? '1:1';
}

/** Get the correct quality value for a given model_id. */
export function getMiravaQuality(modelId: string): string {
  const qualities = getMiravaCapabilities(modelId).qualities;
  if (qualities.includes('2K')) return '2K';
  if (qualities.includes('medium')) return 'medium';
  return qualities[0] ?? '1K';
}

export function getMiravaStyle(modelId: string, prompt: string): string | undefined {
  const lower = prompt.toLowerCase();
  const styles = getMiravaCapabilities(modelId).styles;
  if (modelId === 'gpt-image-2' && styles.includes('dynamic')) return 'dynamic';
  if (lower.includes('anime') && styles.includes('anime')) return 'anime';
  return undefined;
}

/** Generate an image via mirava, poll until done, return PNG Buffer. */
export async function generateMiravaImage(
  baseUrl: string,
  apiKey: string,
  modelId: string,
  prompt: string,
  aspectRatio: AspectRatio,
  signal: AbortSignal,
): Promise<Buffer> {
  const base = baseUrl.replace(/\/+$/, '');

  // Step 1: Submit generation
  const style = getMiravaStyle(modelId, prompt);
  const body: Record<string, unknown> = {
    model_id: modelId,
    prompt,
    ratio: getMiravaRatio(modelId, aspectRatio),
    quality: getMiravaQuality(modelId),
  };
  if (style) body.style = style;

  const genRes = await fetch(`${base}/api/public/v1/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal,
  });

  if (!genRes.ok) {
    const body = await genRes.text().catch(() => `HTTP ${genRes.status}`);
    throw new Error(`mirava_generate_${genRes.status}: ${body.slice(0, 300)}`);
  }

  const genData = (await genRes.json()) as GenerateResponse;
  const generationId = genData.generation_id;
  if (!generationId) throw new Error('mirava_no_generation_id');

  // Step 2: Poll until success (max 90 seconds, poll every 3s)
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    // Wait 3 seconds between polls
    await new Promise<void>((res) => setTimeout(res, 3000));

    const statusRes = await fetch(`${base}/api/public/v1/generate/${generationId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });

    if (!statusRes.ok) {
      const body = await statusRes.text().catch(() => `HTTP ${statusRes.status}`);
      throw new Error(`mirava_poll_${statusRes.status}: ${body.slice(0, 200)}`);
    }

    const statusData = (await statusRes.json()) as StatusResponse;

    if (statusData.status === 'success' && statusData.urls && statusData.urls.length > 0) {
      // Step 3: Fetch the image
      const imgRes = await fetch(statusData.urls[0]!, { signal });
      if (!imgRes.ok) throw new Error(`mirava_fetch_image_${imgRes.status}`);
      return Buffer.from(await imgRes.arrayBuffer());
    }

    if (statusData.status === 'failed' || statusData.status === 'cancelled') {
      throw new Error(`mirava_generation_${statusData.status}: ${statusData.error ?? 'unknown'}`);
    }

    // Still processing/polling — continue
    console.log(`[mirava] ${generationId} progress: ${statusData.progress ?? '?'}%`);
  }

  throw new Error('mirava_timeout: generation did not complete in 90s');
}
