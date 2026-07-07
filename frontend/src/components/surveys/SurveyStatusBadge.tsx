import { Badge } from '@/components/ui/Badge';
import type { SurveyStatus } from '@/lib/surveys/types';

export function SurveyStatusBadge({ status }: { status: SurveyStatus }) {
  if (status === 'published') {
    return (
      <Badge variant="success" showDot>
        Published
      </Badge>
    );
  }

  if (status === 'closed') {
    return (
      <Badge variant="error" showDot>
        Closed
      </Badge>
    );
  }

  return (
    <Badge variant="warning" showDot>
      Draft
    </Badge>
  );
}
