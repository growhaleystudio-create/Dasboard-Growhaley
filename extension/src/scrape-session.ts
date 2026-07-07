export type CaptureSessionPayload = {
  sessionId: string;
  captureToken: string;
  teamId: string;
  googleMapsUrl: string;
};

export type CaptureItem = {
  name: string;
  address?: string;
  phone?: string;
  website?: string;
};

export type CaptureResponse = {
  status: 'idle' | 'pending' | 'capturing' | 'sent' | 'failed';
  message?: string;
  count?: number;
  summary?: {
    newLeads: number;
    duplicateLeads: number;
  };
};
