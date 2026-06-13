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

// Map our AspectRatio to mirava supported ratios
const RATIO_MAP: Record<AspectRatio, string> = {
  '1:1': '1:1',
  '4:5': '4:5',
  '9:16': '9:16',
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

/** Get the correct quality value for a given model_id. */
function getQuality(modelId: string): string {
  // nano-banana-2, flux-pro-2.0, ideogram-v3.0, lucid-origin, seedream-4.5, recraft-v4
  // use '1K', '2K', '4K' as quality. GPT models use 'low'/'medium'.
  if (modelId.startsWith('gpt-image')) return 'low';
  if (modelId === 'nano-banana-2') return '2K';
  // Default for others (no quality param needed)
  return '1K';
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
  const genRes = await fetch(`${base}/api/public/v1/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model_id: modelId,
      prompt,
      ratio: RATIO_MAP[aspectRatio],
      quality: getQuality(modelId),
      style: 'illustration',
    }),
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
