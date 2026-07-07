import type { SurveyAiAnalysisResult, SurveyAnalysis } from '@leads-generator/shared';
import { providerKindFromBaseUrl, requireProviderBaseUrl } from '../content/provider-key-routing.js';
import type { TeamAiSettingsService } from '../auth/team-ai-settings-service.js';

export interface SurveyAnalysisAiContext {
  teamId: string;
  survey: {
    title: string;
    description?: string;
    projectGoal: string;
    backgroundContext?: string;
    targetParticipant?: string;
    primaryDecision?: string;
  };
  questions: Array<{
    id: string;
    key: string;
    type: string;
    title: string;
    required: boolean;
    config: unknown;
  }>;
  analytics: unknown;
  openEndedSamples: string[];
  analysis: SurveyAnalysis;
}

interface SurveyAnalysisAiOutput {
  summary: string;
  key_findings: string[];
  recommendations: string[];
  respondent_insights?: string[];
  question_insight?: string;
}

function isOutput(value: unknown): value is SurveyAnalysisAiOutput {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.summary === 'string' &&
    Array.isArray(candidate.key_findings) &&
    candidate.key_findings.every((item) => typeof item === 'string') &&
    Array.isArray(candidate.recommendations) &&
    candidate.recommendations.every((item) => typeof item === 'string') &&
    (candidate.respondent_insights === undefined ||
      (Array.isArray(candidate.respondent_insights) &&
        candidate.respondent_insights.every((item) => typeof item === 'string'))) &&
    (candidate.question_insight === undefined || typeof candidate.question_insight === 'string')
  );
}

function buildPrompt(context: SurveyAnalysisAiContext): string {
  return `Anda adalah AI research assistant untuk analisis hasil survey kuantitatif. Tugas Anda adalah membuat interpretasi level-assistant, BUKAN mengubah data mentah, BUKAN mengklaim kepastian absolut.

Keluarkan HANYA JSON valid tanpa markdown dengan shape:
{
  "summary": "string",
  "key_findings": ["string"],
  "recommendations": ["string"],
  "respondent_insights": ["string"],
  "question_insight": "string optional"
}

Aturan:
- Gunakan Bahasa Indonesia.
- Ringkas, spesifik, dan berorientasi keputusan.
- Jangan mengarang data di luar input.
- Jika evidence terbatas, katakan secara hati-hati.
- Minimal 3 key findings bila memungkinkan.
- Minimal 2 recommendations.
- Jika scope adalah question dan ada insight khusus, isi question_insight.

Context analisis:
${JSON.stringify(context, null, 2)}`;
}

function toResult(output: SurveyAnalysisAiOutput): SurveyAiAnalysisResult {
  return {
    summary: output.summary,
    keyFindings: output.key_findings,
    recommendations: output.recommendations,
    ...(output.respondent_insights ? { respondentInsights: output.respondent_insights } : {}),
    ...(output.question_insight ? { questionInsight: output.question_insight } : {}),
    generatedAt: new Date().toISOString(),
  };
}

export async function generateSurveyAnalysisWithProvider(
  settings: TeamAiSettingsService,
  context: SurveyAnalysisAiContext,
): Promise<SurveyAiAnalysisResult> {
  const apiKey = await settings.loadApiKey(context.teamId, 'content_suggestion');
  if (!apiKey) {
    throw new Error('no_api_key');
  }
  const baseUrl = requireProviderBaseUrl(
    await settings.loadApiBaseUrl(context.teamId, 'content_suggestion'),
  );
  const model = (await settings.getSettings(context.teamId)).textModel || 'gemini-2.5-flash-lite';
  const providerKind = providerKindFromBaseUrl(baseUrl);
  const prompt = buildPrompt(context);

  const url =
    providerKind === 'openai_compatible'
      ? `${baseUrl}/v1/chat/completions`
      : `${baseUrl}/v1beta/models/${model}:generateContent`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (providerKind === 'openai_compatible') {
    headers.Authorization = `Bearer ${apiKey}`;
  } else {
    // Google GenAI: key in header, never the URL query (avoids log leaks).
    headers['x-goog-api-key'] = apiKey;
  }

  const body =
    providerKind === 'openai_compatible'
      ? {
          model,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        }
      : {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`provider_error:${response.status}`);
  }

  const data = (await response.json()) as any;
  const text =
    providerKind === 'openai_compatible'
      ? data?.choices?.[0]?.message?.content ?? null
      : data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text ?? '').join('') ?? null;

  if (!text || typeof text !== 'string') {
    throw new Error('malformed_output');
  }

  const parsed = JSON.parse(text) as unknown;
  if (!isOutput(parsed)) {
    throw new Error('malformed_output');
  }

  return toResult(parsed);
}
