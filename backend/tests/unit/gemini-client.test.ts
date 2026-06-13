import { describe, it, expect, vi, afterEach } from 'vitest';
import { GeminiClient } from '../../src/ai/gemini-client.js';
import type { PublicLeadSnapshot } from '@leads-generator/shared';

describe('GeminiClient', () => {
  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  afterEach(() => {
    vi.clearAllMocks();
  });

  const snapshot: PublicLeadSnapshot = {
    source: 'linkedin',
    name: 'Logistik Maju Bersama',
    matchedKeywords: ['test'],
  };

  it('parses lead scoring JSON response and maps stars to intentScore', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        usageMetadata: {
          promptTokenCount: 321,
          candidatesTokenCount: 123,
          totalTokenCount: 444,
        },
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                star_rating: 5,
                primary_reason: 'Perusahaan B2B skala menengah di LinkedIn tetapi tidak memiliki website resmi.',
                pain_points: ['Tidak ada kredibilitas digital untuk skala perusahaan B2B'],
                recommended_angle: 'Hubungi decision maker di LinkedIn, tawarkan pembuatan website company profile B2B profesional.'
              })
            }]
          }
        }]
      })
    });

    const client = new GeminiClient('key');
    const result = await client.analyze(snapshot);
    
    expect(result.intentScore).toBe(100);
    expect(result.starRating).toBe(5);
    expect(result.confidenceScore).toBe(0.8);
    expect(result.recommendedAngle).toBe('Hubungi decision maker di LinkedIn, tawarkan pembuatan website company profile B2B profesional.');
    expect(result.insight).toContain('Rating: 5 bintang');
    expect(result.insight).toContain('Tidak ada kredibilitas digital');
    expect(result.tokenUsage).toEqual({
      promptTokens: 321,
      outputTokens: 123,
      totalTokens: 444,
    });
  });

  it('throws malformed_output if response is not JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: 'This is not JSON'
            }]
          }
        }]
      })
    });

    const client = new GeminiClient('key');
    await expect(client.analyze(snapshot)).rejects.toThrow('malformed_output');
  });

  it('throws quota_exceeded on 429', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
    });

    const client = new GeminiClient('key');
    await expect(client.analyze(snapshot)).rejects.toThrow('quota_exceeded');
  });

  it('throws timeout on AbortError', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

    const client = new GeminiClient('key');
    await expect(client.analyze(snapshot)).rejects.toThrow('timeout');
  });
});
