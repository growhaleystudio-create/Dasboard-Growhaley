import type { ConnectorDescriptor, Lead, LeadStatus, ScanConfiguration } from '@leads-generator/shared';

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
