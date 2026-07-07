/**
 * Guards the API-key leak fix: Google GenAI calls must carry the key in the
 * `x-goog-api-key` HEADER, never in the URL query (`?key=`), so it can't land
 * in proxy/CDN access logs or Referer headers.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { AiTextProviderClient } from '../../src/ai/ai-text-provider-client.js';

const SECRET = 'AIzaSy-secret-key-should-not-appear-in-url';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Google GenAI key transport (leak guard)', () => {
  it('sends the key via x-goog-api-key header, not the URL query', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedHeaders = init.headers as Record<string, string>;
        // Minimal well-formed Gemini response so analyze() doesn't throw before
        // we've captured the request (return value is irrelevant to this test).
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        insight: 'x',
                        starRating: 3,
                        confidenceScore: 0.5,
                        recommendedAngle: 'y',
                      }),
                    },
                  ],
                },
              },
            ],
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
          }),
        } as unknown as Response;
      }),
    );

    const client = new AiTextProviderClient(
      SECRET,
      'https://generativelanguage.googleapis.com',
      'gemini-2.5-flash-lite',
    );
    // Minimal snapshot so buildPrompt() reaches the fetch call.
    await client.analyze({ matchedKeywords: [] } as never).catch(() => undefined);

    expect(capturedUrl).not.toContain('key=');
    expect(capturedUrl).not.toContain(SECRET);
    expect(capturedHeaders['x-goog-api-key']).toBe(SECRET);
  });
});
