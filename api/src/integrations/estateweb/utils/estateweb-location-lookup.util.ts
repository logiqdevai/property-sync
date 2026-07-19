import { ESTATEWEB_LOCATIONS } from '../constants/estateweb-locations.constants';
import { EstateWebLocation } from '../interfaces/estateweb-location.interface';
import { normalizeEstateWebLabel } from './estateweb-init-lookup.util';

const LOCATION_BY_ID = new Map<number, EstateWebLocation>(
  ESTATEWEB_LOCATIONS.map((loc) => [loc.id, loc]),
);

const LOCATION_BY_NORMALIZED_NAME: Map<string, EstateWebLocation[]> = (() => {
  const idx = new Map<string, EstateWebLocation[]>();
  for (const loc of ESTATEWEB_LOCATIONS) {
    const key = normalizeEstateWebLabel(loc.name);
    const bucket = idx.get(key);
    if (bucket) bucket.push(loc);
    else idx.set(key, [loc]);
  }
  return idx;
})();

const LOCATION_NORMALIZED_SEGMENTS = new Map<number, string[]>(
  ESTATEWEB_LOCATIONS.map((loc) => [
    loc.id,
    loc.path.split(' » ').map((seg) => normalizeEstateWebLabel(seg)),
  ]),
);

/** Resolve a location node by its numeric EstateWeb id. */
export function getEstateWebLocation(
  locationId: number,
): EstateWebLocation | undefined {
  return LOCATION_BY_ID.get(locationId);
}

/** Breadcrumb path for a location id (e.g. `"Μακεδονία » Θεσσαλονίκη"`). */
export function getEstateWebLocationNamePath(
  locationId: number,
): string | undefined {
  return LOCATION_BY_ID.get(locationId)?.path;
}

function matchesCity(loc: EstateWebLocation, normalizedCity: string): boolean {
  const segments = LOCATION_NORMALIZED_SEGMENTS.get(loc.id);
  return segments ? segments.includes(normalizedCity) : false;
}

/** Deepest node wins; ties resolved by smallest id for stability. */
function pickMostSpecific(
  candidates: EstateWebLocation[],
): EstateWebLocation | undefined {
  let best: EstateWebLocation | undefined;
  for (const loc of candidates) {
    if (
      !best ||
      loc.level > best.level ||
      (loc.level === best.level && loc.id < best.id)
    ) {
      best = loc;
    }
  }
  return best;
}

/** Canonical city node: prefer `is_city`, then shallowest level, then id. */
function pickCanonicalCity(
  candidates: EstateWebLocation[],
): EstateWebLocation | undefined {
  let best: EstateWebLocation | undefined;
  for (const loc of candidates) {
    if (!best) {
      best = loc;
      continue;
    }
    if (loc.is_city !== best.is_city) {
      if (loc.is_city) best = loc;
      continue;
    }
    if (loc.level < best.level || (loc.level === best.level && loc.id < best.id)) {
      best = loc;
    }
  }
  return best;
}

/**
 * Resolve the EstateWeb internal location node from free-text `city` / `district`.
 *
 * Deterministic strategy:
 * 1. Prefer `district`. When a `city` is also given, keep only district nodes
 *    whose ancestor path contains that city (disambiguates districts that repeat
 *    across cities, e.g. "Ιστορικό Κέντρο"). Pick the deepest node.
 * 2. Fall back to `city`, preferring the canonical city node (`is_city`, then
 *    shallowest level).
 * 3. Return `undefined` when there is no confident match.
 */
export function resolveEstateWebLocation(
  city?: string | null,
  district?: string | null,
): EstateWebLocation | undefined {
  const normalizedCity = city ? normalizeEstateWebLabel(city) : '';
  const normalizedDistrict = district ? normalizeEstateWebLabel(district) : '';

  if (normalizedDistrict) {
    const districtMatches =
      LOCATION_BY_NORMALIZED_NAME.get(normalizedDistrict) ?? [];
    if (districtMatches.length > 0) {
      const scoped = normalizedCity
        ? districtMatches.filter((loc) => matchesCity(loc, normalizedCity))
        : districtMatches;
      // Only trust district when unambiguous or agrees with the city.
      if (scoped.length > 0) {
        return pickMostSpecific(scoped);
      }
      if (!normalizedCity) {
        return pickMostSpecific(districtMatches);
      }
    }
  }

  if (normalizedCity) {
    const cityMatches = LOCATION_BY_NORMALIZED_NAME.get(normalizedCity) ?? [];
    if (cityMatches.length > 0) {
      return pickCanonicalCity(cityMatches);
    }
  }

  return undefined;
}

/** Convenience wrapper returning just the numeric location id (or `null`). */
export function resolveEstateWebLocationId(
  city?: string | null,
  district?: string | null,
): number | null {
  return resolveEstateWebLocation(city, district)?.id ?? null;
}
