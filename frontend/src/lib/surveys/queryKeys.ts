export const surveyKeys = {
  all: (teamId: string) => ['surveys', teamId] as const,
  list: (teamId: string) => ['surveys', teamId, 'list'] as const,
  detail: (teamId: string, surveyId: string) => ['surveys', teamId, surveyId] as const,
  responses: (teamId: string, surveyId: string) => ['surveys', teamId, surveyId, 'responses'] as const,
  analytics: (teamId: string, surveyId: string) => ['surveys', teamId, surveyId, 'analytics'] as const,
  analysis: (teamId: string, surveyId: string) => ['surveys', teamId, surveyId, 'analysis'] as const,
  public: (slug: string) => ['public-survey', slug] as const,
};
