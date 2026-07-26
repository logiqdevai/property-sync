import { createHash } from 'crypto';

export function crawlTimestamp(): string {
  return new Date().toISOString();
}

export function contentHash(obj: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(obj))
    .digest('hex')
    .slice(0, 16);
}

function readRawString(
  raw: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value);
  }
  return null;
}

const INTERNAL_ID_PATTERNS: RegExp[] = [
  /Κωδικός\s+ακινήτου\s*[:：]?\s*([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/iu,
  /Κωδικός\s*[:：]\s*([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/iu,
  /(?:Property\s+)?(?:Code|Ref(?:erence)?)\s*[:：]\s*([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/i,
];

export function extractInternalIdFromText(
  ...texts: Array<string | null | undefined>
): string | null {
  for (const text of texts) {
    if (!text) continue;
    for (const pattern of INTERNAL_ID_PATTERNS) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
  }
  return null;
}

export function readDetailStructured(rawData: unknown): {
  specs: Record<string, string> | null;
  features: string[] | null;
} {
  if (!rawData || typeof rawData !== 'object') {
    return { specs: null, features: null };
  }
  const data = rawData as Record<string, unknown>;

  let specs: Record<string, string> | null = null;
  const rawSpecs = data._detail_specs;
  if (rawSpecs && typeof rawSpecs === 'object' && !Array.isArray(rawSpecs)) {
    const entries = Object.entries(rawSpecs as Record<string, unknown>).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && entry[1].trim() !== '',
    );
    if (entries.length > 0) specs = Object.fromEntries(entries);
  }

  let features: string[] | null = null;
  const rawFeatures = data._detail_features;
  if (Array.isArray(rawFeatures)) {
    const list = rawFeatures.filter(
      (item): item is string => typeof item === 'string' && item.trim() !== '',
    );
    if (list.length > 0) features = list;
  }

  return { specs, features };
}

export function extractDenormalizedRawFields(raw: Record<string, unknown>) {
  return {
    raw_property_type: readRawString(raw, [
      'property_type',
      '_property_type',
      'type',
      '_type',
    ]),
    raw_listing_type: readRawString(raw, [
      'listing_type',
      '_listing_type',
      'transaction_type',
      '_transaction_type',
    ]),
    raw_sqm: readRawString(raw, [
      'sqm',
      '_sqm',
      'square_meters',
      '_square_meters',
      'size',
    ]),
    raw_bedrooms: readRawString(raw, [
      'bedrooms',
      '_bedrooms',
      'rooms',
      '_rooms',
    ]),
    raw_bathrooms: readRawString(raw, ['bathrooms', '_bathrooms', 'wc', '_wc']),
  };
}

export function extractSourcePropertyIds(
  sourceUrl: string,
  raw: Record<string, unknown>,
): { property_id: string; internal_id: string | null } {
  const segments = sourceUrl.split('/').filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  const last = segments[segments.length - 1] ?? 'unknown';
  const prev = segments[segments.length - 2];
  let property_id = last;
  if (prev && /^\d+$/.test(prev) && !/^\d+$/.test(last)) {
    property_id = prev;
  } else if (!/^\d+$/.test(last)) {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (/^\d+$/.test(segments[i])) {
        property_id = segments[i];
        break;
      }
    }
  }
  const internal_id =
    readRawString(raw, [
      '_internal_id',
      '_external_id',
      'internal_id',
      'listing_code',
    ]) ??
    extractInternalIdFromText(
      readRawString(raw, [
        '_detail_text',
        'detail_text',
        '_description',
        'description',
      ]),
      readRawString(raw, ['location', '_location', 'raw_location']),
    );

  return { property_id, internal_id };
}
