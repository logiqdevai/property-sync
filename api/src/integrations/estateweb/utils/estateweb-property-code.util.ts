// The public `code` EstateWeb stores for a listing is a *sanitized* form of our
// internal_id / property_id (see resolveEstateWebCode). Finding a pre-existing
// listing before a CREATE must search by that same sanitized code, not the raw
// scraped value -- comparing raw values misses e.g. "AP 419" (stored as "AP419")
// or "#1987" (stored as "1987"), which surfaces as a duplicate CREATE in the CRM.
//
// This is deliberately NOT used to verify an already-linked listing still
// belongs to us before an UPDATE -- see isEstateWebListingIdentityMismatch in
// estateweb-listing-identity.util.ts, which checks scope/address/price/sqm
// instead. Our own internal_id/property_id can legitimately change later (e.g.
// a scraper fix), with no corresponding change on the CRM side, so a `code`
// mismatch alone is not safe proof that an id now points at a different listing
// (see docs/CLIENT-ISSUES-2026-10-01.md #4).

function sanitizeEstateWebCode(
  candidate: string | null | undefined,
): string | null {
  if (!candidate) return null;
  // Strip stray leading punctuation (e.g. a scraped "#1987") and any internal
  // whitespace (e.g. a scraped "AP 419") before validating, so a fixable value
  // doesn't degrade to an empty code.
  const sanitized = String(candidate)
    .trim()
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/\s+/g, '')
    .slice(0, 64);
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(sanitized) ? sanitized : null;
}

/** The `code` we send to EstateWeb for a user property ('' when none is usable). */
export function resolveEstateWebCode(
  internalId: string | null | undefined,
  propertyId: string | null | undefined,
): string {
  for (const candidate of [internalId, propertyId]) {
    const sanitized = sanitizeEstateWebCode(candidate);
    if (sanitized) return sanitized;
  }
  return '';
}

function normalizeCode(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

const CATEGORY_PREFIXED_CODE_RE = /^\d+-(.+)$/;

/**
 * Some EstateWeb accounts store a listing's code with a leading numeric category
 * prefix from a prior bulk import (e.g. "4-2569" for a commercial listing), which
 * our own internal_id/property_id never carries (ours would just be "2569").
 * Returns null when `code` (already normalized) has no such prefix.
 */
function stripEstateWebCategoryPrefix(code: string): string | null {
  const match = code.match(CATEGORY_PREFIXED_CODE_RE);
  return match ? match[1] : null;
}

/**
 * Lower-cased lookup keys an EstateWeb listing's code should be indexed/matched
 * under: itself, and -- when it carries a leading numeric category prefix (see
 * stripEstateWebCategoryPrefix) -- the de-prefixed form too, so a listing created
 * before property-sync tracked it (code never matches our internal_id/property_id
 * as-is) can still be recognised instead of triggering a duplicate CREATE.
 */
export function estateWebCodeLookupKeys(
  code: string | null | undefined,
): string[] {
  const normalized = normalizeCode(code);
  if (!normalized) return [];
  const stripped = stripEstateWebCategoryPrefix(normalized);
  return stripped !== null ? [normalized, stripped] : [normalized];
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => !!value))];
}

/**
 * Lower-cased CRM codes that identify the listing pushed for this user property,
 * most specific first: the code we actually send, then the raw internal_id (older
 * listings, or ones created by hand in the CRM, may carry it verbatim). Used to find
 * an existing listing before a CREATE.
 */
export function buildEstateWebReconcileCodes(
  internalId: string | null | undefined,
  propertyId: string | null | undefined,
): string[] {
  return unique([
    normalizeCode(resolveEstateWebCode(internalId, propertyId)),
    normalizeCode(internalId),
  ]);
}

