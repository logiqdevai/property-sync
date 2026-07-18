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

function readRawString(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
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
    raw_sqm: readRawString(raw, ['sqm', '_sqm', 'square_meters', '_square_meters', 'size']),
    raw_bedrooms: readRawString(raw, ['bedrooms', '_bedrooms', 'rooms', '_rooms']),
    raw_bathrooms: readRawString(raw, ['bathrooms', '_bathrooms', 'wc', '_wc']),
  };
}

export function extractSourcePropertyIds(
  sourceUrl: string,
  raw: Record<string, unknown>,
): { property_id: string; internal_id: string | null } {
  const segments = sourceUrl.split('/').filter(Boolean);
  const property_id = segments[segments.length - 1] ?? 'unknown';
  const internal_id = readRawString(raw, [
    '_internal_id',
    '_external_id',
    'internal_id',
    'listing_code',
  ]);

  return { property_id, internal_id };
}
