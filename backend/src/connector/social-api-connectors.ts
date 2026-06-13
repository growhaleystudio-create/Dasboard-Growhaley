import type { ConnectorStatus, NormalizedLead, RawProspect, UsagePolicy } from '@leads-generator/shared';
import { normalizeRawProspect } from './normalize.js';
import type { ScanQuery, Source_Connector } from './source-connector.js';

export class SocialApiConnector implements Source_Connector {
  public readonly usagePolicy: UsagePolicy = {
    allowedRetentionDays: 90,
    disallowFields: [],
  };

  constructor(
    public readonly sourceId: 'threads' | 'linkedin' | 'instagram',
    public readonly displayName: string,
  ) {}

  public async checkAvailability(): Promise<ConnectorStatus> {
    return 'requires_configuration';
  }

  public async fetch(_query: ScanQuery, signal: AbortSignal): Promise<RawProspect[]> {
    if (signal.aborted) throw new Error('aborted');
    return [];
  }

  public normalize(raw: RawProspect, teamId: string): NormalizedLead {
    return normalizeRawProspect(raw, {
      teamId,
      sourceId: this.sourceId,
      usagePolicy: this.usagePolicy,
    });
  }
}
