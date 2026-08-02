import { ESTATEWEB_LOCATIONS } from '../constants/estateweb-locations.constants';
import {
  EstateWebLocation,
  EstateWebLocationCatalogItem,
} from '../interfaces/estateweb-location.interface';
import { normalizeEstateWebLabel } from './estateweb-init-lookup.util';

const LOCATION_BY_ID = new Map<number, EstateWebLocation>(
  ESTATEWEB_LOCATIONS.map((loc) => [loc.id, loc]),
);

const LOCATION_IDS_WITH_CHILDREN = new Set(
  ESTATEWEB_LOCATIONS.map((loc) => loc.parent_id),
);

const LOCATION_CATALOG: EstateWebLocationCatalogItem[] =
  ESTATEWEB_LOCATIONS.map((loc) => ({
    id: loc.id,
    name: loc.name,
    parent_id: loc.parent_id,
    level: loc.level,
    is_city: loc.is_city,
    path: loc.path,
    has_children: LOCATION_IDS_WITH_CHILDREN.has(loc.id),
  }));

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

const CITY_ALIASES: Record<string, string> = {
  θεσσαλονικης: 'θεσσαλονικη',
  'θεσσαλονικη περιφ/κοι δημοι': 'θεσσαλονικη',
  'θεσσαλονικη περιφκοι δημοι': 'θεσσαλονικη',
  'ν. πιεριας': 'πιερια',
  'ν πιεριας': 'πιερια',
  πιεριας: 'πιερια',
  'ν. σερρες': 'σερρες',
  'ν σερρες': 'σερρες',
  'ν. σερρων': 'σερρες',
  'ν σερρων': 'σερρες',
  σερρων: 'σερρες',
  'ν. φλωρινας': 'φλωρινα',
  'ν φλωρινας': 'φλωρινα',
  φλωρινας: 'φλωρινα',
  'ν. χαλκιδικης': 'χαλκιδικη',
  'ν χαλκιδικης': 'χαλκιδικη',
  χαλκιδικης: 'χαλκιδικη',
};

const PERIPHERAL_CITY_LABELS = new Set([
  'θεσσαλονικη περιφ/κοι δημοι',
  'θεσσαλονικη περιφκοι δημοι',
]);

/** Resolve a location node by its numeric EstateWeb id. */
export function getEstateWebLocation(
  locationId: number,
): EstateWebLocation | undefined {
  return LOCATION_BY_ID.get(locationId);
}

/** Flat catalog for UI pickers (id, labels, hierarchy flags). */
export function listEstateWebLocationCatalog(): EstateWebLocationCatalogItem[] {
  return LOCATION_CATALOG;
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

function isDescendantOf(
  loc: EstateWebLocation,
  ancestorId: number,
): boolean {
  let current: EstateWebLocation | undefined = loc;
  while (current) {
    if (current.id === ancestorId) return true;
    current =
      current.parent_id != null
        ? LOCATION_BY_ID.get(current.parent_id)
        : undefined;
  }
  return false;
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

function stripGreekGenitive(normalized: string): string | null {
  if (normalized.endsWith('ης') && normalized.length > 3) {
    return normalized.slice(0, -2) + 'η';
  }
  if (normalized.endsWith('ας') && normalized.length > 3) {
    return normalized.slice(0, -2) + 'α';
  }
  if (normalized.endsWith('ων') && normalized.length > 3) {
    return normalized.slice(0, -2) + 'ες';
  }
  return null;
}

function expandCityLabels(city?: string | null): {
  labels: string[];
  preferPeripheral: boolean;
} {
  if (!city) return { labels: [], preferPeripheral: false };
  const raw = normalizeEstateWebLabel(city);
  if (!raw) return { labels: [], preferPeripheral: false };

  const preferPeripheral = PERIPHERAL_CITY_LABELS.has(raw);
  const labels: string[] = [];
  const push = (value: string) => {
    if (value && !labels.includes(value)) labels.push(value);
  };

  push(raw);
  const aliased = CITY_ALIASES[raw];
  if (aliased) push(aliased);

  const withoutNomos = raw.replace(/^ν\.?\s+/, '');
  if (withoutNomos !== raw) {
    push(withoutNomos);
    const aliasFromNomos = CITY_ALIASES[withoutNomos];
    if (aliasFromNomos) push(aliasFromNomos);
    const genitiveFromNomos = stripGreekGenitive(withoutNomos);
    if (genitiveFromNomos) push(genitiveFromNomos);
  }

  const genitive = stripGreekGenitive(raw);
  if (genitive) {
    push(genitive);
    const aliasFromGenitive = CITY_ALIASES[genitive];
    if (aliasFromGenitive) push(aliasFromGenitive);
  }

  return { labels, preferPeripheral };
}

function parseParentheticalParts(
  value: string,
): { outer: string; inner: string } | null {
  const match = value.trim().match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!match) return null;
  const outer = match[1].trim();
  const inner = match[2].trim();
  if (!outer || !inner) return null;
  return { outer, inner };
}

function expandDistrictLabels(district?: string | null): string[] {
  if (!district) return [];
  const raw = normalizeEstateWebLabel(district);
  if (!raw) return [];

  const parts = raw
    .split(/\s*[,|/]\s*|\s+-\s+|\s+–\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const labels: string[] = [];
  const push = (value: string) => {
    if (value && !labels.includes(value)) labels.push(value);
  };

  push(raw);
  for (let i = parts.length - 1; i >= 0; i--) {
    push(parts[i]);
  }
  return labels;
}

function resolveRelatedToAnchor(
  candidates: EstateWebLocation[],
  anchors: EstateWebLocation[],
): EstateWebLocation | undefined {
  if (!candidates.length || !anchors.length) return undefined;

  const related: EstateWebLocation[] = [];
  for (const candidate of candidates) {
    for (const anchor of anchors) {
      const sameParent =
        anchor.parent_id != null && candidate.parent_id === anchor.parent_id;
      if (
        sameParent ||
        isDescendantOf(candidate, anchor.id) ||
        matchesCity(candidate, normalizeEstateWebLabel(anchor.name))
      ) {
        related.push(candidate);
        break;
      }
    }
  }

  return related.length > 0 ? pickMostSpecific(related) : undefined;
}

function resolveParentheticalDistrict(
  district: string,
  cityLabels: string[],
  preferPeripheral: boolean,
): EstateWebLocation | undefined {
  const parsed = parseParentheticalParts(district);
  if (!parsed) return undefined;

  const outerNorm = normalizeEstateWebLabel(parsed.outer);
  const innerNorm = normalizeEstateWebLabel(parsed.inner);
  if (!outerNorm || !innerNorm) return undefined;

  const outerMatches = LOCATION_BY_NORMALIZED_NAME.get(outerNorm) ?? [];
  const innerMatches = LOCATION_BY_NORMALIZED_NAME.get(innerNorm) ?? [];

  const related = resolveRelatedToAnchor(outerMatches, innerMatches);
  if (related) return related;

  const scopedOuter = resolveByDistrict(
    outerNorm,
    [innerNorm, ...cityLabels],
    preferPeripheral,
  );
  if (scopedOuter) return scopedOuter;

  if (innerMatches.length > 0) {
    return pickCanonicalCity(innerMatches) ?? pickMostSpecific(innerMatches);
  }

  if (outerMatches.length > 0) {
    return pickMostSpecific(outerMatches);
  }

  return undefined;
}

function excludeUnderCanonicalCity(
  candidates: EstateWebLocation[],
  normalizedCity: string,
): EstateWebLocation[] {
  const cityNode = pickCanonicalCity(
    LOCATION_BY_NORMALIZED_NAME.get(normalizedCity) ?? [],
  );
  if (!cityNode?.is_city) return candidates;
  const filtered = candidates.filter(
    (loc) => !isDescendantOf(loc, cityNode.id),
  );
  return filtered.length > 0 ? filtered : candidates;
}

function resolveByDistrict(
  districtLabel: string,
  cityLabels: string[],
  preferPeripheral: boolean,
): EstateWebLocation | undefined {
  const districtMatches =
    LOCATION_BY_NORMALIZED_NAME.get(districtLabel) ?? [];
  if (districtMatches.length === 0) return undefined;

  if (cityLabels.length === 0) {
    return pickMostSpecific(districtMatches);
  }

  for (const cityLabel of cityLabels) {
    let scoped = districtMatches.filter((loc) => matchesCity(loc, cityLabel));
    if (scoped.length === 0) continue;
    if (preferPeripheral) {
      scoped = excludeUnderCanonicalCity(scoped, cityLabel);
    }
    const picked = pickMostSpecific(scoped);
    if (picked) return picked;
  }

  return undefined;
}

/**
 * Resolve the EstateWeb internal location node from free-text `city` / `district`.
 *
 * Deterministic strategy:
 * 1. Prefer `district` (and comma/slash segments, deepest-first). When a `city`
 *    is also given, keep only district nodes whose ancestor path contains that
 *    city (after alias/genitive normalization).
 * 2. For compound districts like `"Καλαμαριά, Αρετσού"`, also try the left
 *    segment as city and the right as district.
 * 3. Fall back to `city`, preferring the canonical city node (`is_city`, then
 *    shallowest level).
 * 4. Return `undefined` when there is no confident match.
 */
export function resolveEstateWebLocation(
  city?: string | null,
  district?: string | null,
): EstateWebLocation | undefined {
  const { labels: cityLabels, preferPeripheral } = expandCityLabels(city);
  const districtLabels = expandDistrictLabels(district);

  for (const districtLabel of districtLabels) {
    const byDistrict = resolveByDistrict(
      districtLabel,
      cityLabels,
      preferPeripheral,
    );
    if (byDistrict) return byDistrict;
  }

  if (district) {
    const byParenthetical = resolveParentheticalDistrict(
      district,
      cityLabels,
      preferPeripheral,
    );
    if (byParenthetical) return byParenthetical;
  }

  if (district) {
    const compoundParts = normalizeEstateWebLabel(district)
      .split(/\s*[,|/]\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (compoundParts.length >= 2) {
      const left = compoundParts[0];
      const right = compoundParts[compoundParts.length - 1];
      const byCompound = resolveByDistrict(right, [left, ...cityLabels], false);
      if (byCompound) return byCompound;
      const leftAsDistrict = resolveByDistrict(left, cityLabels, preferPeripheral);
      if (leftAsDistrict) return leftAsDistrict;
    }
  }

  for (const cityLabel of cityLabels) {
    const cityMatches = LOCATION_BY_NORMALIZED_NAME.get(cityLabel) ?? [];
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
