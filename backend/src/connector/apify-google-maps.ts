import type {
  ConnectorStatus,
  NormalizedLead,
  RawProspect,
  UsagePolicy,
} from '@leads-generator/shared';
import { normalizeRawProspect } from './normalize.js';
import { matchesRequestedLocation } from './location-filter.js';
import type { ScanQuery, Source_Connector } from './source-connector.js';

export class ApifyGoogleMapsConnector implements Source_Connector {
  public readonly sourceId = 'google'; // Override default google search
  public readonly displayName = 'Google Maps (Apify)';
  public readonly usagePolicy: UsagePolicy = {
    allowedRetentionDays: 90,
    disallowFields: [],
  };

  public async checkAvailability(): Promise<ConnectorStatus> {
    if (!process.env.APIFY_TOKEN) {
      return 'requires_configuration';
    }
    return 'available';
  }

  public async fetch(query: ScanQuery, signal: AbortSignal): Promise<RawProspect[]> {
    if (signal.aborted) {
      throw new Error('aborted');
    }

    const token = process.env.APIFY_TOKEN;
    if (!token) {
      throw new Error('Apify API Token is not configured in environment variables.');
    }

    const queryStr = [
      query.keywords.join(' '),
      query.niche,
      query.location
    ].filter(Boolean).join(' ');

    console.log(`[Apify Google Maps] Triggering scraper for: "${queryStr}"`);

    // Synchronous execution: starts the run, waits for finish, returns dataset items
    const url = `https://api.apify.com/v2/acts/nwua9Gu5YrADL7ZDj/run-sync-get-dataset-items?token=${token}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        searchStringsArray: [queryStr],
        maxCrawledPlacesPerSearch: 100,
        // Optional: skip details to make it faster
        skipDetails: true
      }),
      signal
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Apify Actor failed with status ${response.status}: ${errText}`);
    }

    const items = (await response.json()) as Array<{
      title?: string;
      website?: string;
      phone?: string;
      address?: string;
      categoryName?: string;
      url?: string;
      email?: string;
    }>;

    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .filter((item) =>
        matchesRequestedLocation(query.location, [
          item.address,
          item.title,
          item.categoryName,
          item.url,
          item.website,
        ]),
      )
      .map((item) => {
        // Use email if available, otherwise phone number for contact
        const contact = item.email || item.phone || 'No contact info';

        const prospect: RawProspect = {
          name: item.title || 'Unknown Business',
          location: item.address || query.location || 'Unknown',
          matchedKeyword: query.keywords[0] || 'google-maps',
          acquiredAt: new Date(),
        };

        if (item.phone) {
          const digits = item.phone.replace(/\D/g, '');
          if (digits) {
            prospect.whatsappNumber = digits;
            prospect.whatsappUrl = `https://wa.me/${digits}`;
          }
        }

        if (item.website) {
          prospect.profileUrl = item.website;
        }
        if (contact) {
          prospect.publicContact = contact;
        }
        if (item.categoryName) {
          prospect.postSnippet = `Category: ${item.categoryName}. Google Maps Link: ${item.url || '-'}`;
        }

        return prospect;
      });
  }

  public normalize(raw: RawProspect, teamId: string): NormalizedLead {
    return normalizeRawProspect(raw, {
      teamId,
      sourceId: this.sourceId,
      usagePolicy: this.usagePolicy,
    });
  }
}
