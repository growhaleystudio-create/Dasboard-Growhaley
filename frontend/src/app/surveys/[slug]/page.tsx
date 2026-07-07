import { Suspense } from 'react';
import PublicSurveyPage from './PublicSurveyPage';

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-text-soft-400">Loading survey...</div>}>
      <PublicSurveyPage />
    </Suspense>
  );
}
