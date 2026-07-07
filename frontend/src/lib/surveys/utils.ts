import { AppError } from '@/lib/api';

export function getSurveyErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AppError) {
    return error.rawMessage || fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
}

export function buildSurveyAbsolutePublicUrl(slug: string) {
  const path = `/surveys/${slug}`;
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}
