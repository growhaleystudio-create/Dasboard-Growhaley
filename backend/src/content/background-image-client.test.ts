/**
 * Unit tests for DefaultBackgroundImageClient (task 15.1)
 *
 * Verifies:
 *   1. Endpoint is resolved from ProviderEndpointResolver, not inferred (R14.1).
 *   2. referenceImageUrl (Opsi B) is validated via UrlSafetyGuard before call (R15.1).
 *   3. The built prompt contains background-only guardrails ("no text", "no logo").
 *   4. The AiCallWrapper.execute is called with the correct callType='background_image'.
 *   5. A valid base64-encoded Imagen response is decoded to a Buffer.
 *   6. Endpoint resolution failure short-circuits before calling the wrapper.
 *   7. UrlSafetyGuard failure short-circuits before calling the wrapper.
 *   8. Wrapper errors are propagated unchanged.
 *
 * Requirements: 5.4, 7.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '@leads-generator/shared';

import { DefaultBackgroundImageClient } from './background-image-client.js';
import type { BackgroundImageClientDeps, BackgroundRequest } from './background-image-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides?: Partial<BackgroundImageClientDeps>): BackgroundImageClientDeps {
  const baseUrl = 'https://generativelanguage.googleapis.com';

  const endpointResolver = {
    resolve: vi.fn().mockResolvedValue(
      ok({
        baseUrl,
        assertAllowed: vi.fn().mockReturnValue(ok(undefined)),
      }),
    ),
  } as unknown as BackgroundImageClientDeps['endpointResolver'];

  const urlGuard = {
    fetchSafely: vi.fn().mockResolvedValue(
      ok({ bytes: Buffer.from('fake-image'), contentType: 'image/png' }),
    ),
  } as unknown as BackgroundImageClientDeps['urlGuard'];

  const settings = {
    loadApiKey: vi.fn().mockResolvedValue('fake-api-key'),
    loadApiBaseUrl: vi.fn().mockResolvedValue('https://generativelanguage.googleapis.com'),
    getSettings: vi.fn().mockResolvedValue({
      textModel: 'gemini-2.5-flash-lite',
      imageModel: 'gpt-image-1',
    }),
  } as unknown as BackgroundImageClientDeps['settings'];

  // Mock AiCallWrapper so we can capture the fn it receives, call it with a
  // fake API key, and return a Buffer representing decoded base64 image data.
  const wrapper = {
    execute: vi.fn().mockImplementation(
      async (_ctx: unknown, fn: (apiKey: string) => Promise<Buffer>) => {
        try {
          const buf = await fn('fake-api-key');
          return ok(buf);
        } catch (e) {
          return err({ code: 'INTERNAL', message: String(e) });
        }
      },
    ),
  } as unknown as BackgroundImageClientDeps['wrapper'];

  return { endpointResolver, urlGuard, settings, wrapper, ...overrides };
}

function makeRequest(overrides?: Partial<BackgroundRequest>): BackgroundRequest {
  return {
    prompt: 'Abstract geometric patterns',
    aspectRatio: '1:1',
    palette: ['#FF5733', '#1A1A2E'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultBackgroundImageClient', () => {
  let signal: AbortSignal;

  beforeEach(() => {
    signal = new AbortController().signal;
    // Suppress actual fetch calls — not needed in unit tests.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          predictions: [{ bytesBase64Encoded: Buffer.from('fake-png').toString('base64') }],
        }),
      }),
    );
  });

  it('calls endpointResolver.resolve with the correct teamId', async () => {
    const deps = makeDeps();
    const client = new DefaultBackgroundImageClient(deps);

    await client.generate('team-1', makeRequest(), signal);

    expect(deps.endpointResolver.resolve).toHaveBeenCalledWith('team-1');
  });

  it('returns err when endpoint resolver fails', async () => {
    const deps = makeDeps({
      endpointResolver: {
        resolve: vi.fn().mockResolvedValue(
          err({ code: 'INTERNAL', message: 'endpoint_mismatch' }),
        ),
      } as unknown as BackgroundImageClientDeps['endpointResolver'],
    });
    const client = new DefaultBackgroundImageClient(deps);

    const result = await client.generate('team-1', makeRequest(), signal);

    expect(result.ok).toBe(false);
    expect(deps.wrapper.execute).not.toHaveBeenCalled();
  });

  it('validates referenceImageUrl via UrlSafetyGuard when provided', async () => {
    const deps = makeDeps();
    const client = new DefaultBackgroundImageClient(deps);

    await client.generate(
      'team-1',
      makeRequest({ referenceImageUrl: 'https://example.com/style.jpg' }),
      signal,
    );

    expect(deps.urlGuard.fetchSafely).toHaveBeenCalledWith(
      'https://example.com/style.jpg',
      expect.objectContaining({
        maxBytes: 5 * 1024 * 1024,
        allow: ['image/'],
        timeoutMs: 10_000,
      }),
    );
  });

  it('does NOT call UrlSafetyGuard when no referenceImageUrl supplied', async () => {
    const deps = makeDeps();
    const client = new DefaultBackgroundImageClient(deps);

    // Omit referenceImageUrl entirely (exactOptionalPropertyTypes: true)
    await client.generate('team-1', makeRequest(), signal);

    expect(deps.urlGuard.fetchSafely).not.toHaveBeenCalled();
  });

  it('returns err and skips AI call when UrlSafetyGuard rejects the reference URL', async () => {
    const deps = makeDeps({
      urlGuard: {
        fetchSafely: vi.fn().mockResolvedValue(
          err({ code: 'VALIDATION', messages: ['URL resolves to a private IP address'] }),
        ),
      } as unknown as BackgroundImageClientDeps['urlGuard'],
    });
    const client = new DefaultBackgroundImageClient(deps);

    const result = await client.generate(
      'team-1',
      makeRequest({ referenceImageUrl: 'https://192.168.1.1/img.png' }),
      signal,
    );

    expect(result.ok).toBe(false);
    expect(deps.wrapper.execute).not.toHaveBeenCalled();
  });

  it('passes callType=background_image to AiCallWrapper', async () => {
    const deps = makeDeps();
    const client = new DefaultBackgroundImageClient(deps);

    await client.generate('team-1', makeRequest(), signal);

    expect(deps.wrapper.execute).toHaveBeenCalledWith(
      expect.objectContaining({ callType: 'background_image' }),
      expect.any(Function),
    );
  });

  it('passes teamId to AiCallWrapper context', async () => {
    const deps = makeDeps();
    const client = new DefaultBackgroundImageClient(deps);

    await client.generate('team-xyz', makeRequest(), signal);

    expect(deps.wrapper.execute).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'team-xyz' }),
      expect.any(Function),
    );
  });

  it('returns ok(Buffer) with the decoded image on a successful Imagen call', async () => {
    const imageBytes = Buffer.from('fake-png-data');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          predictions: [
            { bytesBase64Encoded: imageBytes.toString('base64') },
          ],
        }),
      }),
    );

    const deps = makeDeps();
    const client = new DefaultBackgroundImageClient(deps);

    const result = await client.generate('team-1', makeRequest(), signal);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(Buffer);
      expect(result.value.equals(imageBytes)).toBe(true);
    }
  });

  it('returns err when Imagen API returns no predictions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ predictions: [] }),
      }),
    );

    const deps = makeDeps();
    const client = new DefaultBackgroundImageClient(deps);

    const result = await client.generate('team-1', makeRequest(), signal);

    // AiCallWrapper captures the thrown error and returns err
    expect(result.ok).toBe(false);
  });

  it('does not send response_format for GPT image models', async () => {
    const capturedBodies: unknown[] = [];
    const imageBytes = Buffer.from('fake-openai-png');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.body) capturedBodies.push(JSON.parse(init.body as string));
        return {
          ok: true,
          json: async () => ({
            data: [{ b64_json: imageBytes.toString('base64') }],
          }),
        };
      }),
    );

    const deps = makeDeps({
      settings: {
        loadApiKey: vi.fn().mockResolvedValue('fake-api-key'),
        loadApiBaseUrl: vi.fn().mockResolvedValue('https://api.afterinput.com'),
        getSettings: vi.fn().mockResolvedValue({
          textModel: 'gemini-2.5-flash-lite',
          imageModel: 'gpt-image-2',
        }),
      } as unknown as BackgroundImageClientDeps['settings'],
    });
    const client = new DefaultBackgroundImageClient(deps);

    const result = await client.generate('team-1', makeRequest(), signal);

    expect(result.ok).toBe(true);
    const body = capturedBodies[0] as Record<string, unknown>;
    expect(body.model).toBe('gpt-image-2');
    expect(body).not.toHaveProperty('response_format');
  });

  it('keeps response_format for legacy OpenAI image models', async () => {
    const capturedBodies: unknown[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.body) capturedBodies.push(JSON.parse(init.body as string));
        return {
          ok: true,
          json: async () => ({
            data: [{ b64_json: Buffer.from('legacy-image').toString('base64') }],
          }),
        };
      }),
    );

    const deps = makeDeps({
      settings: {
        loadApiKey: vi.fn().mockResolvedValue('fake-api-key'),
        loadApiBaseUrl: vi.fn().mockResolvedValue('https://api.openai.com'),
        getSettings: vi.fn().mockResolvedValue({
          textModel: 'gemini-2.5-flash-lite',
          imageModel: 'dall-e-3',
        }),
      } as unknown as BackgroundImageClientDeps['settings'],
    });
    const client = new DefaultBackgroundImageClient(deps);

    const result = await client.generate('team-1', makeRequest(), signal);

    expect(result.ok).toBe(true);
    const body = capturedBodies[0] as Record<string, unknown>;
    expect(body.model).toBe('dall-e-3');
    expect(body.response_format).toBe('b64_json');
  });

  it('propagates wrapper err unchanged', async () => {
    const deps = makeDeps({
      wrapper: {
        execute: vi.fn().mockResolvedValue(
          err({ code: 'INTERNAL', message: 'budget_exceeded' }),
        ),
      } as unknown as BackgroundImageClientDeps['wrapper'],
    });
    const client = new DefaultBackgroundImageClient(deps);

    const result = await client.generate('team-1', makeRequest(), signal);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const error = result.error;
      const msg = error.code === 'INTERNAL' ? error.message : '';
      expect(msg).toBe('budget_exceeded');
    }
  });

  it('includes palette hint in the prompt sent to the AI model', async () => {
    const capturedPrompts: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.body) {
          const body = JSON.parse(init.body as string) as {
            instances: { prompt: string }[];
          };
          capturedPrompts.push(body.instances[0]?.prompt ?? '');
        }
        return {
          ok: true,
          json: async () => ({
            predictions: [
              {
                bytesBase64Encoded: Buffer.from('x').toString('base64'),
              },
            ],
          }),
        };
      }),
    );

    const deps = makeDeps();
    const client = new DefaultBackgroundImageClient(deps);

    await client.generate(
      'team-1',
      makeRequest({ palette: ['#FF5733', '#1A1A2E'] }),
      signal,
    );

    const prompt = capturedPrompts[0] ?? '';
    expect(prompt.toLowerCase()).toContain('no text');
    expect(prompt.toLowerCase()).toContain('no logo');
    expect(prompt).toContain('#FF5733');
  });

  it('preserves explicit user image style for content placeholders', async () => {
    const capturedPrompts: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.body) {
          const body = JSON.parse(init.body as string) as {
            instances: { prompt: string }[];
          };
          capturedPrompts.push(body.instances[0]?.prompt ?? '');
        }
        return {
          ok: true,
          json: async () => ({
            predictions: [
              {
                bytesBase64Encoded: Buffer.from('x').toString('base64'),
              },
            ],
          }),
        };
      }),
    );

    const deps = makeDeps();
    const client = new DefaultBackgroundImageClient(deps);

    await client.generate(
      'team-1',
      makeRequest({
        kind: 'content',
        prompt: 'isolated safety visual',
        stylePrompt: 'buat gambar watercolor sticker tanpa background transparan',
      }),
      signal,
    );

    const prompt = capturedPrompts[0] ?? '';
    expect(prompt).toContain('watercolor sticker');
    expect(prompt.toLowerCase()).toContain('transparent/no-background');
    expect(prompt).not.toContain('flat vector / soft 3D render style');
    expect(prompt.toLowerCase()).toContain('no text');
  });

  it('strengthens doodle prompts so they do not fall back to generic illustration', async () => {
    const capturedPrompts: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.body) {
          const body = JSON.parse(init.body as string) as {
            instances: { prompt: string }[];
          };
          capturedPrompts.push(body.instances[0]?.prompt ?? '');
        }
        return {
          ok: true,
          json: async () => ({
            predictions: [
              {
                bytesBase64Encoded: Buffer.from('x').toString('base64'),
              },
            ],
          }),
        };
      }),
    );

    const deps = makeDeps();
    const client = new DefaultBackgroundImageClient(deps);

    await client.generate(
      'team-1',
      makeRequest({
        kind: 'content',
        prompt: 'A doodle illustration about relationship repair',
        stylePrompt: 'doodle',
      }),
      signal,
    );

    const prompt = capturedPrompts[0] ?? '';
    expect(prompt).toContain('true hand-drawn doodle');
    expect(prompt).toContain('loose black ink sketch lines');
    expect(prompt).toContain('Avoid photorealism');
    expect(prompt).not.toContain('If the user did not request a specific visual style');
  });

  it('sets personGeneration=dont_allow in the Imagen request body', async () => {
    const capturedBodies: unknown[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.body) {
          capturedBodies.push(JSON.parse(init.body as string));
        }
        return {
          ok: true,
          json: async () => ({
            predictions: [
              { bytesBase64Encoded: Buffer.from('x').toString('base64') },
            ],
          }),
        };
      }),
    );

    const deps = makeDeps();
    const client = new DefaultBackgroundImageClient(deps);

    await client.generate('team-1', makeRequest(), signal);

    const body = capturedBodies[0] as {
      parameters?: { personGeneration?: string };
    };
    expect(body?.parameters?.personGeneration).toBe('dont_allow');
  });
});
