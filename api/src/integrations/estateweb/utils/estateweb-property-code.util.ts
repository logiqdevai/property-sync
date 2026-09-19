// The public `code` EstateWeb stores for a listing is a *sanitized* form of our
// internal_id / property_id (see resolveEstateWebCode). Every place that needs to
// recognise "is this CRM listing the one we pushed for this user property" -- CREATE
// reconciliation, the ownership check before an UPDATE -- must compare against that
// same sanitized code, not the raw scraped value. Comparing raw values misses e.g.
// "AP 419" (stored as "AP419") or "#1987" (stored as "1987"), which surfaces as a
// duplicate CREATE in the CRM.

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

/**
 * Lower-cased CRM codes that prove an already-linked listing still belongs to this
 * user property: the raw internal_id and property_id (property_id is URL-derived and
 * never changes even if internal_id is later corrected), plus the sanitized code we
 * actually pushed. Used by the ownership check before an UPDATE.
 */
export function buildEstateWebOwnershipCodes(
  internalId: string | null | undefined,
  propertyId: string | null | undefined,
): string[] {
  return unique([
    normalizeCode(internalId),
    normalizeCode(propertyId),
    normalizeCode(resolveEstateWebCode(internalId, propertyId)),
  ]);
}
