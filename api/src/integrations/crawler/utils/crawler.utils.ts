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
  /Property\s*ID\s*[:：]\s*([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/i,
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

export function normalizeUrlPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : '/';
}

export function isDetailPageRedirectAway(
  sourceUrl: string,
  finalUrl: string,
): boolean {
  try {
    const source = new URL(sourceUrl);
    const final = new URL(finalUrl);
    if (source.origin !== final.origin) {
      return true;
    }

    const sourcePath = normalizeUrlPath(source.pathname);
    const finalPath = normalizeUrlPath(final.pathname);
    if (sourcePath === finalPath) {
      return false;
    }

    const sourceRoot = sourcePath.split('/').filter(Boolean)[0];
    const finalRoot = finalPath.split('/').filter(Boolean)[0];

    if (sourceRoot === 'property' && finalRoot !== 'property') {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

// CDN-served listing photos are frequently exposed at multiple resolutions
// under otherwise-identical URLs, e.g. `.../173799670_900x675.jpg` (detail
// gallery) and `.../173799670_300x220.jpg` (listing-page thumbnail) -- same
// photo, different size suffix. A literal-string Set doesn't catch that, so
// merging raw image lists from different pages of a crawl can double-count a
// single photo. Strip the `_WxH` suffix (and query string) before comparing.
const IMAGE_SIZE_VARIANT_PATTERN = /[_-]\d{2,4}x\d{2,4}(?=\.[a-z0-9]+$)/i;

function imageBaseKey(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(IMAGE_SIZE_VARIANT_PATTERN, '');
    return `${parsed.origin}${pathname}`;
  } catch {
    return url.split('?')[0].replace(IMAGE_SIZE_VARIANT_PATTERN, '');
  }
}

function imageResolutionScore(url: string): number {
  const match = url.match(/(\d{2,4})x(\d{2,4})/);
  if (!match) return 0;
  return Number(match[1]) * Number(match[2]);
}

/// Merges image URL lists (e.g. detail-page gallery + listing-page card
/// images) into one deduplicated list, treating same-photo size variants as
/// duplicates and keeping the highest-resolution URL for each photo.
export function mergeImagesDedupingSizeVariants(
  ...lists: (string[] | undefined)[]
): string[] {
  const chosenByKey = new Map<string, string>();
  const keyOrder: string[] = [];
  for (const list of lists) {
    for (const url of list ?? []) {
      const key = imageBaseKey(url);
      const existing = chosenByKey.get(key);
      if (existing === undefined) {
        chosenByKey.set(key, url);
        keyOrder.push(key);
      } else if (imageResolutionScore(url) > imageResolutionScore(existing)) {
        chosenByKey.set(key, url);
      }
    }
  }
  return keyOrder.map((key) => chosenByKey.get(key) as string);
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

function stripIdPrefix(value: string | null): string | null {
  if (!value) return value;
  const stripped = value.replace(/^[^A-Za-z0-9]+/, '').trim();
  return stripped || null;
}

export function extractSourcePropertyIds(
  sourceUrl: string,
  raw: Record<string, unknown>,
): { property_id: string; internal_id: string | null } {
  const fromPage = stripIdPrefix(
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
      ),
  );

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

  // WordPress/JetEngine sites often use a slug in the URL and the real agency
  // code only on the detail page ("Property ID: 4308"). Prefer that page code
  // over a non-numeric slug for both property_id and internal_id.
  if (fromPage && !/^\d+$/.test(property_id)) {
    return { property_id: fromPage, internal_id: fromPage };
  }

  return {
    property_id,
    internal_id: fromPage ?? property_id,
  };
}
