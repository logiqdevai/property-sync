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

// Catalog municipality nodes are named "Δήμος <Genitive>" (e.g. "Δήμος Αποκορώνου"), but
// scraped/AI-normalized district text and Google's own admin-area names essentially never
// spell out the word "Δήμος" (see root cause #2 in ESTATEWEB-LOCATION-ACCURACY-FIXES.md) --
// they give the bare genitive/nominative name instead. Index every such node under its bare
// name too, so "Αποκορώνου" alone still finds "Δήμος Αποκορώνου".
const MUNICIPALITY_PREFIX = 'δημος ';

const LOCATION_BY_NORMALIZED_NAME: Map<string, EstateWebLocation[]> = (() => {
  const idx = new Map<string, EstateWebLocation[]>();
  const add = (key: string, loc: EstateWebLocation) => {
    const bucket = idx.get(key);
    if (bucket) bucket.push(loc);
    else idx.set(key, [loc]);
  };
  for (const loc of ESTATEWEB_LOCATIONS) {
    add(normalizeEstateWebPlaceLabel(loc.name), loc);
  }
  // Second pass: only fill genuine gaps. A handful of municipality bare names collide with
  // an unrelated real catalog entry elsewhere (e.g. "Δήμος Πύργου" in Ilia vs. the settlement
  // "Πυργού" in Crete) -- never shadow/ambiguously-merge an existing name, only add the bare
  // form where nothing was already indexed under it.
  for (const loc of ESTATEWEB_LOCATIONS) {
    const key = normalizeEstateWebPlaceLabel(loc.name);
    if (!key.startsWith(MUNICIPALITY_PREFIX)) continue;
    const bare = key.slice(MUNICIPALITY_PREFIX.length);
    if (!idx.has(bare)) add(bare, loc);
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
  // "Αποκόρωνας"/"Αποκορώνας" (the modern, colloquial nominative spelling everyone actually
  // writes) is an irregular alternate lemma of the catalog's formal "Δήμος Αποκορώνου" --
  // not reachable via regular Greek declension (guessGreekGenitive only covers the regular
  // -ος/-ου pair, e.g. Google's own "Αποκόρωνος"). See root cause #9 in
  // ESTATEWEB-LOCATION-ACCURACY-FIXES.md.
  αποκορωνας: 'αποκορωνου',
  αποκορωνα: 'αποκορωνου',
  // Irregular genitive -> catalog-prefecture pairs no suffix rewrite can bridge (see
  // expandGoogleAdminSegment and root cause #10 in ESTATEWEB-LOCATION-ACCURACY-FIXES.md).
  δωδεκανησου: 'δωδεκανησα',
  πελλης: 'πελης', // catalog spells it "Πέλης" (single λ)
  πειραιως: 'πειραιας',
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
  // Catalog prefecture segments (path[1]) the property is KNOWN to be in -- only derived from
  // Google reverse-geocoding the property's own coordinates. Unlike preferredPathSegments
  // (soft: a segment that would empty the candidate list is skipped), candidates outside all
  // of these are rejected outright. See root cause #12 in ESTATEWEB-LOCATION-ACCURACY-FIXES.md.
  requiredPrefectureSegments?: string[];
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
  if (normalized.endsWith('ου') && normalized.length > 3) {
    return normalized.slice(0, -2) + 'ος';
  }
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

// Inverse of stripGreekGenitive's "-ος -> -ου" pair: municipality catalog nodes are named
// with the region's genitive ("Δήμος Αποκορώνου"), but Google/scraped text usually gives the
// plain nominative ("Αποκόρωνος") -- this is a completely regular, productive Greek 2nd-
// declension pattern (also e.g. Ρόδος/Ρόδου, Νάξος/Νάξου), unlike the -ης/-ας/-ων pairs above
// which stripGreekGenitive already treats as genitive-shaped input. Only the -ος/-ου
// direction is added here: -α/-η endings are ambiguous between nominative and an already-
// genitive-looking form for this catalog's naming style, so guessing would risk false matches.
function guessGreekGenitive(normalized: string): string | null {
  if (normalized.endsWith('ος') && normalized.length > 3) {
    return normalized.slice(0, -2) + 'ου';
  }
  return null;
}

// Per-word nominative -> genitive suffix guesses, used only to try to land on an already
// bare-indexed "Δήμος <Genitive>" municipality node (see guessMunicipalityGenitivePhrase
// below) -- never used standalone the way guessGreekGenitive is, because on its own a
// -η/-α guess is too easily a false match for an unrelated catalog entry (the same
// ambiguity guessGreekGenitive's own comment calls out). Restricting every use to "must
// land on a real municipality node" is what makes adding the -η/-α pairs here safe.
const NOMINATIVE_TO_GENITIVE_WORD_SUFFIXES: Array<[nominative: string, genitive: string]> = [
  ['ος', 'ου'], // masc/neut 2nd declension, e.g. Αποκόρωνος -> Αποκορώνου
  ['η', 'ης'], // fem 1st declension, e.g. Παρασκευή -> Παρασκευής
  ['α', 'ας'], // fem 1st declension, e.g. Καλλιθέα -> Καλλιθέας
];

// PLACE_WORD_ABBREVIATIONS already collapses "Αγία"/"Αγίας"/"Άγιος"/... to the same "αγ"
// token on both the input and the catalog side, so an already-abbreviated word never has a
// declined ending left to guess from (and doesn't need one -- both sides already agree).
// Passing it through unconverted, instead of failing the whole phrase, is what lets e.g.
// "Αγία Παρασκευή" -> "αγ παρασκευη" still find "Δήμος Αγίας Παρασκευής" -> "αγ παρασκευης".
const PLACE_WORD_ABBREVIATION_OUTPUTS = new Set(
  Object.values(PLACE_WORD_ABBREVIATIONS),
);

function guessGreekGenitiveWord(word: string): string | null {
  if (PLACE_WORD_ABBREVIATION_OUTPUTS.has(word)) return word;
  for (const [nomSuffix, genSuffix] of NOMINATIVE_TO_GENITIVE_WORD_SUFFIXES) {
    if (word.endsWith(nomSuffix) && word.length > nomSuffix.length + 1) {
      return word.slice(0, -nomSuffix.length) + genSuffix;
    }
  }
  return null;
}

// Catalog municipality nodes are named "Δήμος <Genitive>", and a genitive Greek place name
// is often a whole declined phrase, not one word (e.g. "Δήμος Αγίας Παρασκευής", "Δήμος
// Παλαιού Φαλήρου") -- root cause #9's bare-municipality indexing and guessGreekGenitive
// only ever reach a single-word "-ος -> -ου" municipality name (e.g. "Αποκορώνου"), so any
// multi-word or -η/-α ending municipality (a real, common shape: Greek adjectives like
// "Αγία"/"Νέα"/"Παλαιά" decline together with the noun they modify) still falls through to
// the same "no district match -> pick a same-named neighborhood homonym by tree depth"
// failure as #9's original bug, just for a different declension pattern (see root cause #13
// in ESTATEWEB-LOCATION-ACCURACY-FIXES.md, e.g. "Αγία Παρασκευή" (Athens) landing on
// Heraklion's same-named neighborhood instead of Athens' own "Δήμος Αγίας Παρασκευής").
// Guesses per word and only trusts the result when it lands on a real indexed municipality
// node -- a wrong per-word guess (a Greek word that isn't 1st/2nd declension, or is already
// genitive) will not coincidentally spell a real "Δήμος <X>" name, so this stays safe without
// needing to know Greek grammar exceptions the way the genuinely irregular cases
// (CITY_ALIASES) do.
function guessMunicipalityGenitivePhrase(normalized: string): string | null {
  const words = normalized.split(' ').filter(Boolean);
  if (words.length === 0) return null;
  const converted = words.map(guessGreekGenitiveWord);
  if (converted.some((word) => word == null)) return null;
  const phrase = converted.join(' ');
  const candidates = LOCATION_BY_NORMALIZED_NAME.get(phrase);
  const isMunicipality = candidates?.some((loc) =>
    normalizeEstateWebPlaceLabel(loc.name).startsWith(MUNICIPALITY_PREFIX),
  );
  return isMunicipality ? phrase : null;
}

// Every catalog prefecture-level segment (path[1], e.g. "Σάμος" in "Νησιά Αιγαίου » Σάμος"),
// used to validate candidate nominatives derived from Google's legacy "Νομός <Genitive>" form.
const PREFECTURE_SEGMENTS = new Set<string>(
  ESTATEWEB_LOCATIONS.map((loc) => LOCATION_NORMALIZED_SEGMENTS.get(loc.id)?.[1]).filter(
    (segment): segment is string => !!segment,
  ),
);

// Genitive -> nominative rewrites seen across Greek prefecture names. Unlike the
// municipality case there's no single regular rule (Σάμου->Σάμος, Ηρακλείου->Ηράκλειο,
// Χανίων->Χανιά, Κυκλάδων->Κυκλάδες, Ρεθύμνου->Ρέθυμνο, Λασιθίου->Λασίθι, Λευκάδας->Λευκάδα,
// Ξάνθης->Ξάνθη), so every plausible rewrite is generated and only the ones that name a real
// catalog prefecture segment are kept.
const GENITIVE_TO_NOMINATIVE_REWRITES: Array<[suffix: string, replacements: string[]]> = [
  ['ου', ['ος', 'ο', 'ι']],
  ['ης', ['η', 'α']],
  ['ας', ['α']],
  ['ων', ['α', 'ες']],
];

const GOOGLE_ADMIN_PREFIXES = ['νομος ', 'περιφερειακη ενοτητα '];

// Google's administrative hierarchy for the South Aegean never names the catalog's
// old-nomos-style group prefecture ("Κυκλάδες", "Δωδεκάνησα") at ANY level -- for a specific
// island's coordinates it jumps straight from the broad region ("Περιφέρεια Νοτίου Αιγαίου")
// to the island/municipality name itself (verified live: administrative_area_level_3 for
// Naxos, Paros, Mykonos, Rhodes all return the bare island name, never "Κυκλάδες" or
// "Δωδεκάνησα"). Single-island prefectures (Σάμος, Λέσβος, Χίος) don't have this gap --
// Google's island name already equals the catalog's prefecture segment there (see root cause
// #10 in ESTATEWEB-LOCATION-ACCURACY-FIXES.md). Without this, a same-named-nationwide label
// (e.g. "Γαλήνη", 12 nodes all at the same catalog depth) has no hint segment in common with
// the correct Cyclades/Dodecanese node at all, and falls back to an effectively arbitrary
// smallest-id tie-break (root cause #14). Curated from the catalog's own municipality list
// under "Νησιά Αιγαίου » Κυκλάδες"/"» Δωδεκάνησα" (verified against ESTATEWEB_LOCATIONS);
// Θήρα/Σαντορίνη both included since Google returns both forms across admin levels.
const ISLAND_PREFECTURE_SEGMENT: Record<string, string> = {
  αμοργος: 'κυκλαδες',
  αναφη: 'κυκλαδες',
  ανδρος: 'κυκλαδες',
  αντιπαρος: 'κυκλαδες',
  θηρα: 'κυκλαδες',
  σαντορινη: 'κυκλαδες',
  ιος: 'κυκλαδες',
  κεα: 'κυκλαδες',
  κιμωλος: 'κυκλαδες',
  κυθνος: 'κυκλαδες',
  μηλος: 'κυκλαδες',
  μυκονος: 'κυκλαδες',
  ναξος: 'κυκλαδες',
  παρος: 'κυκλαδες',
  σεριφος: 'κυκλαδες',
  σικινος: 'κυκλαδες',
  σιφνος: 'κυκλαδες',
  συρος: 'κυκλαδες',
  τηνος: 'κυκλαδες',
  φολεγανδρος: 'κυκλαδες',
  αγαθονησι: 'δωδεκανησα',
  αστυπαλαια: 'δωδεκανησα',
  καλυμνος: 'δωδεκανησα',
  καρπαθος: 'δωδεκανησα',
  κασος: 'δωδεκανησα',
  κως: 'δωδεκανησα',
  λειψοι: 'δωδεκανησα',
  λερος: 'δωδεκανησα',
  μεγιστη: 'δωδεκανησα',
  καστελοριζο: 'δωδεκανησα',
  νισυρος: 'δωδεκανησα',
  πατμος: 'δωδεκανησα',
  ροδος: 'δωδεκανησα',
  συμη: 'δωδεκανησα',
  τηλος: 'δωδεκανησα',
  χαλκη: 'δωδεκανησα',
};

/**
 * Google's forward geocoding (address text, no coordinates) names the prefecture in its
 * legacy form -- "Νομός Σάμου" (administrative_area_level_3) -- which never equals a catalog
 * path segment ("Σάμος"), so the whole hint was silently ignored and the resolver fell back
 * to picking a same-named homonym by tree depth (root cause #10 in
 * ESTATEWEB-LOCATION-ACCURACY-FIXES.md). Returns the segment itself plus, when it has a
 * "Νομός"/"Περιφερειακή Ενότητα" prefix, the bare genitive and any nominative that resolves
 * to a real catalog prefecture; also resolves a bare South Aegean island name (with or
 * without that prefix) to its catalog group prefecture via ISLAND_PREFECTURE_SEGMENT.
 */
function expandGoogleAdminSegment(normalized: string): string[] {
  const out = [normalized];

  const islandPrefecture = ISLAND_PREFECTURE_SEGMENT[normalized];
  if (islandPrefecture && !out.includes(islandPrefecture)) {
    out.push(islandPrefecture);
  }

  const prefix = GOOGLE_ADMIN_PREFIXES.find((p) => normalized.startsWith(p));
  if (!prefix) return out;

  const bare = normalized.slice(prefix.length).trim();
  if (!bare) return out;
  out.push(bare);

  const candidates = new Set<string>();
  const alias = CITY_ALIASES[bare];
  if (alias) candidates.add(alias);
  const bareIslandPrefecture = ISLAND_PREFECTURE_SEGMENT[bare];
  if (bareIslandPrefecture) candidates.add(bareIslandPrefecture);
  for (const [suffix, replacements] of GENITIVE_TO_NOMINATIVE_REWRITES) {
    if (!bare.endsWith(suffix) || bare.length <= suffix.length + 1) continue;
    for (const replacement of replacements) {
      candidates.add(bare.slice(0, -suffix.length) + replacement);
    }
  }
  for (const candidate of candidates) {
    if (PREFECTURE_SEGMENTS.has(candidate) && !out.includes(candidate)) {
      out.push(candidate);
    }
  }
  return out;
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

  // Note: unlike district labels below, a municipality-genitive guess is NOT added to this
  // list -- resolveEstateWebLocation's final city fallback computes it separately and only
  // uses it to override an already-found cityResult when that result has no relation to the
  // guessed municipality (see root cause #13 in ESTATEWEB-LOCATION-ACCURACY-FIXES.md).
  // Adding it here would make it just another label in the existing "first label with any
  // match wins" loop, which either shadows it behind the raw label's own (possibly wrong)
  // homonym match, or -- if given priority -- coarsens already-correct raw matches (e.g. "Νέα
  // Σμύρνη" -> its own specific town node) down to the broader bare municipality node.

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
  // A district given in the plain nominative ("Αποκόρωνος") won't match the catalog's
  // genitive-cased municipality name ("Δήμος Αποκορώνου", now also bare-indexed as
  // "Αποκορώνου") without this -- see MUNICIPALITY_PREFIX indexing above.
  const genitiveGuess = guessGreekGenitive(raw);
  if (genitiveGuess) push(genitiveGuess);
  // Note: unlike expandCityLabels, guessMunicipalityGenitivePhrase is deliberately NOT added
  // here. resolveByDistrict returns on the first district label with any match, unscoped by
  // city when no city-scoped match exists (its "unique district" fallback) -- a municipality
  // guess added as just another label can win that fallback with NO relation to the actual
  // city at all (e.g. city "Νεοχωρούδα", a Thessaloniki-area village, district "Καλλιθέα" ->
  // this guess would jump to Athens' unrelated "Δήμος Καλλιθέας" -- a real regression caught
  // while verifying root cause #13's backfill, unlike the city-side version, which has an
  // explicit conflict guard; adding an equivalent guard here was left out of scope). The
  // primary root cause #13 bug case (bare city, no district) is unaffected by this.
  for (let i = parts.length - 1; i >= 0; i--) {
    push(parts[i]);
    const partAlias = CITY_ALIASES[parts[i]];
    if (partAlias) push(partAlias);
  }
  return labels;
}

// The catalog splits Attica into four prefectures, which Google's names don't line up with
// (a Piraeus or East Attica point can come back with just "Αθήνα") -- treat them as one
// region for the hard prefecture constraint.
const ATTICA_PREFECTURE_SEGMENTS = ['αθηνα', 'ανατολικη αττικη', 'δυτικη αττικη', 'πειραιας'];

// Whether `text` names a real catalog prefecture that ISN'T among `allowedSegments` --
// guards guessMunicipalityGenitivePhrase (see resolveEstateWebLocation) against a case like
// district "Ρέθυμνο" (Crete) with city "Καλλιθέα" (whose only exact-name municipality
// nationwide is in Athens): without this, the guess would jump the whole property across the
// country on nothing but "Καλλιθέα" being a unique municipality name, ignoring an explicit,
// specific, conflicting region the text already names. Deliberately NOT implemented via a
// REGION_PATH_HINTS-style `\b`-delimited regex -- `\b` never matches around Greek letters in
// a non-Unicode-mode JS regex (Greek letters aren't `\w`), so that style of pattern silently
// never fires for Greek text at all (only for the Latin transliteration alternatives already
// in REGION_PATH_HINTS) -- a separate, pre-existing gap this doesn't attempt to fix more
// broadly. Token-boundary-safe via space-padding instead.
function textMentionsConflictingPrefecture(
  text: string | null | undefined,
  allowedSegments: string[],
): boolean {
  if (!text) return false;
  const padded = ` ${normalizeEstateWebPlaceLabel(text)} `;
  for (const prefecture of PREFECTURE_SEGMENTS) {
    if (allowedSegments.includes(prefecture)) continue;
    if (padded.includes(` ${prefecture} `)) return true;
  }
  return false;
}

function isInRequiredPrefecture(
  loc: EstateWebLocation,
  requiredPrefectureSegments: string[],
): boolean {
  const prefecture = LOCATION_NORMALIZED_SEGMENTS.get(loc.id)?.[1];
  if (!prefecture) return false;
  if (requiredPrefectureSegments.includes(prefecture)) return true;
  return (
    ATTICA_PREFECTURE_SEGMENTS.includes(prefecture) &&
    requiredPrefectureSegments.some((s) => ATTICA_PREFECTURE_SEGMENTS.includes(s))
  );
}

function filterByPreferredPath(
  candidates: EstateWebLocation[],
  hints?: EstateWebLocationResolveHints,
): EstateWebLocation[] {
  const required = hints?.requiredPrefectureSegments;
  if (required?.length) {
    candidates = candidates.filter((loc) => isInRequiredPrefecture(loc, required));
  }
  const preferredPathSegments = hints?.preferredPathSegments;
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
      const anchorName = normalizeEstateWebPlaceLabel(anchor.name);
      // The anchor is a bare nominative label (e.g. "Αγία Παρασκευή" from a "Village
      // (Municipality)"-shaped district), but a candidate nested under that municipality
      // carries it in genitive form in ITS OWN path ("Δήμος Αγίας Παρασκευής") -- an exact
      // matchesCity(candidate, anchorName) never matches across that declension gap (same
      // class of bug guessMunicipalityGenitivePhrase fixed for the plain city/district
      // fallback in root cause #13, never wired in here). Without this, a candidate that IS
      // the correct match (e.g. "Παράδεισος", child of "Δήμος Αγίας Παρασκευής") looks
      // unrelated to its own anchor, and an unrelated same-named-anchor homonym elsewhere in
      // the same broad region (e.g. a different municipality's own tiny "Αγία Παρασκευή"
      // settlement) can win the id-tiebreak fallback below instead.
      // matchesCity checks full path SEGMENTS verbatim (LOCATION_NORMALIZED_SEGMENTS is the
      // raw catalog path text, never bare-indexed) -- the municipality segment itself is
      // "Δήμος <Genitive>", so the guessed phrase must be re-prefixed to match it; comparing
      // the bare phrase directly (as the LOCATION_BY_NORMALIZED_NAME lookup inside
      // guessMunicipalityGenitivePhrase does) would never equal that segment string.
      const anchorMunicipalityGenitive = guessMunicipalityGenitivePhrase(anchorName);
      if (
        sameParent ||
        isDescendantOf(candidate, anchor.id) ||
        matchesCity(candidate, anchorName) ||
        (anchorMunicipalityGenitive != null &&
          matchesCity(candidate, MUNICIPALITY_PREFIX + anchorMunicipalityGenitive))
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
  hints?: EstateWebLocationResolveHints,
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
    hints,
  );
  const innerMatches = filterByPreferredPath(
    matchesForLabel(parsed.inner),
    hints,
  );

  const related = resolveRelatedToAnchor(outerMatches, innerMatches);
  if (related) return related;

  const scopedOuter = resolveByDistrict(
    outerNorm,
    [innerNorm, ...cityLabels],
    preferPeripheral,
    hints,
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
  hints?: EstateWebLocationResolveHints,
): EstateWebLocation | undefined {
  const allDistrictMatches = LOCATION_BY_NORMALIZED_NAME.get(districtLabel) ?? [];
  const districtMatches = filterByPreferredPath(allDistrictMatches, hints);
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
    scoped = filterByPreferredPath(scoped, hints);
    const picked = pickMostSpecific(scoped);
    if (picked) return picked;
  }

  const anyKnownCity = cityLabels.some(isKnownCatalogLabel);
  // Judge uniqueness without requiredPrefectureSegments: a name left with one node only
  // because the prefecture filter removed its homonyms (e.g. "Κέντρο" -> just Athens'
  // Παγκράτι » Κέντρο) says nothing about the scraped city being wrong.
  const uniqueDistrict =
    districtMatches.length === 1 &&
    filterByPreferredPath(allDistrictMatches, {
      preferredPathSegments: hints?.preferredPathSegments,
    }).length === 1;
  if (!anyKnownCity || uniqueDistrict) {
    const fallback = pickMostSpecific(districtMatches);
    // The bare-municipality-name indexing above means a district label can now resolve
    // to a municipality node that is the ANCESTOR of an already-known, more specific city
    // match (e.g. district "Αποκορώνας" -> "Δήμος Αποκορώνου", city "Κεφαλάς" -> one of its
    // own villages) -- matchesCity above only catches the district match being a
    // descendant/sibling of the city, not this reverse shape. Prefer the city's own node
    // when it's nested under the district fallback, instead of silently coarsening an
    // already-correct, more specific match down to its parent municipality.
    if (fallback) {
      for (const cityLabel of cityLabels) {
        const nested = (LOCATION_BY_NORMALIZED_NAME.get(cityLabel) ?? []).find((loc) =>
          isDescendantOf(loc, fallback.id),
        );
        if (nested) return nested;
      }
    }
    return fallback;
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
  const { labels: cityLabels, preferPeripheral } = expandCityLabels(city);
  const districtLabels = expandDistrictLabels(district);

  // "Χαλκιδική / Παλλήνη": the catalog's only Παλλήνη is in Athens, and as a unique district
  // name it would win below. Stop at the prefecture the city names; refineBarePrefecture
  // takes it down to the aliased municipality (or the village, from coordinates). Not when
  // another district part already names a place there ("Παλλήνη, Πευκοχώρι").
  for (const cityLabel of cityLabels) {
    const aliases = PREFECTURE_AREA_ALIASES[cityLabel];
    if (!aliases || !districtLabels.some((label) => aliases[label] != null)) continue;
    const prefecture = (LOCATION_BY_NORMALIZED_NAME.get(cityLabel) ?? []).find(
      (loc) => loc.level === PREFECTURE_LEVEL,
    );
    const districtNamesPlaceInside =
      !!prefecture &&
      districtLabels.some((label) =>
        (LOCATION_BY_NORMALIZED_NAME.get(label) ?? []).some((loc) =>
          isDescendantOf(loc, prefecture.id),
        ),
      );
    if (prefecture && !districtNamesPlaceInside) return prefecture;
  }

  for (const districtLabel of districtLabels) {
    const byDistrict = resolveByDistrict(
      districtLabel,
      cityLabels,
      preferPeripheral,
      hints,
    );
    if (byDistrict) return byDistrict;
  }

  if (district) {
    const byParenthetical = resolveParentheticalDistrict(
      district,
      cityLabels,
      preferPeripheral,
      hints,
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
        hints,
      );
      if (byCompound) return byCompound;
      const leftAsDistrict = resolveByDistrict(
        left,
        cityLabels,
        preferPeripheral,
        hints,
      );
      if (leftAsDistrict) return leftAsDistrict;
    }
  }

  let cityResult: EstateWebLocation | undefined;
  for (const cityLabel of cityLabels) {
    const cityMatches = filterByPreferredPath(
      LOCATION_BY_NORMALIZED_NAME.get(cityLabel) ?? [],
      hints,
    );
    if (cityMatches.length > 0) {
      cityResult = pickCanonicalCity(cityMatches);
      break;
    }
  }

  // A scraped city is very often just a neighborhood/town name that also happens to be a
  // whole municipality's name elsewhere in Greece (see root causes #1/#8/#9/#13 in
  // ESTATEWEB-LOCATION-ACCURACY-FIXES.md). guessMunicipalityGenitivePhrase only ever
  // resolves when the genitive-guessed phrase lands on a real, specific "Δήμος <X>" node --
  // a strong signal, but NOT strong enough to unconditionally outrank cityResult above: most
  // Greek towns share their municipality's name and already resolve correctly through it
  // (e.g. "Νέα Σμύρνη" -> its own town node, itself a child of "Δήμος Νέας Σμύρνης"), and
  // blindly preferring the (shallower, less specific) municipality guess in every case would
  // coarsen those already-correct matches. Only step in when cityResult is missing, or is a
  // node with NO relation to the guessed municipality at all (i.e. cityResult only matched
  // because the raw label happens to also name an unrelated place in a different region --
  // exactly the homonym trap this is meant to fix).
  const municipalityGuessLabel = guessMunicipalityGenitivePhrase(
    cityLabels[0] ?? '',
  );
  if (municipalityGuessLabel) {
    const guessMatches = filterByPreferredPath(
      LOCATION_BY_NORMALIZED_NAME.get(municipalityGuessLabel) ?? [],
      hints,
    );
    const municipalityGuessLoc = pickMostSpecific(guessMatches);
    // Guard against a real, specific-but-wrong-region text hint (e.g. district "Ρέθυμνο"
    // alongside city "Καλλιθέα") -- without this, "Καλλιθέα Ρεθύμνου" would jump all the way
    // to Athens' "Δήμος Καλλιθέας" just because it's the only municipality named exactly
    // "Καλλιθέα" nationwide, which is worse than the existing (still wrong-node, but at
    // least Crete-scoped) same-named-homonym guess.
    const guessSegments = municipalityGuessLoc
      ? (LOCATION_NORMALIZED_SEGMENTS.get(municipalityGuessLoc.id) ?? [])
      : [];
    const conflictsWithHints =
      textMentionsConflictingPrefecture(city, guessSegments) ||
      textMentionsConflictingPrefecture(district, guessSegments);
    if (
      municipalityGuessLoc &&
      !conflictsWithHints &&
      (!cityResult ||
        (cityResult.id !== municipalityGuessLoc.id &&
          !isDescendantOf(cityResult, municipalityGuessLoc.id)))
    ) {
      return municipalityGuessLoc;
    }
  }

  return cityResult;
}

/** Convenience wrapper returning just the numeric location id (or `null`). */
export function resolveEstateWebLocationId(
  city?: string | null,
  district?: string | null,
  hints?: EstateWebLocationResolveHints,
): number | null {
  return resolveEstateWebLocation(city, district, hints)?.id ?? null;
}

export type EstateWebLocationSourcesInput = {
  city?: string | null;
  district?: string | null;
  rawLocation?: string | null;
  title?: string | null;
  description?: string | null;
  // Ordered broad-to-specific administrative/locality names (region/prefecture down to
  // neighborhood) from Google's Geocoding API for this property's address/coordinates,
  // when available. This is ground truth (not inferred from ambiguous scraped text), so
  // it's prepended ahead of the regex-derived hints below and takes priority in
  // filterByPreferredPath -- this is what scopes a homonym district (e.g. 11 different
  // "Αγία Σοφία" nodes nationwide) to the correct region instead of falling through to
  // pickMostSpecific()'s unscoped, tree-depth-based guess. Deliberately not limited to a
  // single "the municipality" string -- Google rarely spells the municipality out with a
  // "Δήμος " prefix outside Attica, but its prefecture/locality names still match catalog
  // path segments directly often enough to scope correctly (e.g. administrative_area_level_3
  // "Θεσσαλονίκη" matches the catalog's prefecture segment even with no "Δήμος" anywhere).
  googleAddressSegments?: string[] | null;
  // Google's administrative_area_level_3 (prefecture) names from reverse-geocoding the
  // property's own coordinates. When the scraped text is ambiguous across prefectures, these
  // become a hard constraint (requiredPrefectureSegments) instead of a soft preference. Never
  // pass forward-geocoded names here: ambiguous text merges several homonyms' regions
  // (root cause #11).
  googleCoordinatePrefectures?: string[] | null;
  // The listing's SourceAgency.city -- an admin-curated "home region" for the agency
  // (SourceAgency.city, e.g. "Αθήνα"), when set. Resolution is tried FIRST hard-restricted
  // to that region alone (every stage -- district, city, rawLocation, title patterns, and
  // the last-resort fallback -- only considers candidates inside it); if that scoped
  // attempt finds nothing, this falls through to the exact same unrestricted resolution as
  // when agencyCity is omitted entirely. This never makes the result MORE likely to be
  // null than before (a scoped miss always retries unscoped) -- a missing
  // estateweb_location_id blocks the CMS push (see root cause #8 in
  // ESTATEWEB-LOCATION-ACCURACY-FIXES.md). Most agencies only ever list in one metro
  // area/prefecture, which makes this a much stronger per-agency signal than tree-depth
  // guessing for a same-named homonym the property's own text/coordinates don't
  // disambiguate on their own (see the recurring "Αγία Παρασκευή" class of bug there).
  agencyCity?: string | null;
};

export function resolveEstateWebLocationFromSources(
  input: EstateWebLocationSourcesInput,
): EstateWebLocation | undefined {
  const agencyPrefectureSegments = resolveAgencyPrefectureSegments(
    input.agencyCity,
  );
  // Skip the agency-scoped pass entirely when the property's OWN text already names a real,
  // different catalog prefecture (same guard used for guessMunicipalityGenitivePhrase below,
  // and the same reasoning: an explicit, specific region the text names must win over a
  // regional GUESS). Without this, a homonym that happens to ALSO exist somewhere inside the
  // agency's usual region (e.g. "Άγιος Κωνσταντίνος" existing both in Τροιζηνία/Πειραιάς and
  // nationwide) is a genuine, confident match within the forced scope -- not caught by the
  // "no confident match, fall through" case the two-pass design otherwise handles -- so it
  // would win pass 1 outright and silently discard a property whose district field literally
  // spells out a different, real prefecture ("Φθιώτιδα"), found via a real production case
  // while enabling agencyCity for housemarket-realestate.gr.
  const agencyScopeConflicts =
    agencyPrefectureSegments.length > 0 &&
    (textMentionsConflictingPrefecture(input.city, agencyPrefectureSegments) ||
      textMentionsConflictingPrefecture(input.district, agencyPrefectureSegments));
  if (agencyPrefectureSegments.length > 0 && !agencyScopeConflicts) {
    const scoped = resolveEstateWebLocationFromSourcesCore(
      input,
      agencyPrefectureSegments,
    );
    if (scoped) return scoped;
  }
  return resolveEstateWebLocationFromSourcesCore(input);
}

/**
 * Resolves a SourceAgency's admin-set "city"/home-region text (SourceAgency.city) to the
 * catalog prefecture segment(s) (path[1]) it falls under -- e.g. "Αθήνα" or a specific city
 * within that region like "Χαλάνδρι" both resolve to the "αθηνα" prefecture segment, via the
 * exact same free-text resolution a property's own city/district goes through (no hints).
 * Returns [] when the agency has no city set, or when the text doesn't resolve to any
 * catalog node at all -- both leave scoping entirely up to the caller (i.e. behave as if no
 * agency hint were given).
 */
export function resolveAgencyPrefectureSegments(
  agencyCity?: string | null,
): string[] {
  if (!agencyCity?.trim()) return [];
  const location = resolveEstateWebLocation(agencyCity, null);
  if (!location) return [];
  const prefecture = LOCATION_NORMALIZED_SEGMENTS.get(location.id)?.[1];
  return prefecture ? [prefecture] : [];
}

function resolveEstateWebLocationFromSourcesCore(
  input: EstateWebLocationSourcesInput,
  forcedRequiredPrefectureSegments?: string[],
): EstateWebLocation | undefined {
  const preferredPathSegments = inferPreferredPathSegments(
    input.title,
    input.description,
    input.rawLocation,
    input.city,
    input.district,
  );
  let googleSegments: string[] = [];
  let requiredPrefectureSegments: string[] = forcedRequiredPrefectureSegments ?? [];
  if (input.googleAddressSegments?.length) {
    const normalizedSegments = input.googleAddressSegments
      .flatMap((segment) =>
        expandGoogleAdminSegment(normalizeEstateWebPlaceLabel(segment)),
      )
      .filter(
        (segment, index, all) =>
          segment && all.indexOf(segment) === index,
      );
    preferredPathSegments.unshift(
      ...normalizedSegments.filter(
        (segment) => !preferredPathSegments.includes(segment),
      ),
    );
    googleSegments = normalizedSegments;
  }
  // Skip when forcedRequiredPrefectureSegments (the agency-scoped first pass) is already
  // active -- that pass is a separate, self-contained "region-only" attempt (see
  // resolveEstateWebLocationFromSources); mixing in the coordinate-derived constraint here
  // too would turn it into an OR of two different regions instead of a clean single-region
  // scope, and a real per-property coordinate disagreeing with the agency's usual region is
  // exactly the legitimate-exception case the unscoped fallback pass exists to catch.
  if (!forcedRequiredPrefectureSegments && input.googleCoordinatePrefectures?.length) {
    const coordinatePrefectures = input.googleCoordinatePrefectures
      .flatMap((segment) =>
        expandGoogleAdminSegment(normalizeEstateWebPlaceLabel(segment)),
      )
      .filter((segment) => PREFECTURE_SEGMENTS.has(segment));
    // Coordinates can be wrong too (some were forward-geocoded from ambiguous text, or sit on
    // a generic city-centre point). Only let them overrule text that doesn't already pin a
    // single prefecture on its own -- "Χανιά / Ακρωτήρι" with a point in Thessaloniki keeps
    // Chania; "Φούρνοι" (Samos, Argolida, Evia, ...) with a point in Lasithi does not.
    if (
      coordinatePrefectures.length > 0 &&
      textCandidatePrefectures(input.city, input.district).size !== 1
    ) {
      requiredPrefectureSegments = coordinatePrefectures;
    }
  }
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
  const hints: EstateWebLocationResolveHints = {
    preferredPathSegments,
    requiredPrefectureSegments,
  };

  const primary = resolveEstateWebLocation(input.city, input.district, hints);

  const fromRaw = input.rawLocation
    ? (resolveEstateWebLocation(null, input.rawLocation, hints) ??
      resolveEstateWebLocation(input.rawLocation, null, hints))
    : undefined;

  // `rawLocation` (e.g. a scraped "Village (Municipality)" field) is agency-authored
  // structured data -- when it resolves to a deeper catalog node than the free-text
  // city/district match (which can bottom out as broad as the whole island "Κρήτη"),
  // trust the more specific one instead of always favoring city/district.
  const textResult =
    primary && fromRaw
      ? fromRaw.level > primary.level
        ? fromRaw
        : primary
      : (primary ?? fromRaw);
  if (textResult) return refineBarePrefecture(textResult, input, googleSegments);

  // The scraped city/district text only matched homonyms outside the prefecture the
  // coordinates are in (e.g. city "Φούρνοι" -> only Samos/Argolida/Evia/... nodes, while the
  // coordinates are in Lasithi, where the catalog spells the village "Φουρνή"). Google named
  // the real place, so take the most specific Google segment (they're ordered broad-to-
  // specific) that has a catalog node inside the known prefecture.
  //
  // Never during the agency-scoped first pass (forcedRequiredPrefectureSegments):
  // requiredPrefectureSegments there is the agency's usual-region GUESS, not real per-property
  // evidence, so this would use it to justify picking a broad, low-confidence node (e.g. the
  // bare region "Αθήνα") for a property that is genuinely elsewhere -- found via a real
  // production case (city "Μαλεσίνα", district "Θεολόγος", both real, unique, unambiguous
  // Central-Greece catalog matches) where this fired on nothing but a generic/shared fallback
  // coordinate's reverse-geocode, silently discarding the correct answer that only the
  // unscoped second pass (with its own, real, ambiguity-gated coordinate logic) would find.
  if (!forcedRequiredPrefectureSegments && requiredPrefectureSegments.length > 0) {
    for (let i = googleSegments.length - 1; i >= 0; i--) {
      const named = filterByPreferredPath(
        LOCATION_BY_NORMALIZED_NAME.get(googleSegments[i]) ?? [],
        hints,
      );
      const best = pickMostSpecific(named);
      if (best) return best;
    }
  }

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
  // First prefer a real `is_city` anchor for a named prefecture (Χανιά/Ρέθυμνο/Ηράκλειο/
  // Λασίθι all have one) when one of the hint segments names it directly.
  //
  // Never during the agency-scoped first pass, same reasoning as the requiredPrefectureSegments
  // branch above: this is the ultimate "give up, guess broad" fallback, and pass 1 always has
  // a real fallback available (pass 2) -- letting IT decide "nothing fits, guess broadly" is
  // what keeps a genuinely out-of-region listing from being silently forced into the agency's
  // usual area instead of correctly falling through unscoped.
  if (!forcedRequiredPrefectureSegments && preferredPathSegments.length > 0) {
    for (const segment of preferredPathSegments) {
      const cityNode = (LOCATION_BY_NORMALIZED_NAME.get(segment) ?? []).find(
        (loc) =>
          loc.is_city &&
          (!requiredPrefectureSegments.length ||
            isInRequiredPrefecture(loc, requiredPrefectureSegments)),
      );
      if (cityNode) return cityNode;
    }

    // No `is_city` anchor among the hints -- this used to unconditionally fall back to
    // the single island-level "Κρήτη" node, which was only ever safe back when this
    // resolver only ran against Crete-only regex hints (REGION_PATH_HINTS). Now that
    // googleAddressSegments feeds it nationwide (see root cause #1 in
    // ESTATEWEB-LOCATION-ACCURACY-FIXES.md), that blind Crete default misfired for
    // every other region with no is_city hit -- e.g. a Syros property with hint segments
    // ["Σύρος", "Άνω Σύρος", "Ερμούπολη", ...] (none flagged is_city) was wrongly resolved
    // to Crete (id 4), ~300km away. Instead, pick the most specific catalog node whose
    // name exactly matches one of the hint segments -- still never guesses a
    // same-named-but-wrong-region homonym, since every candidate here was named by a real
    // hint segment (Google ground truth or a region regex), not picked blind.
    const namedMatches = preferredPathSegments.flatMap((segment) =>
      filterByPreferredPath(LOCATION_BY_NORMALIZED_NAME.get(segment) ?? [], {
        requiredPrefectureSegments,
      }),
    );
    const bestNamed = pickMostSpecific(namedMatches);
    if (bestNamed) return bestNamed;
  }

  return undefined;
}

const PREFECTURE_LEVEL = 1;
const MUNICIPALITY_LEVEL = 2;

// Area names the catalog doesn't carry, per prefecture segment -> catalog node id. Only used
// once the property is already known to be in that prefecture, so a name that means
// something else elsewhere (Athens' Παλλήνη) is unaffected.
const PREFECTURE_AREA_ALIASES: Record<string, Record<string, number>> = {
  // "Παλλήνη" is the Kassandra peninsula's other name and the pre-2011 municipality merged
  // into Δήμος Κασσάνδρας (Google still returns "Δήμος Παλλήνης Χαλκιδικής").
  χαλκιδικη: {
    παλληνη: 50301,
    'δημος παλληνης χαλκιδικης': 50301,
  },
};

const GOOGLE_COMMUNITY_PREFIXES = ['τοπικη κοινοτητα ', 'δημοτικη κοινοτητα '];

// Google names a village's local community in genitive ("Τοπική Κοινότητα Πευκοχωρίου",
// "... Νέας Σκιώνης"); the catalog names the village in nominative ("Πευκοχώρι", "Νέα Σκιώνη").
const COMMUNITY_GENITIVE_REWRITES: Array<[suffix: string, replacements: string[]]> = [
  ['ιου', ['ι']],
  ['ου', ['ος', 'ο', 'ι']],
  ['ης', ['η', 'α']],
  ['ας', ['α']],
  ['ων', ['α', 'ες', 'οι']],
  ['η', ['ης']],
];

function genitiveWordVariants(word: string): string[] {
  const variants = [word];
  for (const [suffix, replacements] of COMMUNITY_GENITIVE_REWRITES) {
    if (!word.endsWith(suffix) || word.length <= suffix.length + 1) continue;
    for (const replacement of replacements) {
      variants.push(word.slice(0, -suffix.length) + replacement);
    }
  }
  return variants;
}

function googleCommunityNames(normalizedSegment: string): string[] {
  const prefix = GOOGLE_COMMUNITY_PREFIXES.find((p) => normalizedSegment.startsWith(p));
  if (!prefix) return [];
  const words = normalizedSegment.slice(prefix.length).trim().split(' ').filter(Boolean);
  if (words.length === 0 || words.length > 3) return [];
  return words.reduce<string[]>(
    (phrases, word) =>
      phrases.flatMap((phrase) =>
        genitiveWordVariants(word).map((variant) => (phrase ? `${phrase} ${variant}` : variant)),
      ),
    [''],
  );
}

// "Κασσάνδρα" -> "κασσανδρας", "Δάφνη-Υμηττός" -> "δαφνης-υμηττου": the bare-indexed genitive
// of a "Δήμος <Genitive>" node (guessMunicipalityGenitivePhrase doesn't split hyphenated
// double municipalities).
function guessHyphenatedMunicipalityGenitive(normalized: string): string | null {
  const parts = normalized.split(/(\s+|-)/);
  const converted = parts.map((part, i) => (i % 2 === 1 ? part : guessGreekGenitiveWord(part)));
  if (converted.some((part) => part == null)) return null;
  return converted.join('');
}

function ancestorAtLevel(
  loc: EstateWebLocation,
  level: number,
): EstateWebLocation | undefined {
  let current: EstateWebLocation | undefined = loc;
  while (current && current.level > level) {
    current =
      current.parent_id != null ? LOCATION_BY_ID.get(current.parent_id) : undefined;
  }
  return current?.level === level ? current : undefined;
}

// Municipalities (inside `loc`) of the places the text labels name, prefecture names aside.
function municipalitiesNamedInside(loc: EstateWebLocation, labels: string[]): Set<number> {
  const ids = new Set<number>();
  for (const label of labels) {
    if (PREFECTURE_SEGMENTS.has(label)) continue;
    const named = [
      ...(LOCATION_BY_NORMALIZED_NAME.get(label) ?? []),
      ...(LOCATION_BY_NORMALIZED_NAME.get(guessMunicipalityGenitivePhrase(label) ?? '') ?? []),
    ];
    for (const candidate of named) {
      if (candidate.id === loc.id || !isDescendantOf(candidate, loc.id)) continue;
      const municipality = ancestorAtLevel(candidate, MUNICIPALITY_LEVEL);
      if (municipality) ids.add(municipality.id);
    }
  }
  return ids;
}

/**
 * The text only pinned a whole prefecture (e.g. "Χαλκιδική / Παλλήνη": the catalog's only
 * Παλλήνη is the Athens suburb), so the CRM listing would show a prefecture with no
 * municipality. Step down to a node INSIDE that prefecture -- never to another region -- from
 * the property's reverse-geocoded coordinates, else from PREFECTURE_AREA_ALIASES.
 */
function refineBarePrefecture(
  loc: EstateWebLocation,
  input: EstateWebLocationSourcesInput,
  googleSegments: string[],
): EstateWebLocation {
  if (loc.level !== PREFECTURE_LEVEL) return loc;
  const labels = [...expandDistrictLabels(input.district), ...expandCityLabels(input.city).labels];
  // Coordinates only: forward-geocoded names can belong to a homonym (root cause #11).
  if (input.googleCoordinatePrefectures?.length) {
    const refined = refinePrefectureWithCoordinates(
      loc,
      googleSegments,
      input.googleCoordinatePrefectures,
    );
    // The text named a place in this prefecture that just didn't resolve on its own ("Αθήνα /
    // Γκύζη - Πεδίον Άρεως", "Αθήνα / Αγία Παρασκευή"): coordinates in a different
    // municipality are a generic fallback point (several of those sat in Άλιμος), not the
    // listing.
    const textMunicipalities = municipalitiesNamedInside(loc, labels);
    const refinedMunicipality = refined && ancestorAtLevel(refined, MUNICIPALITY_LEVEL);
    if (
      refinedMunicipality &&
      (textMunicipalities.size === 0 || textMunicipalities.has(refinedMunicipality.id))
    ) {
      return refined;
    }
  }
  const aliases = PREFECTURE_AREA_ALIASES[LOCATION_NORMALIZED_SEGMENTS.get(loc.id)?.[1] ?? ''];
  if (aliases) {
    for (const label of labels) {
      const aliased = aliases[label] != null ? LOCATION_BY_ID.get(aliases[label]) : undefined;
      if (aliased) return aliased;
    }
  }
  return loc;
}

/**
 * 1. The municipality, from the Google names below the coordinates' own prefecture entry
 *    (broader ones can collide with a neighborhood: Athens has one called "Αττική"): the
 *    first one naming a municipality node ("ΔΗΜΟΣ ΓΛΥΦΑΔΑΣ", Google's admin_level_4
 *    "Κασσάνδρα"), else the first whose nodes all sit in one municipality.
 * 2. The village, only from Google's local-community admin unit ("Τοπική Κοινότητα
 *    Πευκοχωρίου" -> Πευκοχώρι) inside that municipality. Plain locality names aren't used for
 *    this: the merged reverse-geocode results carry nearby towns too (every Kassandra point
 *    came back with "Παλιούρι").
 */
function refinePrefectureWithCoordinates(
  loc: EstateWebLocation,
  googleSegments: string[],
  googleCoordinatePrefectures: string[],
): EstateWebLocation | undefined {
  const rawPrefectures = googleCoordinatePrefectures.map(normalizeEstateWebPlaceLabel);
  // Coordinates in another prefecture are a bad geocode, not a refinement. Attica's Google
  // prefectures ("Νότιος Τομέας Αθηνών") aren't catalog prefectures, so none known is fine.
  const coordinatePrefectures = rawPrefectures
    .flatMap(expandGoogleAdminSegment)
    .filter((segment) => PREFECTURE_SEGMENTS.has(segment));
  if (coordinatePrefectures.length > 0 && !isInRequiredPrefecture(loc, coordinatePrefectures)) {
    return undefined;
  }
  const lastPrefectureIndex = Math.max(
    ...rawPrefectures.map((segment) => googleSegments.lastIndexOf(segment)),
  );
  const localSegments = googleSegments
    .slice(lastPrefectureIndex + 1)
    .filter((segment) => !PREFECTURE_SEGMENTS.has(segment));
  if (localSegments.length === 0) return undefined;

  const insideLoc = (label: string | null) =>
    (label ? (LOCATION_BY_NORMALIZED_NAME.get(label) ?? []) : []).filter(
      (candidate) => candidate.id !== loc.id && isDescendantOf(candidate, loc.id),
    );
  const aliases = PREFECTURE_AREA_ALIASES[LOCATION_NORMALIZED_SEGMENTS.get(loc.id)?.[1] ?? ''];

  let municipality: EstateWebLocation | undefined;
  for (const segment of localSegments) {
    const aliasId = aliases?.[segment];
    municipality = [
      ...(aliasId != null ? [LOCATION_BY_ID.get(aliasId)] : []),
      ...insideLoc(segment),
      ...insideLoc(guessHyphenatedMunicipalityGenitive(segment)),
    ].find((candidate) => candidate?.level === MUNICIPALITY_LEVEL);
    if (municipality) break;
  }
  if (!municipality) {
    for (const segment of localSegments) {
      const municipalities = new Map<number, EstateWebLocation>();
      for (const candidate of insideLoc(segment)) {
        const ancestor = ancestorAtLevel(candidate, MUNICIPALITY_LEVEL);
        if (ancestor) municipalities.set(ancestor.id, ancestor);
      }
      if (municipalities.size === 1) {
        municipality = [...municipalities.values()][0];
        break;
      }
    }
  }
  if (!municipality) return undefined;

  const municipalityId = municipality.id;
  for (const segment of localSegments) {
    for (const name of googleCommunityNames(segment)) {
      const villages = insideLoc(name).filter(
        (candidate) => candidate.id !== municipalityId && isDescendantOf(candidate, municipalityId),
      );
      if (villages.length === 1) return villages[0];
    }
  }
  return municipality;
}

/**
 * Prefectures the scraped city/district text could refer to on its own: the district nodes
 * scoped by the city when the two agree (same pairing resolveByDistrict tries first),
 * otherwise every catalog node either label names.
 */
function textCandidatePrefectures(
  city?: string | null,
  district?: string | null,
): Set<string> {
  const { labels: cityLabels } = expandCityLabels(city);
  const districtLabels = expandDistrictLabels(district);
  const prefecturesOf = (locs: EstateWebLocation[]) =>
    new Set(
      locs
        .map((loc) => LOCATION_NORMALIZED_SEGMENTS.get(loc.id)?.[1])
        .filter((segment): segment is string => !!segment),
    );

  for (const districtLabel of districtLabels) {
    const districtMatches = LOCATION_BY_NORMALIZED_NAME.get(districtLabel) ?? [];
    for (const cityLabel of cityLabels) {
      const scoped = districtMatches.filter((loc) => matchesCity(loc, cityLabel));
      if (scoped.length > 0) return prefecturesOf(scoped);
    }
  }
  return prefecturesOf(
    [...districtLabels, ...cityLabels].flatMap(
      (label) => LOCATION_BY_NORMALIZED_NAME.get(label) ?? [],
    ),
  );
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
  agencyCity?: string | null;
}): number | null {
  return resolveEstateWebLocationFromSources(input)?.id ?? null;
}
