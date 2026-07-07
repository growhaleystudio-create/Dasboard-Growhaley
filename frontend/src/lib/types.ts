import type { ConnectorDescriptor, Lead, LeadStatus, ScanConfiguration, ScanSummary } from '@leads-generator/shared';

export interface PageResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface TeamMemberResponse {
  id: string;
  email: string;
  role: string;
  status: string;
}

export type LeadListItem = Lead;

export interface MetricsResponse {
  totalLeads: number;
  byStatus: Record<LeadStatus, number>;
  bySource: { sourceId: string; count: number }[];
  conversionRatePercent: number;
}

export interface AiUsageResponse {
  callsUsed?: number;
  used?: number;
  budget: number;
  usagePercent: number;
  remaining: number;
  windowDays: number;
  aiEnabled: boolean;
  hasApiKey: boolean;
  hasApiKeys?: {
    leads: boolean;
    contentSuggestion: boolean;
    imageGeneration: boolean;
  };
  apiBaseUrls?: {
    text: string;
    imageGeneration: string;
  };
  models?: {
    text?: string;
    imageGeneration?: string;
  };
  byOutcome: Record<string, number>;
  tokenUsage?: {
    promptTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export type ScanConfigurationListItem = ScanConfiguration & {
  createdAt?: string;
};

export type ConnectorListItem = ConnectorDescriptor & {
  connected?: boolean;
};

export interface CreateScanResponse {
  configuration: ScanConfiguration;
}

export type GoogleMapsScrapeSessionStatus =
  | 'waiting_browser'
  | 'collecting_results'
  | 'importing'
  | 'done'
  | 'failed';

export interface GoogleMapsScrapeSessionResponse {
  id: string;
  teamId: string;
  keyword: string;
  location?: string;
  status: GoogleMapsScrapeSessionStatus;
  googleMapsUrl: string;
  summary?: ScanSummary;
  error?: string;
  createdAt: string;
  updatedAt: string;
  receivedAt?: string;
  completedAt?: string;
}

export interface CreateGoogleMapsScrapeSessionResponse {
  sessionId: string;
  status: GoogleMapsScrapeSessionStatus;
  googleMapsUrl: string;
  captureToken: string;
  captureUrl: string;
}
