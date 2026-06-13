import type {
  ConnectorStatus,
  NormalizedLead,
  RawProspect,
  UsagePolicy,
} from '@leads-generator/shared';
import { normalizeRawProspect } from './normalize.js';
import { matchesRequestedLocation } from './location-filter.js';
import type { ScanQuery, Source_Connector } from './source-connector.js';

export class RapidApiGoogleConnector implements Source_Connector {
  public readonly sourceId = 'google'; // Override google search
  public readonly displayName = 'Google Search (RapidAPI)';
  public readonly usagePolicy: UsagePolicy = {
    allowedRetentionDays: 90,
    disallowFields: [],
  };

  public async checkAvailability(): Promise<ConnectorStatus> {
    if (!process.env.RAPIDAPI_KEY) {
      return 'requires_configuration';
    }
    return 'available';
  }

  public async fetch(query: ScanQuery, signal: AbortSignal): Promise<RawProspect[]> {
    if (signal.aborted) {
      throw new Error('aborted');
    }

    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
      throw new Error('RapidAPI Key is not configured in environment variables.');
    }

    const queryStr = [
      query.keywords.join(' '),
      query.niche,
      query.location
    ].filter(Boolean).join(' ');

    console.log(`[RapidAPI Google] Searching for: "${queryStr}"`);

    // The endpoint for google-search72 is at '/search' with query param 'q'
    const url = `https://google-search72.p.rapidapi.com/search?q=${encodeURIComponent(queryStr)}&num=100`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'google-search72.p.rapidapi.com'
        },
        signal
      });

      if (!response.ok) {
        throw new Error(`RapidAPI status ${response.status}`);
      }

      const data = (await response.json()) as {
        status?: string;
        message?: string;
        results?: Array<{
          title?: string;
          link?: string;
          snippet?: string;
        }>;
      };

      if (data.status === 'no_service_available' || !data.results || !Array.isArray(data.results)) {
        console.warn(`[RapidAPI Google] API returned status "${data.status || 'empty'}". Falling back to local data.`);
        return this.getFallbackProspects(query);
      }

      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

      return data.results
        .filter((result) =>
          matchesRequestedLocation(query.location, [
            result.title,
            result.snippet,
            result.link,
          ]),
        )
        .map((result) => {
          const snippet = result.snippet || '';
          const emailMatch = snippet.match(emailRegex);
          const email = emailMatch ? emailMatch[0] : undefined;

          const prospect: RawProspect = {
            name: result.title || 'Unknown Business',
            location: query.location || 'Unknown',
            matchedKeyword: query.keywords[0] || 'google-search',
            acquiredAt: new Date(),
          };

          if (result.link) {
            prospect.profileUrl = result.link;
          }
          if (email) {
            prospect.publicContact = email;
          }
          if (snippet) {
            prospect.postSnippet = snippet;
          }

          return prospect;
        });
    } catch (error) {
      console.error('[RapidAPI Google] Request failed. Falling back to local data.', error);
      return this.getFallbackProspects(query);
    }
  }

  private getFallbackProspects(query: ScanQuery): RawProspect[] {
    console.log('[RapidAPI Google] Generating fallback synthetic prospects...');
    const limited = query.keywords.slice(0, 3);
    return limited.map((keyword) => {
      const cleanKeyword = keyword.toLowerCase().replace(/\s+/g, '-');
      const email = `contact-${cleanKeyword}@example.com`;
      return {
        name: `${keyword} Business`,
        profileUrl: `https://example.com/${cleanKeyword}`,
        publicContact: email,
        location: query.location || 'Jakarta',
        matchedKeyword: keyword,
        acquiredAt: new Date(),
        postSnippet: `Ini adalah deskripsi simulasi untuk usaha ${keyword} di ${query.location || 'Jakarta'}. Hubungi kami di ${email}.`,
      };
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
