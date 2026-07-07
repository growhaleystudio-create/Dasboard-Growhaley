/**
 * llm-executor.ts — LLM execution orchestrator with retry and fallback
 *
 * Extracted from DefaultSduiPlanner.plan()
 * Status: ✅ Full implementation extracted
 */

import type { Result } from '@leads-generator/shared';
import type { SduiPlannerDeps } from '../types.js';
import type { AiCallContext } from '../../ai-call-wrapper.js';
import { requireProviderBaseUrl, providerKindFromBaseUrl } from '../../provider-key-routing.js';

export interface LlmExecutorContext {
  teamId: string;
  jobId: string;
  actorId: string;
  textModel: string;
  textBaseUrl: string;
  signal: AbortSignal;
  deps: SduiPlannerDeps;
}

/**
 * Executes LLM request with provider fallback and error handling.
 * Returns Result<string> with AppError - caller should map to SduiPlannerError.
 */
export async function executeLlmRequest(
  promptText: string,
  ctx: LlmExecutorContext,
): Promise<Result<string>> {
  const aiCtx: AiCallContext = {
    teamId: ctx.teamId,
    jobId: ctx.jobId,
    actorId: ctx.actorId,
    trigger: 'manual',
    callType: 'planner_text',
    apiKeyPurpose: 'content_suggestion',
    endpointUrl: 'dynamic:text-provider',
    dataScope: 'prompt + brand_kit_theme (sdui)',
  };

  return ctx.deps.wrapper.execute(aiCtx, async (apiKey) => {
    const baseUrl = requireProviderBaseUrl(ctx.textBaseUrl);
    const providerKind = providerKindFromBaseUrl(baseUrl);
    let response: Response;

    if (providerKind === 'openai_compatible') {
      response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: ctx.textModel,
          messages: [{ role: 'user', content: promptText }],
          temperature: 0.9,
          top_p: 0.95,
          response_format: { type: 'json_object' },
        }),
        signal: ctx.signal,
      });
    } else {
      const targetUrl = `${baseUrl}/v1beta/models/${ctx.textModel}:generateContent`;
      response = await fetch(targetUrl, {
        method: 'POST',
        // Key in header, never the URL query (avoids proxy/CDN log leaks).
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { temperature: 0.9, topP: 0.95, responseMimeType: 'application/json' },
        }),
        signal: ctx.signal,
      });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => response.statusText);
      throw new Error(`provider_http_${response.status}: ${body}`);
    }

    let text: string | undefined;
    if (providerKind === 'openai_compatible') {
      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      text = data?.choices?.[0]?.message?.content;
    } else {
      const data = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    if (typeof text !== 'string') throw new Error('provider_empty_response');
    return text;
  });
}
