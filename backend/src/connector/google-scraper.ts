import type {
  ConnectorStatus,
  NormalizedLead,
  RawProspect,
  UsagePolicy,
} from '@leads-generator/shared';
import { normalizeRawProspect } from './normalize.js';
import type { ScanQuery, Source_Connector } from './source-connector.js';

const MAX_RESULTS = 50;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_BBOX_SPAN = 0.25;
const DEBUG_OSM_SCRAPER = process.env.DEBUG_OSM_SCRAPER === '1';
const OVERPASS_ENDPOINTS = [
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

interface OverpassElement {
  id: number;
  type: 'node' | 'way' | 'relation';
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
  lat: number;
  lon: number;
}

interface NominatimPlace {
  boundingbox?: [string, string, string, string];
  lat?: string;
  lon?: string;
  osm_type?: 'node' | 'way' | 'relation';
  osm_id?: number;
  category?: string;
  type?: string;
  name?: string;
  display_name?: string;
}

const CATEGORY_FILTERS: Record<string, string[]> = {
  cafe: ['["amenity"="cafe"]'],
  coffee: ['["amenity"="cafe"]'],
  coffeeshop: ['["amenity"="cafe"]'],
  kopi: ['["amenity"="cafe"]'],
  restoran: ['["amenity"="restaurant"]'],
  restaurant: ['["amenity"="restaurant"]'],
  food: ['["amenity"="restaurant"]', '["amenity"="fast_food"]', '["amenity"="cafe"]'],
  makanan: ['["amenity"="restaurant"]', '["amenity"="fast_food"]', '["amenity"="cafe"]'],
  rumahmakan: ['["amenity"="restaurant"]'],
  rumahmakansunda: ['["amenity"="restaurant"]'],
  hotel: ['["tourism"="hotel"]', '["tourism"="guest_house"]'],
  klinik: ['["amenity"="clinic"]', '["healthcare"="clinic"]'],
  clinic: ['["amenity"="clinic"]', '["healthcare"="clinic"]'],
  dokterhewan: ['["amenity"="veterinary"]'],
  klinikhewan: ['["amenity"="veterinary"]'],
  veterinary: ['["amenity"="veterinary"]'],
  veterinarian: ['["amenity"="veterinary"]'],
  vet: ['["amenity"="veterinary"]'],
  apotek: ['["amenity"="pharmacy"]', '["shop"="chemist"]'],
  pharmacy: ['["amenity"="pharmacy"]', '["shop"="chemist"]'],
  salon: ['["shop"="hairdresser"]', '["shop"="beauty"]'],
  barber: ['["shop"="hairdresser"]'],
  barbershop: ['["shop"="hairdresser"]'],
  bengkel: ['["shop"="car_repair"]'],
  cucisepatu: ['["shop"="shoe_repair"]', '["shop"="laundry"]'],
  sepatucleaning: ['["shop"="shoe_repair"]', '["shop"="laundry"]'],
  shoerepair: ['["shop"="shoe_repair"]'],
  laundry: ['["shop"="laundry"]'],
  gym: ['["leisure"="fitness_centre"]'],
  fitness: ['["leisure"="fitness_centre"]'],
  spa: ['["shop"="beauty"]'],
  toko: ['["shop"]'],
  store: ['["shop"]'],
};

const NOMINATIM_QUERY_ALIASES: Record<string, string[]> = {
  rumahmakansunda: ['sundanese restaurant', 'restaurant'],
  rumahmakan: ['restaurant'],
  restoran: ['restaurant'],
  makanan: ['restaurant', 'food'],
  cucisepatu: ['laundry', 'shoe repair', 'shoe laundry'],
  sepatucleaning: ['laundry', 'shoe cleaning'],
  dokterhewan: ['veterinary clinic', 'animal clinic', 'pet clinic'],
  klinikhewan: ['veterinary clinic', 'animal clinic', 'pet clinic'],
};

function normalizeKeyword(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function escapeOverpassRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueKeywords(query: ScanQuery): string[] {
  const values = [...query.keywords, query.niche ?? '']
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

function nominatimTerms(keyword: string): string[] {
  return Array.from(new Set([
    keyword,
    ...(NOMINATIM_QUERY_ALIASES[normalizeKeyword(keyword)] ?? []),
  ]));
}

function significantLocationTokens(location: string): string[] {
  return location
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 3)
    .filter((token) => !['kota', 'kabupaten', 'city', 'regency', 'provinsi', 'province'].includes(token));
}

function placeMatchesLocation(place: NominatimPlace, location: string): boolean {
  const displayName = place.display_name?.toLowerCase() ?? '';
  if (!displayName) return false;

  const tokens = significantLocationTokens(location);
  const hasRequestedLocation = tokens.length === 0 || tokens.some((token) => displayName.includes(token));
  const likelyIndonesia = displayName.includes('indonesia');
  return hasRequestedLocation && likelyIndonesia;
}

function overpassClauses(keyword: string, scope: string): string[] {
  const normalized = normalizeKeyword(keyword);
  const tokenFilters = keyword
    .split(/\s+/)
    .map(normalizeKeyword)
    .flatMap((token) => CATEGORY_FILTERS[token] ?? []);
  const categoryFilters = Array.from(new Set([
    ...(CATEGORY_FILTERS[normalized] ?? []),
    ...tokenFilters,
  ]));
  if (categoryFilters.length > 0) {
    return categoryFilters.map((filter) => `nwr${scope}${filter};`);
  }

  const escaped = escapeOverpassRegex(keyword);
  return [
    `nwr${scope}["name"~"${escaped}",i];`,
    `nwr${scope}["brand"~"${escaped}",i];`,
    `nwr${scope}["operator"~"${escaped}",i];`,
    ...categoryFilters.map((filter) => `nwr${scope}${filter};`),
  ];
}

function bboxScope(bbox: BoundingBox): string {
  return `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
}

function buildOverpassQuery(query: ScanQuery, bbox: BoundingBox): string {
  const location = query.location?.trim();
  if (!location) {
    throw new Error('Private scraper requires a location');
  }

  const keywords = uniqueKeywords(query);
  const scope = bboxScope(bbox);
  const clauses = keywords.length > 0
    ? keywords.flatMap((keyword) => overpassClauses(keyword, scope))
    : [`nwr${scope}["name"];`];

  return `
    [out:json][timeout:12];
    (
      ${clauses.join('\n')}
    );
    out tags center qt ${MAX_RESULTS};
  `;
}

function clampBoundingBox(box: BoundingBox): BoundingBox {
  const latSpan = box.north - box.south;
  const lonSpan = box.east - box.west;
  if (latSpan <= MAX_BBOX_SPAN && lonSpan <= MAX_BBOX_SPAN) return box;

  const halfLat = Math.min(latSpan / 2, MAX_BBOX_SPAN / 2);
  const halfLon = Math.min(lonSpan / 2, MAX_BBOX_SPAN / 2);
  return {
    ...box,
    south: box.lat - halfLat,
    north: box.lat + halfLat,
    west: box.lon - halfLon,
    east: box.lon + halfLon,
  };
}

function withTimeout(parentSignal: AbortSignal, timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  parentSignal.addEventListener('abort', abort, { once: true });
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timer);
    parentSignal.removeEventListener('abort', abort);
  }, { once: true });
  return controller.signal;
}

function logDebug(message: string, details?: Record<string, unknown>): void {
  if (!DEBUG_OSM_SCRAPER) return;
  if (details) {
    console.log(`[OSM Scraper] ${message}`, JSON.stringify(details));
  } else {
    console.log(`[OSM Scraper] ${message}`);
  }
}

function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}

async function geocodeLocation(location: string, signal: AbortSignal): Promise<BoundingBox> {
  const startedAt = performance.now();
  logDebug('geocode start', { location });
  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', location);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Growhaley-Private-Scraper/0.1',
      'Accept-Language': 'id,en;q=0.8',
    },
    signal: withTimeout(signal, REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Nominatim status ${response.status}: ${(await response.text()).slice(0, 160)}`);
  }

  const places = (await response.json()) as NominatimPlace[];
  const box = places[0]?.boundingbox;
  if (!box) {
    throw new Error(`Location not found: ${location}`);
  }

  const lat = Number(places[0]?.lat);
  const lon = Number(places[0]?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`Location coordinates not found: ${location}`);
  }

  const rawBox = {
    south: Number(box[0]),
    north: Number(box[1]),
    west: Number(box[2]),
    east: Number(box[3]),
    lat,
    lon,
  };
  const clamped = clampBoundingBox(rawBox);
  logDebug('geocode complete', { location, durationMs: elapsedMs(startedAt), rawBox, clamped });
  return clamped;
}

async function fetchOverpass(queryText: string, signal: AbortSignal): Promise<OverpassResponse> {
  let lastError = 'unknown error';

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const startedAt = performance.now();
    logDebug('overpass request start', { endpoint, queryLength: queryText.length });
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Growhaley-Private-Scraper/0.1',
        },
        body: new URLSearchParams({ data: queryText }),
        signal: withTimeout(signal, REQUEST_TIMEOUT_MS),
      });

      if (response.ok) {
        const data = (await response.json()) as OverpassResponse;
        logDebug('overpass request ok', {
          endpoint,
          durationMs: elapsedMs(startedAt),
          elements: Array.isArray(data.elements) ? data.elements.length : 0,
        });
        return data;
      }

      lastError = `${endpoint} status ${response.status}: ${(await response.text()).slice(0, 180)}`;
      logDebug('overpass request failed', { endpoint, durationMs: elapsedMs(startedAt), error: lastError });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = `${endpoint}: ${message}`;
      logDebug('overpass request threw', { endpoint, durationMs: elapsedMs(startedAt), error: message });
    }
  }

  throw new Error(`Overpass scraper failed: ${lastError}`);
}

function tag(tags: Record<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = tags[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function addressFromTags(tags: Record<string, string>, fallbackLocation: string | undefined): string {
  const parts = [
    tags['addr:street'],
    tags['addr:housenumber'],
    tags['addr:suburb'],
    tags['addr:city'],
    tags['addr:district'],
    tags['addr:province'],
  ]
    .map((part) => part?.trim())
    .filter(Boolean);

  if (parts.length > 0) return Array.from(new Set(parts)).join(', ');
  return fallbackLocation?.trim() ? fallbackLocation : 'Unknown';
}

function elementUrl(element: OverpassElement): string {
  return `https://www.openstreetmap.org/${element.type}/${element.id}`;
}

function contactFromTags(tags: Record<string, string>): string | undefined {
  return tag(tags, 'contact:email', 'email', 'contact:phone', 'phone');
}

function whatsappNumberFromTags(tags: Record<string, string>): string | undefined {
  const raw = tag(tags, 'contact:phone', 'phone');
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  return digits.length > 0 ? digits : undefined;
}

function websiteFromTags(tags: Record<string, string>): string | undefined {
  return tag(tags, 'contact:website', 'website', 'url', 'contact:facebook');
}

function osmUrlFromNominatim(place: NominatimPlace): string | undefined {
  if (!place.osm_type || place.osm_id === undefined) return undefined;
  return `https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}`;
}

function nameFromPlace(place: NominatimPlace): string | undefined {
  const name = place.name?.trim();
  if (name) return name;
  const displayName = place.display_name?.split(',')[0]?.trim();
  return displayName?.trim() ? displayName : undefined;
}

async function searchNominatimPois(query: ScanQuery, signal: AbortSignal): Promise<RawProspect[]> {
  const location = query.location?.trim();
  if (!location) {
    throw new Error('Private scraper requires a location');
  }

  const keywords = uniqueKeywords(query);
  const seen = new Set<string>();
  const prospects: RawProspect[] = [];

  for (const keyword of keywords.length > 0 ? keywords : ['business']) {
    const terms = nominatimTerms(keyword);
    for (const term of terms) {
      const startedAt = performance.now();
      const url = new URL(NOMINATIM_ENDPOINT);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', String(MAX_RESULTS));
      url.searchParams.set('q', `${term} ${location}`);

      logDebug('nominatim poi search start', { keyword, term, location });
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Growhaley-Private-Scraper/0.1',
          'Accept-Language': 'id,en;q=0.8',
        },
        signal: withTimeout(signal, REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Nominatim POI status ${response.status}: ${(await response.text()).slice(0, 160)}`);
      }

      const places = (await response.json()) as NominatimPlace[];
      logDebug('nominatim poi search complete', { keyword, term, durationMs: elapsedMs(startedAt), places: places.length });

      for (const place of places) {
        if (!placeMatchesLocation(place, location)) continue;
        const name = nameFromPlace(place);
        const osmUrl = osmUrlFromNominatim(place);
        if (!name || !osmUrl) continue;
        if (seen.has(osmUrl)) continue;
        seen.add(osmUrl);

        const prospect: RawProspect = {
          name,
          location: place.display_name?.trim() ? place.display_name : location,
          matchedKeyword: keyword,
          acquiredAt: new Date(),
        };

        if (place.category || place.type) {
          prospect.postSnippet = `OSM category: ${[place.category, place.type].filter(Boolean).join('/')}. OSM link: ${osmUrl}`;
        }

        prospects.push(prospect);
        if (prospects.length >= MAX_RESULTS) break;
      }

      if (prospects.length >= MAX_RESULTS) break;
    }

    if (prospects.length >= MAX_RESULTS) break;
  }

  logDebug('nominatim poi prospects complete', { prospects: prospects.length });
  return prospects;
}

export class GoogleScraperConnector implements Source_Connector {
  public readonly sourceId = 'google-scraper';
  public readonly displayName = 'Scrap Worker Pribadi (OSM)';
  public readonly usagePolicy: UsagePolicy = {
    allowedRetentionDays: 90,
    disallowFields: [],
  };

  public checkAvailability(): Promise<ConnectorStatus> {
    return Promise.resolve('available');
  }

  public async fetch(query: ScanQuery, signal: AbortSignal): Promise<RawProspect[]> {
    if (signal.aborted) {
      throw new Error('aborted');
    }

    const location = query.location?.trim();
    if (!location) {
      throw new Error('Private scraper requires a location');
    }

    logDebug('fetch start', { location, keywords: query.keywords, niche: query.niche });
    const nominatimProspects = await searchNominatimPois(query, signal);
    if (nominatimProspects.length > 0) {
      return nominatimProspects;
    }

    logDebug('nominatim returned no prospects, falling back to overpass');
    let data: OverpassResponse;
    try {
      const bbox = await geocodeLocation(location, signal);
      const overpassQuery = buildOverpassQuery(query, bbox);
      logDebug('overpass query built', { query: overpassQuery.replace(/\s+/g, ' ').trim() });
      data = await fetchOverpass(overpassQuery, signal);
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      logDebug('overpass fallback skipped after failure', { error: message });
      return [];
    }

    const elements = Array.isArray(data.elements) ? data.elements : [];
    logDebug('elements received', { count: elements.length });
    const seen = new Set<string>();
    const prospects: RawProspect[] = [];

    for (const element of elements) {
      const tags = element.tags ?? {};
      const name = tag(tags, 'name', 'brand', 'operator');
      if (!name) continue;

      const location = addressFromTags(tags, query.location);
      const osmUrl = elementUrl(element);
      const website = websiteFromTags(tags);
      const identity = website ?? osmUrl;
      if (seen.has(identity)) continue;
      seen.add(identity);

      const prospect: RawProspect = {
        name,
        location,
        matchedKeyword: query.keywords[0] ?? query.niche ?? 'private-scraper',
        acquiredAt: new Date(),
      };

      if (website) {
        prospect.profileUrl = website;
      }

      const contact = contactFromTags(tags);
      if (contact) {
        prospect.publicContact = contact;
      }

      const whatsappNumber = whatsappNumberFromTags(tags);
      if (whatsappNumber) {
        prospect.whatsappNumber = whatsappNumber;
        prospect.whatsappUrl = `https://wa.me/${whatsappNumber}`;
      }

      const category = tag(tags, 'amenity', 'shop', 'tourism', 'leisure', 'healthcare', 'craft', 'office');
      if (category) {
        prospect.postSnippet = `OSM category: ${category}. OSM link: ${osmUrl}`;
      }

      prospects.push(prospect);
      if (prospects.length >= MAX_RESULTS) break;
    }

    logDebug('fetch complete', { prospects: prospects.length });
    return prospects;
  }

  public normalize(raw: RawProspect, teamId: string): NormalizedLead {
    return normalizeRawProspect(raw, {
      teamId,
      sourceId: this.sourceId,
      usagePolicy: this.usagePolicy,
    });
  }
}
