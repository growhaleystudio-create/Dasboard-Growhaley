import type { PublicLeadSnapshot, AIUnavailableReason } from '@leads-generator/shared';
import { AiTextProviderClient, type AiProviderResult, AiProviderError } from './ai-text-provider-client.js';

export interface GeminiResult extends AiProviderResult {
  intentScore: number;
}

/**
 * GeminiClient adapter preserving backward-compatibility for lead scoring.
 */
export class GeminiClient {
  private readonly client: AiTextProviderClient;

  constructor(
    apiKey: string,
    apiBaseUrl: string = 'https://generativelanguage.googleapis.com',
    model: string = 'gemini-2.5-flash-lite',
  ) {
    this.client = new AiTextProviderClient(apiKey, apiBaseUrl, model);
  }

  async analyze(snapshot: PublicLeadSnapshot, signal?: AbortSignal): Promise<GeminiResult> {
    try {
      const result = await this.client.analyze(snapshot, signal);
      return {
        ...result,
        intentScore: result.starRating * 20,
      };
    } catch (err: unknown) {
      if (err instanceof AiProviderError) {
        throw new Error(err.reason);
      }
      if (err instanceof Error) {
        throw err;
      }
      throw new Error('provider_error');
    }
  }
}
