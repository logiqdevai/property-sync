import { ESTATEWEB_LOCATIONS } from '../constants/estateweb-locations.constants';
import {
  EstateWebLocation,
  EstateWebLocationCatalogItem,
} from '../interfaces/estateweb-location.interface';
import { normalizeEstateWebLabel } from './estateweb-init-lookup.util';

// The catalog spells common Greek place-name prefixes as abbreviations (e.g. "Αγ. Μελετίου",
// "Πλ. Βικτωρίας", "Λεωφ. Λιοσίων"), but AI-normalized/scraped city & district text usually
// spells them out in full ("Αγίου Μελετίου", "Πλατεία Βικτωρίας", "Λεωφόρος Λιοσίων"). Collapse
// both forms to the same token (per whitespace-delimited word, diacritic/case already stripped
// by normalizeEstateWebLabel) so exact-string matching still finds the catalog node.
const PLACE_WORD_ABBREVIATIONS: Record<string, string> = {
  αγιος: 'αγ',
  αγια: 'αγ',
  αγιου: 'αγ',
  αγιας: 'αγ',
  αγιοι: 'αγ',
  αγιων: 'αγ',
  'αγ.': 'αγ',
  πλατεια: 'πλ',
  πλατειας: 'πλ',
  'πλ.': 'πλ',
  λεωφορος: 'λεωφ',
  λεωφορου: 'λεωφ',
  'λεωφ.': 'λεωφ',
};

/** Like {@link normalizeEstateWebLabel}, plus canonicalizing common place-name abbreviations. */
function normalizeEstateWebPlaceLabel(input: string): string {
  return normalizeEstateWebLabel(input)
    .split(' ')
    .map((token) => PLACE_WORD_ABBREVIATIONS[token] ?? token)
    .join(' ');
}

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
    const key = normalizeEstateWebPlaceLabel(loc.name);
    const bucket = idx.get(key);
    if (bucket) bucket.push(loc);
    else idx.set(key, [loc]);
  }
  return idx;
})();

const LOCATION_NORMALIZED_SEGMENTS = new Map<number, string[]>(
  ESTATEWEB_LOCATIONS.map((loc) => [
    loc.id,
    loc.path.split(' » ').map((seg) => normalizeEstateWebPlaceLabel(seg)),
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
  malia: 'μαλια',
  stalis: 'σταλιδα',
  mesampelies: 'μεσαμπελιες',
  'agia varvara': 'αγια βαρβαρα',
  'epano sissi': 'επανω σισι',
  'epano sisi': 'επανω σισι',
  sissi: 'σισι',
  sisi: 'σισι',
  pyrgos: 'πυργος',
  plaka: 'πλακα',
  milatos: 'μιλατος',
  anogeia: 'ανωγεια',
  anogia: 'ανωγεια',
  elounda: 'ελουντα',
  skalani: 'σκαλανι',
  heraklion: 'ηρακλειο',
  heraklio: 'ηρακλειο',
  iraklio: 'ηρακλειο',
  lassithi: 'λασιθι',
  lasithi: 'λασιθι',
  chania: 'χανια',
  rethymno: 'ρεθυμνο',
  rethymnon: 'ρεθυμνο',
  neapoli: 'νεαπολη',
  kounali: 'κουναλι',
  gialia: 'γιαλια',
  ligaria: 'λυγαρια',
  'kokkini hani': 'κοκκινη χανι',
  // creta-invest.gr's "Area" field ships "Village (Municipality)" in Latin script (e.g.
  // "Kissamos (Kissamos)") -- these translate the Latin village/municipality names to the
  // exact normalized Greek catalog spelling so resolveParentheticalDistrict can match both
  // halves and disambiguate homonyms elsewhere in Greece via resolveRelatedToAnchor.
  akrotiri: 'ακρωτηρι',
  chersonisos: 'χερσονησος',
  episkopi: 'επισκοπη',
  gouves: 'γουβες',
  krousonas: 'κρουσωνας',
  georgioupoli: 'γεωργιουπολη',
  lampi: 'λαμπη',
  tzermiado: 'τζερμιαδο',
  'oropedio lasithiou': 'οροπεδιο λασιθιου',
  'makrys gialos': 'μακρυγιαλος',
  kissamos: 'κισσαμος',
  ierapetra: 'ιεραπετρα',
  // no plain "Αρχάνες" node exists in the catalog (only "Επάνω Αρχάνες" / "Κάτω Αρχάνες") --
  // map to the municipality instead of guessing upper vs. lower.
  archanes: 'δημος αρχανων αστερουσιων',
  // major towns that the AI usually already gets right from context, but whose Latin
  // spelling needs to resolve too now that the "Area" field can be tried as a fallback
  // when the AI's own city guess is a small village that isn't in the catalog at all.
  // Both have many same-named homonyms nationwide -- safe to add because callers always
  // filter candidate lists by preferredPathSegments (which forces 'κρητη' for Latin input)
  // before picking a match.
  'agios nikolaos': 'αγιος νικολαος',
  siteia: 'σητεια',
  irakleio: 'ηρακλειο',
  // Athens neighborhoods the AI/scraper commonly reports on their own, but the catalog only
  // has them as part of a compound node name.
  γκυζη: 'γκυζη αρειος παγος',
};

const REGION_PATH_HINTS: Array<{ re: RegExp; segment: string }> = [
  { re: /\bcrete\b|\bκρητη\b/i, segment: 'κρητη' },
  { re: /\blassithi\b|\blasithi\b|\bλασιθι\b/i, segment: 'λασιθι' },
  { re: /\bheraklion\b|\bheraklio\b|\biraklio\b|\bηρακλειο\b/i, segment: 'ηρακλειο' },
  { re: /\bchania\b|\bχανια\b/i, segment: 'χανια' },
  { re: /\brethymno\b|\brethymnon\b|\bρεθυμνο\b/i, segment: 'ρεθυμνο' },
  { re: /\bspinalonga\b/i, segment: 'αγιου νικολαου' },
  { re: /\bsissi\b|\bsisi\b|\bσισι\b|\bσίσσι\b/i, segment: 'λασιθι' },
  { re: /\bmilatos\b|\bμιλατος\b|\bμίλατος\b/i, segment: 'λασιθι' },
];

const TITLE_PLACE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bmilatos\b/i, label: 'μιλατος' },
  { re: /\bsissi\b|\bsisi\b/i, label: 'σισι' },
  { re: /\bskalani\b/i, label: 'σκαλανι' },
  { re: /\banogeia\b|\banogia\b/i, label: 'ανωγεια' },
  { re: /\bmalia\b/i, label: 'μαλια' },
  { re: /\belounda\b/i, label: 'ελουντα' },
  { re: /\bagia\s+varvara\b/i, label: 'αγια βαρβαρα' },
  { re: /\bstalis\b/i, label: 'σταλιδα' },
  { re: /\bepano\s+sissi\b|\bepano\s+sisi\b/i, label: 'επανω σισι' },
  { re: /\bpyrgos\b/i, label: 'πυργος' },
  { re: /\bplaka\b/i, label: 'πλακα' },
  { re: /\bmesampelies\b/i, label: 'μεσαμπελιες' },
  { re: /\bneapoli\b/i, label: 'νεαπολη' },
];

const DISTRICT_EXPANSIONS: Record<string, string[]> = {
  πυργος: ['πυργος (βραχασι)', 'πυργος (αγιος νικολαος)'],
};

export type EstateWebLocationResolveHints = {
  preferredPathSegments?: string[];
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
  const raw = normalizeEstateWebPlaceLabel(city);
  if (!raw) return { labels: [], preferPeripheral: false };

  const preferPeripheral = PERIPHERAL_CITY_LABELS.has(raw);
  const labels: string[] = [];
  const push = (value: string) => {
    if (value && !labels.includes(value)) labels.push(value);
  };

  push(raw);
  const aliased = CITY_ALIASES[raw];
  if (aliased) push(aliased);

  // "Α - Β" compound labels are sometimes catalogued as a plain-space name ("Α Β") instead --
  // try that variant too (safe: verified against the full catalog to never collide with a
  // distinct dash-containing entry).
  const dashCollapsed = raw.replace(/\s*[-–]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (dashCollapsed !== raw) push(dashCollapsed);

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

  // City sometimes carries its own "Neighborhood (Street A - Street B)" suffix with no
  // separate `district` given -- try just the neighborhood part too.
  const parenthetical = parseParentheticalParts(raw);
  if (parenthetical) push(parenthetical.outer);

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
  const raw = normalizeEstateWebPlaceLabel(district);
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
  const aliased = CITY_ALIASES[raw];
  const expansionSource = aliased ?? raw;
  const expansions = DISTRICT_EXPANSIONS[expansionSource];
  if (expansions) {
    for (const expansion of expansions) push(expansion);
  }
  if (aliased) push(aliased);
  for (let i = parts.length - 1; i >= 0; i--) {
    push(parts[i]);
    const partAlias = CITY_ALIASES[parts[i]];
    if (partAlias) push(partAlias);
  }
  return labels;
}

function filterByPreferredPath(
  candidates: EstateWebLocation[],
  preferredPathSegments?: string[],
): EstateWebLocation[] {
  if (!preferredPathSegments?.length || candidates.length <= 1) {
    return candidates;
  }
  let filtered = candidates;
  for (const segment of preferredPathSegments) {
    const next = filtered.filter((loc) =>
      (LOCATION_NORMALIZED_SEGMENTS.get(loc.id) ?? []).includes(segment),
    );
    if (next.length > 0) filtered = next;
  }
  return filtered;
}

export function inferPreferredPathSegments(
  ...texts: Array<string | null | undefined>
): string[] {
  const blob = texts.filter(Boolean).join(' ');
  if (!blob) return [];
  const segments: string[] = [];
  for (const hint of REGION_PATH_HINTS) {
    if (hint.re.test(blob) && !segments.includes(hint.segment)) {
      segments.push(hint.segment);
    }
  }
  return segments;
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
        matchesCity(candidate, normalizeEstateWebPlaceLabel(anchor.name))
      ) {
        related.push(candidate);
        break;
      }
    }
  }

  return related.length > 0 ? pickMostSpecific(related) : undefined;
}

/**
 * Catalog + alias lookup for a single free-text label (e.g. a "Village (Municipality)"
 * half). Tries the raw normalized label first, then any CITY_ALIASES translation (this is
 * how a Latin name like "kissamos" reaches the Greek catalog entry "Κίσσαμος") --
 * generically applicable to any place label, not just city-shaped ones.
 */
function matchesForLabel(raw: string): EstateWebLocation[] {
  const { labels } = expandCityLabels(raw);
  const seen = new Set<number>();
  const out: EstateWebLocation[] = [];
  for (const label of labels) {
    for (const loc of LOCATION_BY_NORMALIZED_NAME.get(label) ?? []) {
      if (!seen.has(loc.id)) {
        seen.add(loc.id);
        out.push(loc);
      }
    }
  }
  return out;
}

function resolveParentheticalDistrict(
  district: string,
  cityLabels: string[],
  preferPeripheral: boolean,
  preferredPathSegments?: string[],
): EstateWebLocation | undefined {
  const parsed = parseParentheticalParts(district);
  if (!parsed) return undefined;

  const outerNorm = normalizeEstateWebPlaceLabel(parsed.outer);
  const innerNorm = normalizeEstateWebPlaceLabel(parsed.inner);
  if (!outerNorm || !innerNorm) return undefined;

  // Filter the CANDIDATE LISTS (not just the final pick) by the known region --
  // when outer and inner are the same word (e.g. "Chania (Chania)", the town is also
  // its own municipality seat), resolveRelatedToAnchor treats every same-named node as
  // "related to itself", so an unrelated same-named village elsewhere in Greece at the
  // same catalog depth (e.g. "Χάνια" near Volos vs. Crete's "Χανιά") can otherwise win
  // a same-level id tie-break purely by having a smaller id.
  const outerMatches = filterByPreferredPath(
    matchesForLabel(parsed.outer),
    preferredPathSegments,
  );
  const innerMatches = filterByPreferredPath(
    matchesForLabel(parsed.inner),
    preferredPathSegments,
  );

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

function isKnownCatalogLabel(normalizedLabel: string): boolean {
  return (LOCATION_BY_NORMALIZED_NAME.get(normalizedLabel) ?? []).length > 0;
}

function resolveByDistrict(
  districtLabel: string,
  cityLabels: string[],
  preferPeripheral: boolean,
  preferredPathSegments?: string[],
): EstateWebLocation | undefined {
  const districtMatches = filterByPreferredPath(
    LOCATION_BY_NORMALIZED_NAME.get(districtLabel) ?? [],
    preferredPathSegments,
  );
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
    scoped = filterByPreferredPath(scoped, preferredPathSegments);
    const picked = pickMostSpecific(scoped);
    if (picked) return picked;
  }

  const anyKnownCity = cityLabels.some(isKnownCatalogLabel);
  if (!anyKnownCity || districtMatches.length === 1) {
    return pickMostSpecific(districtMatches);
  }

  return undefined;
}

/**
 * Resolve the EstateWeb internal location node from free-text `city` / `district`.
 *
 * Deterministic strategy:
 * 1. Prefer `district` (and comma/slash segments, deepest-first). When a `city`
 *    is also given, keep only district nodes whose ancestor path contains that
 *    city (after alias/genitive normalization). If the city label is not in the
 *    catalog (e.g. marketing region "Νότια Κρήτη"), or the district name is
 *    unique, fall back to the unscoped district match.
 * 2. For compound districts like `"Καλαμαριά, Αρετσού"`, also try the left
 *    segment as city and the right as district.
 * 3. Fall back to `city`, preferring the canonical city node (`is_city`, then
 *    shallowest level).
 * 4. Return `undefined` when there is no confident match.
 */
export function resolveEstateWebLocation(
  city?: string | null,
  district?: string | null,
  hints?: EstateWebLocationResolveHints,
): EstateWebLocation | undefined {
  const preferredPathSegments = hints?.preferredPathSegments;
  const { labels: cityLabels, preferPeripheral } = expandCityLabels(city);
  const districtLabels = expandDistrictLabels(district);

  for (const districtLabel of districtLabels) {
    const byDistrict = resolveByDistrict(
      districtLabel,
      cityLabels,
      preferPeripheral,
      preferredPathSegments,
    );
    if (byDistrict) return byDistrict;
  }

  if (district) {
    const byParenthetical = resolveParentheticalDistrict(
      district,
      cityLabels,
      preferPeripheral,
      preferredPathSegments,
    );
    if (byParenthetical) return byParenthetical;
  }

  if (district) {
    const compoundParts = normalizeEstateWebPlaceLabel(district)
      .split(/\s*[,|/]\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (compoundParts.length >= 2) {
      const left = compoundParts[0];
      const right = compoundParts[compoundParts.length - 1];
      const byCompound = resolveByDistrict(
        right,
        [left, ...cityLabels],
        false,
        preferredPathSegments,
      );
      if (byCompound) return byCompound;
      const leftAsDistrict = resolveByDistrict(
        left,
        cityLabels,
        preferPeripheral,
        preferredPathSegments,
      );
      if (leftAsDistrict) return leftAsDistrict;
    }
  }

  for (const cityLabel of cityLabels) {
    const cityMatches = filterByPreferredPath(
      LOCATION_BY_NORMALIZED_NAME.get(cityLabel) ?? [],
      preferredPathSegments,
    );
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
  hints?: EstateWebLocationResolveHints,
): number | null {
  return resolveEstateWebLocation(city, district, hints)?.id ?? null;
}

export function resolveEstateWebLocationFromSources(input: {
  city?: string | null;
  district?: string | null;
  rawLocation?: string | null;
  title?: string | null;
  description?: string | null;
}): EstateWebLocation | undefined {
  const preferredPathSegments = inferPreferredPathSegments(
    input.title,
    input.description,
    input.rawLocation,
    input.city,
    input.district,
  );
  const latinRaw =
    !!input.rawLocation && isMostlyLatinLabel(input.rawLocation);
  if (latinRaw && !preferredPathSegments.includes('κρητη')) {
    preferredPathSegments.unshift('κρητη');
  }
  if (
    latinRaw &&
    !preferredPathSegments.some((segment) =>
      ['λασιθι', 'ηρακλειο', 'χανια', 'ρεθυμνο'].includes(segment),
    )
  ) {
    preferredPathSegments.push('λασιθι');
  }
  const hints: EstateWebLocationResolveHints = { preferredPathSegments };

  const primary = resolveEstateWebLocation(input.city, input.district, hints);

  const fromRaw = input.rawLocation
    ? (resolveEstateWebLocation(null, input.rawLocation, hints) ??
      resolveEstateWebLocation(input.rawLocation, null, hints))
    : undefined;

  // `rawLocation` (e.g. a scraped "Village (Municipality)" field) is agency-authored
  // structured data -- when it resolves to a deeper catalog node than the free-text
  // city/district match (which can bottom out as broad as the whole island "Κρήτη"),
  // trust the more specific one instead of always favoring city/district.
  if (primary && fromRaw) {
    return fromRaw.level > primary.level ? fromRaw : primary;
  }
  if (primary) return primary;
  if (fromRaw) return fromRaw;

  const placeText = [input.title, input.description]
    .filter(Boolean)
    .join('\n');
  if (placeText) {
    for (const pattern of TITLE_PLACE_PATTERNS) {
      if (!pattern.re.test(placeText)) continue;
      const fromText =
        resolveEstateWebLocation(null, pattern.label, hints) ??
        resolveEstateWebLocation(pattern.label, null, hints);
      if (fromText) return fromText;
    }
  }

  // Last resort: the specific city/village couldn't be pinned down -- e.g. a small village
  // that either isn't in the catalog at all, or is spelled differently there. Rather than
  // leaving estateweb_location_id permanently null (which blocks CMS sync entirely), fall
  // back to the broader region we're already confident about from `preferredPathSegments`.
  // Only ever resolves to an unambiguous node: a real `is_city` anchor for a named prefecture
  // (Χανιά/Ρέθυμνο/Ηράκλειο/Λασίθι all have one), or -- if we only know it's Crete generally
  // -- the single, unique island-level "Κρήτη" node. Never guesses a specific village, and
  // never picks a same-named-but-wrong-region homonym (there are unrelated "Χανιά" villages
  // elsewhere in Greece; requiring `is_city` here excludes those).
  if (preferredPathSegments.length > 0) {
    for (const segment of preferredPathSegments) {
      const cityNode = (LOCATION_BY_NORMALIZED_NAME.get(segment) ?? []).find(
        (loc) => loc.is_city,
      );
      if (cityNode) return cityNode;
    }
    const islandMatches = LOCATION_BY_NORMALIZED_NAME.get('κρητη') ?? [];
    if (islandMatches.length === 1) return islandMatches[0];
  }

  return undefined;
}

function isMostlyLatinLabel(value: string): boolean {
  const letters = value.replace(/[^\p{L}]/gu, '');
  if (!letters) return false;
  const latinCount = (letters.match(/[A-Za-z]/g) ?? []).length;
  return latinCount / letters.length >= 0.8;
}

export function resolveEstateWebLocationIdFromSources(input: {
  city?: string | null;
  district?: string | null;
  rawLocation?: string | null;
  title?: string | null;
  description?: string | null;
}): number | null {
  return resolveEstateWebLocationFromSources(input)?.id ?? null;
}
