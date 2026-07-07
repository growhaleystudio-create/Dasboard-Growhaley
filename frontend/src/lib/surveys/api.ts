import { fetchApi } from '@/lib/api';
import type {
  CreateSurveyInput,
  PublicSurveyResponse,
  ReplaceSurveyQuestionsInput,
  SubmitSurveyResponseInput,
  SurveyAnalysisDetail,
  SurveyAnalysisItem,
  SurveyAnalyticsSummary,
  SurveyDetailResponse,
  SurveyListItem,
  SurveyQuestion,
  SurveyResponseItem,
  TriggerSurveyAnalysisInput,
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export function listSurveys(teamId: string) {
  return fetchApi<SurveyListItem[]>(`/api/teams/${teamId}/surveys`);
}

export function createSurvey(teamId: string, input: CreateSurveyInput) {
  return fetchApi<SurveyListItem>(`/api/teams/${teamId}/surveys`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getSurvey(teamId: string, surveyId: string) {
  return fetchApi<SurveyDetailResponse>(`/api/teams/${teamId}/surveys/${surveyId}`);
}

export function replaceSurveyQuestions(
  teamId: string,
  surveyId: string,
  input: ReplaceSurveyQuestionsInput,
) {
  return fetchApi<SurveyQuestion[]>(`/api/teams/${teamId}/surveys/${surveyId}/questions`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function listSurveyResponses(teamId: string, surveyId: string) {
  return fetchApi<SurveyResponseItem[]>(`/api/teams/${teamId}/surveys/${surveyId}/responses`);
}

export function getSurveyAnalytics(teamId: string, surveyId: string) {
  return fetchApi<SurveyAnalyticsSummary>(`/api/teams/${teamId}/surveys/${surveyId}/analytics`);
}

export async function downloadSurveyExport(
  teamId: string,
  surveyId: string,
  format: 'json' | 'csv',
) {
  const response = await fetch(
    `${API_URL}/api/teams/${teamId}/surveys/${surveyId}/export/${format}`,
    {
      method: 'GET',
      credentials: 'include',
    },
  );

  if (!response.ok) {
    const fallback = `Failed to export survey as ${format.toUpperCase()}`;
    try {
      const payload = (await response.json()) as { message?: string; messages?: string[] };
      throw new Error(payload.message ?? payload.messages?.join(', ') ?? fallback);
    } catch {
      throw new Error(fallback);
    }
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const fileNameMatch = /filename="([^"]+)"/i.exec(disposition);
  const fileName = fileNameMatch?.[1] ?? `survey-export.${format}`;

  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);

  return fileName;
}

export function publishSurvey(teamId: string, surveyId: string) {
  return fetchApi<SurveyListItem>(`/api/teams/${teamId}/surveys/${surveyId}/publish`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function unpublishSurvey(teamId: string, surveyId: string) {
  return fetchApi<SurveyListItem>(`/api/teams/${teamId}/surveys/${surveyId}/unpublish`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function closeSurvey(teamId: string, surveyId: string) {
  return fetchApi<SurveyListItem>(`/api/teams/${teamId}/surveys/${surveyId}/close`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function buildSurveyPublicPath(slug: string) {
  return `/surveys/${slug}`;
}

export function listSurveyAnalyses(teamId: string, surveyId: string) {
  return fetchApi<SurveyAnalysisItem[]>(`/api/teams/${teamId}/surveys/${surveyId}/analysis`);
}

export function getSurveyAnalysis(teamId: string, surveyId: string, analysisId: string) {
  return fetchApi<SurveyAnalysisDetail>(
    `/api/teams/${teamId}/surveys/${surveyId}/analysis/${analysisId}`,
  );
}

export function triggerSurveyAnalysis(
  teamId: string,
  surveyId: string,
  input: TriggerSurveyAnalysisInput,
) {
  return fetchApi<SurveyAnalysisItem>(`/api/teams/${teamId}/surveys/${surveyId}/analysis`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getPublicSurvey(slug: string) {
  return fetchApi<PublicSurveyResponse>(`/api/public/surveys/${slug}`);
}

export function submitPublicSurvey(slug: string, input: SubmitSurveyResponseInput) {
  return fetchApi(`/api/public/surveys/${slug}/responses`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
