import { createHash } from 'crypto';

export function crawlTimestamp(): string {
  return new Date().toISOString();
}

// Playwright's page.goto() throws (rather than resolving with a non-ok response)
// for connection-level failures -- DNS, TLS, HTTP/2 protocol errors, refused
// connections, navigation timeouts. These indicate the target site is
// unreachable/flaky right now, not that the scraper's selectors/config are
// wrong, so they must be classified the same as an HTTP-level networkError
// (see crawler.service.ts's scrapeListingPages catch block) rather than
// falling through to the generic "scraper is broken" 3-strike counter.
// "interrupted by another navigation" is a managed-browser (Bright Data)
// specific case: their fleet does its own server-side challenge-solving while
// our goto() is pending, and finishing that triggers an internal reload that
// races the original navigation -- purely a timing artifact, not a real
// failure, and a retry lands after their unlocking has already completed.
const TRANSIENT_NAVIGATION_ERROR_PATTERN =
  /net::ERR_|NS_ERROR_|Timeout \d+ms exceeded|interrupted by another navigation/i;

export function isTransientNavigationError(message: string): boolean {
  return TRANSIENT_NAVIGATION_ERROR_PATTERN.test(message);
}

// Bright Data's Browser API kills a whole session (not just one navigation)
// in a few documented cases (docs.brightdata.com/scraping-automation/
// scraping-browser/error-codes):
//   - network_inactivity_timeout: "Session terminated after 5 minutes of no
//     network activity."
//   - session_timeout: "Session reached the 60-minute limit."
//   - navigate_domains_limit: "Session limited to one domain" -- e.g. a
//     detail page that redirects off-domain before we detect and exclude it
//     (see isDetailPageRedirectAway) can trip this on an already-reused
//     session.
//   - proxy_timeout / page_navigated_error: proxy-layer failures that leave
//     the session unusable.
// Playwright surfaces the session already being gone as generic CDP-session
// errors rather than always echoing Bright Data's own wording, so this also
// matches the standard "the connection/target is gone" shapes. Retrying the
// SAME page.goto() on a connection killed for one of these reasons is
// pointless -- every attempt fails identically -- the caller must close this
// Browser and open a brand new one (see StealthBrowserService.
// openManagedBrowser) instead of retrying in place.
const MANAGED_SESSION_DEAD_ERROR_PATTERN =
  /network_inactivity_timeout|session_timeout|navigate_domains_limit|proxy_timeout|page_navigated_error|Session terminated|reached the 60-minute limit|Target (page, context or browser )?has been closed|Target closed|Session closed|Browser closed|Connection closed|WebSocket.*closed/i;

export function isManagedSessionDeadError(message: string): boolean {
  return MANAGED_SESSION_DEAD_ERROR_PATTERN.test(message);
}

// Shared by every page.goto() call in the crawler (listing pages, url_param
// pagination, detail pages) -- retries on a transient navigation error (see
// TRANSIENT_NAVIGATION_ERROR_PATTERN above), rethrows immediately for
// anything else (a real HTTP response, or a non-network exception).
export async function retryTransient<T>(
  action: () => Promise<T>,
  maxAttempts: number,
  delayMs: number,
  onRetry: (attempt: number, message: string) => void,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await action();
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!isTransientNavigationError(message) || attempt === maxAttempts) {
        throw err;
      }
      onRetry(attempt, message);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
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

// Listing codes mix Latin and Greek letters (e.g. "PIM1023", "ΜΙ23623"), and
// sites frequently render the label glued directly to the value with no
// colon or even whitespace between them (e.g. "ΚωδικόςPIM1023" as a single
// text node) -- the separator and the code's own character set can't be
// assumed, only that the code itself contains at least one digit.
const ID_CODE =
  '(?=[A-Za-zΑ-Ωα-ω0-9-]*\\d)[A-Za-zΑ-Ωα-ω0-9]+(?:-[A-Za-zΑ-Ωα-ω0-9]+)*';
// "Κωδικός" is also seen followed by a semicolon (likely a fat-fingered
// colon on a Greek keyboard) instead of ":".
const LABEL_SEP = '[:：;]?';
// Every label below gets tried two ways: the code glued/hyphenated with no
// internal space (ID_CODE), and the shape where the site put a space between
// the code's letters and digits (e.g. "Κωδικός: ΑΤΡ 525", "Property code
// ISAB 4423") -- captured as two groups and rejoined by the caller. Kept
// separate from ID_CODE itself, since ID_CODE is reused generically and a
// space-joined run there would swallow the rest of the sentence.
function withCodeVariants(labelSource: string, flags: string): RegExp[] {
  return [
    new RegExp(`${labelSource}\\s*${LABEL_SEP}\\s*(${ID_CODE})`, flags),
    new RegExp(
      `${labelSource}\\s*${LABEL_SEP}\\s*([A-Za-zΑ-Ωα-ω]{1,6})\\s+(\\d{2,7})(?!\\d)`,
      flags,
    ),
  ];
}

const INTERNAL_ID_PATTERNS: RegExp[] = [
  ...withCodeVariants('Κωδικός(?:\\s+ακινήτου)?', 'iu'),
  ...withCodeVariants('Property\\s*ID', 'i'),
  ...withCodeVariants('(?:Property\\s+)?(?:Code|Ref(?:erence)?)', 'i'),
  // Some listings show no label at all -- the code is just the very first
  // thing in the text (e.g. "<p>MPR225</p>" or "<p>ΝΜ0411222</p>" as the
  // opening paragraph, before any "Κωδικός" word appears anywhere). Restrict
  // to a tight LETTERS-then-DIGITS shape anchored at the start so ordinary
  // prose ("Πωλείται διαμέρισμα...") can't match; digits go up to 9 to cover
  // date-stamped codes like "ΝΜ0411222" (DDMMYY + sequence); the trailing
  // negative lookahead stops it from truncating a longer run of digits
  // mid-number.
  new RegExp(`^\\s*([A-Za-zΑ-Ωα-ω]{2,6}\\d{2,9})(?!\\d)`, 'u'),
];

export function extractInternalIdFromText(
  ...texts: Array<string | null | undefined>
): string | null {
  for (const text of texts) {
    if (!text) continue;
    for (const pattern of INTERNAL_ID_PATTERNS) {
      const match = text.match(pattern);
      if (match?.[1]) {
        return match[2] ? `${match[1]}${match[2]}`.trim() : match[1].trim();
      }
    }
  }
  return null;
}

// Some sites never put price in its own element -- it's baked straight into
// the title/description prose (e.g. "...102τμ 150000ευρώ."), so a
// price_selector has nothing to target. Only used as a fallback when the
// scraper config produced no raw.price at all.
// JS's \b treats only [A-Za-z0-9_] as word characters -- it never recognizes
// Greek letters as "word" even with the /u flag -- so it can't be used to
// bound "ευρώ"/"€"; a following-letter lookahead on the Latin "EUR" spelling
// is enough to stop it from matching inside a longer word like "EURO".
const PRICE_PATTERNS: RegExp[] = [
  /(?:Τιμή|Price)\s*[:：]?\s*(\d[\d.,]*)\s*(€|ευρώ|EUR(?![A-Za-z]))?/iu,
  /(\d[\d.,]*)\s*(€|ευρώ|EUR(?![A-Za-z]))/iu,
];

export function extractPriceFromText(
  ...texts: Array<string | null | undefined>
): string | null {
  for (const text of texts) {
    if (!text) continue;
    for (const pattern of PRICE_PATTERNS) {
      const match = text.match(pattern);
      if (match?.[1]) return match[2] ? `${match[1]}${match[2]}` : match[1];
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
  // Codes can be Greek-lettered (e.g. "ΜΙ23623") -- an ASCII-only class here
  // would treat those leading letters as "junk" and strip them too.
  const stripped = value.replace(/^[^A-Za-zΑ-Ωα-ω0-9]+/u, '').trim();
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
        // Some listings only put the code in the title (page <title>/<h1>),
        // never in the description at all, e.g.
        // "...325000ευρώ. Κωδικός:PI 29423" -- checked last since the
        // description is the more reliable source when both are present.
        readRawString(raw, ['title', '_title']),
      ),
  );

  const segments = sourceUrl
    .split('/')
    .filter(Boolean)
    .map((segment) => {
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
