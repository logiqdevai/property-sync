import type {
  CrawlItem,
  DetailPageConfig,
  FieldDef,
} from '../interfaces/scraper-config.interface';
import { mergeImagesDedupingSizeVariants } from './crawler.utils';

/**
 * Page-side extraction functions shared by the server crawler (passed to Playwright's
 * `page.evaluate`) and the desktop crawler app (served as source text by
 * `GET /desktop-crawl/scrapers/:id/job` and evaluated in a real local Chrome).
 *
 * Every function marked "page-side" is serialized with `Function.prototype.toString()` and runs
 * inside the browser, so it must stay self-contained: no imports, no module-level constants, no
 * helpers defined outside its own body.
 */

/** What the detail-page extractor returns. */
export interface DetailPageExtraction {
  images: string[];
  raw_detail_text: string | null;
  detail_specs: Record<string, string>;
  detail_features: string[];
  external_id: string | null;
  title: string | null;
  price: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ListingExtractorArgs {
  listingSelector: string;
  fields: Record<string, string | FieldDef>;
}

/**
 * Page-side. Extracts every listing card on the current page, mirroring
 * `FieldExtractionService.extractField` and the card-image / source_url resolution in
 * `CrawlerService.scrapeListingPages`. Cards without a link are skipped (same as the server).
 */
export function extractListingCards(
  args: ListingExtractorArgs,
): Array<{ source_url: string; raw: Record<string, unknown> }> {
  const extractField = (
    card: Element,
    def: string | FieldDef,
  ): string | null => {
    const selector =
      typeof def === 'string' ? def : (def.selector ?? String(def));
    const type = typeof def === 'string' ? 'text' : (def.type ?? 'text');
    try {
      const el = selector ? card.querySelector(selector) : card;
      if (!el) return null;
      if (type === 'href') return el.getAttribute('href') || null;
      if (type === 'src') {
        const src = el.getAttribute('src') || null;
        if (src && src.toLowerCase().startsWith('data:')) {
          return (
            el.getAttribute('data-src') ||
            el.getAttribute('data-lazy-src') ||
            el.getAttribute('data-original') ||
            null
          );
        }
        return src;
      }
      if (type === 'background_image') {
        const style = el.getAttribute('style') || '';
        const match = style.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
        return match ? match[1] : null;
      }
      const isStruck =
        el instanceof HTMLElement &&
        (el.tagName === 'DEL' ||
          el.tagName === 'S' ||
          el.tagName === 'STRIKE' ||
          window
            .getComputedStyle(el)
            .textDecorationLine.includes('line-through'));
      if (isStruck && el.parentElement) {
        const parentText = el.parentElement.textContent
          ?.replace(/\s+/g, ' ')
          .trim();
        if (parentText) return parentText;
      }
      return el.textContent?.replace(/\s+/g, ' ').trim() || null;
    } catch {
      return null;
    }
  };

  const cardImages = (card: Element): string[] => {
    const imgs: string[] = [];
    card.querySelectorAll('[style]').forEach((node) => {
      const match = (node.getAttribute('style') || '').match(
        /background-image:\s*url\(['"]?(.*?)['"]?\)/,
      );
      if (match?.[1]) imgs.push(match[1]);
    });
    card.querySelectorAll('img').forEach((node) => {
      const src = node.getAttribute('src') || '';
      if (src.startsWith('data:')) {
        const lazySrc =
          node.getAttribute('data-src') ||
          node.getAttribute('data-lazy-src') ||
          node.getAttribute('data-original') ||
          '';
        if (lazySrc) imgs.push(lazySrc);
      } else if (src) {
        imgs.push(src);
      }
    });
    return [...new Set(imgs)].filter((src) => !src.startsWith('data:'));
  };

  const items: Array<{ source_url: string; raw: Record<string, unknown> }> = [];
  document.querySelectorAll(args.listingSelector).forEach((card) => {
    const raw: Record<string, unknown> = {};
    for (const [name, def] of Object.entries(args.fields ?? {})) {
      raw[name] = extractField(card, def);
    }
    raw._all_images = cardImages(card);
    let sourceUrl =
      (raw.url as string | null) ?? (raw.href as string | null) ?? null;
    if (sourceUrl && !sourceUrl.startsWith('http')) {
      try {
        sourceUrl = new URL(sourceUrl, location.href).href;
      } catch {
        /* keep as-is */
      }
    }
    if (!sourceUrl) return;
    items.push({ source_url: sourceUrl, raw });
  });
  return items;
}

/**
 * Page-side. Extracts gallery images, description, specs, features, ids, title/price/location and
 * coordinates from a detail page per the scraper's `detail_page` config.
 */
export function extractDetailPage(
  cfg: DetailPageConfig | null,
): DetailPageExtraction {
  const images: string[] = [];
  const isJunkImageUrl = (src: string): boolean => {
    const lower = src.toLowerCase();
    if (!src || lower.startsWith('data:') || lower.endsWith('.svg')) {
      return true;
    }
    if (
      /logo|icon|favicon|sprite|sharethis|maps\d*\.a-cdn|\/tiles\/|googleusercontent\.com\/map/i.test(
        lower,
      )
    ) {
      return true;
    }
    return false;
  };
  const pushImage = (src: string | null | undefined): void => {
    if (!src || isJunkImageUrl(src)) return;
    images.push(src);
  };
  // Lazy-loaded <img> tags often keep a tiny base64 placeholder in `src`
  // and stash the real URL in a data-* attribute until scrolled into
  // view -- resolve that instead of dropping the image entirely.
  const resolveImgSrc = (el: HTMLImageElement): string | null => {
    if (el.src && !el.src.toLowerCase().startsWith('data:')) {
      return el.src;
    }
    return (
      el.getAttribute('data-src') ||
      el.getAttribute('data-lazy-src') ||
      el.getAttribute('data-original') ||
      null
    );
  };

  if (cfg?.image_selector) {
    const type = cfg.image_type ?? 'src';
    document.querySelectorAll(cfg.image_selector).forEach((el) => {
      if (type === 'href') {
        const href = el.getAttribute('href');
        pushImage(href ? new URL(href, document.baseURI).toString() : null);
      } else if (type === 'background_image') {
        const match = (el.getAttribute('style') || '').match(
          /background-image:\s*url\(['"]?(.*?)['"]?\)/,
        );
        pushImage(match?.[1]);
      } else if (el instanceof HTMLImageElement) {
        pushImage(resolveImgSrc(el));
      }
    });
  } else {
    document.querySelectorAll('[style]').forEach((el) => {
      const match = (el.getAttribute('style') || '').match(
        /background-image:\s*url\(['"]?(.*?)['"]?\)/,
      );
      pushImage(match?.[1]);
    });
    document.querySelectorAll('img').forEach((el) => {
      pushImage(resolveImgSrc(el as HTMLImageElement));
    });
  }

  const preserveDescriptionText = (
    value: string | null | undefined,
  ): string | null => {
    if (!value) return null;
    const cleaned = value
      .replace(/\r\n?/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return cleaned || null;
  };

  let descText: string | null = null;
  if (cfg?.description_selector) {
    const el = document.querySelector(cfg.description_selector);
    descText = el
      ? preserveDescriptionText((el as HTMLElement).innerText)
      : null;
  } else {
    const patterns = [
      '.description',
      '[class*="description"]',
      '.property-description',
      '[class*="detail-info"]',
      '.property-details',
      '[class*="property-text"]',
    ];
    for (const sel of patterns) {
      const el = document.querySelector(sel);
      if (el) {
        descText = preserveDescriptionText((el as HTMLElement).innerText);
        break;
      }
    }
  }

  const cleanText = (value: string | null | undefined): string =>
    (value || '').replace(/\s+/g, ' ').trim();

  let externalId: string | null = null;
  if (cfg?.external_id_source === 'selector' && cfg.external_id_selector) {
    const el = document.querySelector(cfg.external_id_selector);
    const rawText = cleanText(el?.textContent);
    // A code never contains a currency sign. A positional selector that landed
    // on the price row (listing without a code row) must yield no id, so the
    // listing falls back to its URL slug instead of the price's digits.
    const text = /[€$£]/.test(rawText) ? '' : rawText;
    // Strip a KNOWN label word first where present (handles clean
    // "Property ID: 988" / "Κωδικός: 988" cases with zero
    // false-positive risk). This list can never cover every
    // agency's wording though (a new site's own label -- "Αρ.
    // Ακινήτου", "Listing #", whatever -- needs no code change): the
    // fallback below extracts an ID-code-SHAPED token (letters/
    // digits/hyphens containing at least one digit, e.g. "988",
    // "PI-4423", "ΜΙ23623" -- same shape as crawler.utils.ts's
    // ID_CODE, used for the analogous free-text scan) from whatever
    // text is left, so any label -- known or not -- gets skipped
    // rather than captured, as long as the label itself has no
    // digits in it. This only works because external_id_selector is
    // expected to point at a SMALL, dedicated ID widget (see
    // scraper-generation/mcp-crawl SKILL.md) rather than a
    // sentence -- run against free-form prose, the same code-shape
    // match can false-positive on an unrelated number (e.g.
    // "3-bedroom"), which is exactly why the free-text scanner in
    // crawler.utils.ts additionally requires a recognized label
    // before it'll match anything.
    const withoutKnownLabel = text.replace(
      /^(?:Property\s*ID|Κωδ(?:ικός)?(?:\s+ακινήτου)?|Code|Ref(?:erence)?|ID)\.?\s*[:：\-]?\s*/i,
      '',
    );
    const codeMatch = (withoutKnownLabel || text).match(
      /(?=[A-Za-zΑ-Ωα-ω0-9-]*\d)[A-Za-zΑ-Ωα-ω0-9]+(?:-[A-Za-zΑ-Ωα-ω0-9]+)*/,
    );
    externalId = codeMatch?.[0] || withoutKnownLabel || null;
  }

  let titleText: string | null = null;
  if (cfg?.title_selector) {
    const el = document.querySelector(cfg.title_selector);
    titleText = cleanText(el?.textContent) || null;
  }

  let priceText: string | null = null;
  if (cfg?.price_selector) {
    const el = document.querySelector(cfg.price_selector);
    priceText = cleanText(el?.textContent) || null;
  }

  let locationText: string | null = null;
  if (cfg?.location_selector) {
    const el = document.querySelector(cfg.location_selector);
    locationText = cleanText(el?.textContent) || null;
  }

  const detailSpecs: Record<string, string> = {};
  const featureSet = new Set<string>();

  const addSpec = (rawKey: string, rawValue: string): void => {
    const key = cleanText(rawKey).replace(/[:：]\s*$/, '');
    const value = cleanText(rawValue);
    if (!key || !value) return;
    if (key.length > 60 || value.length > 200) return;
    if (Object.keys(detailSpecs).length >= 80) return;
    if (!(key in detailSpecs)) detailSpecs[key] = value;
  };

  const specRoots = cfg?.specs_selector
    ? Array.from(document.querySelectorAll(cfg.specs_selector))
    : [document];

  for (const root of specRoots) {
    root.querySelectorAll('table tr').forEach((tr) => {
      const cells = tr.querySelectorAll('th, td');
      if (cells.length === 2) {
        addSpec(cells[0].textContent ?? '', cells[1].textContent ?? '');
      }
    });
    root.querySelectorAll('dl').forEach((dl) => {
      const dts = dl.querySelectorAll('dt');
      const dds = dl.querySelectorAll('dd');
      const count = Math.min(dts.length, dds.length);
      for (let k = 0; k < count; k++) {
        addSpec(dts[k].textContent ?? '', dds[k].textContent ?? '');
      }
    });
  }

  const featureRoots = cfg?.features_selector
    ? Array.from(document.querySelectorAll(cfg.features_selector))
    : specRoots;

  const lineSelector =
    'li, [class*="feature"], [class*="detail"], [class*="spec"], [class*="info"], [class*="amenit"], [class*="char"]';

  for (const root of featureRoots) {
    root.querySelectorAll(lineSelector).forEach((node) => {
      if (node.querySelector('li, ul, ol, table, dl')) return;
      const anchor = node.querySelector('a');
      const text = cleanText(node.textContent);
      if (!text || text.length > 80) return;
      if (anchor && cleanText(anchor.textContent) === text) {
        return;
      }
      const match = text.match(/^(.{1,50}?)\s*[:：]\s*(.+)$/);
      if (match) {
        addSpec(match[1], match[2]);
      } else if (
        featureSet.size < 80 &&
        text.length >= 2 &&
        !/[.!?]/.test(text)
      ) {
        featureSet.add(text);
      }
    });
  }

  let latitude: number | null = null;
  let longitude: number | null = null;
  const MAX_SCRIPT_CHARS = 50_000;
  const parseCoord = (value: string | null | undefined): number | null => {
    if (value == null || value === '') return null;
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
  };
  const isValidCoords = (lat: number, lng: number): boolean =>
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const roundCoord = (n: number): number => Math.round(n * 1e7) / 1e7;
  const acceptCoords = (lat: number | null, lng: number | null) => {
    if (lat == null || lng == null || !isValidCoords(lat, lng)) {
      return false;
    }
    latitude = roundCoord(lat);
    longitude = roundCoord(lng);
    return true;
  };

  const readDataCoords = (el: Element | null): boolean => {
    if (!el) return false;
    const lat = parseCoord(
      el.getAttribute('data-lat') ||
        el.getAttribute('data-latitude') ||
        (el as HTMLElement).dataset?.lat ||
        (el as HTMLElement).dataset?.latitude,
    );
    const lng = parseCoord(
      el.getAttribute('data-lng') ||
        el.getAttribute('data-lon') ||
        el.getAttribute('data-longitude') ||
        (el as HTMLElement).dataset?.lng ||
        (el as HTMLElement).dataset?.lon ||
        (el as HTMLElement).dataset?.longitude,
    );
    return acceptCoords(lat, lng);
  };

  const dataCoordSelectors = [
    '.marker[data-lat][data-lng]',
    '.marker[data-lat][data-lon]',
    '[data-type="exact"][data-lat]',
    '[data-lat][data-lng]',
    '[data-lat][data-lon]',
    '[data-latitude][data-longitude]',
  ];
  for (const sel of dataCoordSelectors) {
    if (readDataCoords(document.querySelector(sel))) break;
  }

  // Leaflet-based map widgets (as opposed to a Google Maps embed)
  // commonly stash both coordinates in a single comma-separated
  // attribute on the map container instead of two separate
  // data-lat/data-lng attributes, e.g.
  // <div id="contact-map" data-default-coords="35.5442,24.0588">.
  if (latitude == null || longitude == null) {
    const readCombinedCoords = (attr: string): boolean => {
      const el = document.querySelector(`[${attr}]`);
      const raw = el?.getAttribute(attr);
      if (!raw) return false;
      const parts = raw.split(',').map((part) => part.trim());
      if (parts.length !== 2) return false;
      return acceptCoords(parseCoord(parts[0]), parseCoord(parts[1]));
    };
    const combinedCoordAttrs = [
      'data-default-coords',
      'data-coords',
      'data-coordinates',
      'data-latlng',
      'data-lat-lng',
      'data-position',
    ];
    for (const attr of combinedCoordAttrs) {
      if (readCombinedCoords(attr)) break;
    }
  }

  if (latitude == null || longitude == null) {
    for (const el of Array.from(
      document.querySelectorAll(
        'a[href*="maps"], a[href*="google.com/maps"], iframe[src*="maps"], iframe[data-src*="maps"]',
      ),
    )) {
      // Map embeds are often lazy-loaded (e.g. lazysizes), so the real
      // URL with coordinates sits in data-src until the iframe scrolls
      // into view and `src` never gets a chance to be set.
      const rawHref =
        el.getAttribute('href') ||
        el.getAttribute('src') ||
        el.getAttribute('data-src') ||
        '';
      // Query params are URL-encoded (e.g. "%2C" for the comma between
      // lat/lng, occasionally with an encoded space too), so decode
      // before matching or the plain-comma regexes below never fire.
      let href = rawHref;
      try {
        href = decodeURIComponent(rawHref);
      } catch {
        /* keep raw if malformed */
      }
      const atMatch = href.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
      if (
        atMatch &&
        acceptCoords(parseCoord(atMatch[1]), parseCoord(atMatch[2]))
      ) {
        break;
      }
      const qMatch = href.match(/[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
      if (
        qMatch &&
        acceptCoords(parseCoord(qMatch[1]), parseCoord(qMatch[2]))
      ) {
        break;
      }
      const llMatch = href.match(/[?&]ll=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
      if (
        llMatch &&
        acceptCoords(parseCoord(llMatch[1]), parseCoord(llMatch[2]))
      ) {
        break;
      }
      // Google Maps Embed API ("Share > Embed a map") encodes
      // lng/lat as !2d<lng>!3d<lat> inside the opaque `pb` param.
      const pbMatch = href.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
      if (
        pbMatch &&
        acceptCoords(parseCoord(pbMatch[2]), parseCoord(pbMatch[1]))
      ) {
        break;
      }
    }
  }

  if (latitude == null || longitude == null) {
    for (const script of Array.from(document.querySelectorAll('script'))) {
      if ((script as HTMLScriptElement).src) continue;
      const text = script.textContent || '';
      if (!text || text.length > MAX_SCRIPT_CHARS) continue;
      if (!/lat|long|lng|setView|LatLng/i.test(text)) continue;

      const realStatusLat = text.match(/\bvar\s+lat\s*=\s*(-?\d+(?:\.\d+)?)/i);
      const realStatusLng = text.match(/\bvar\s+long\s*=\s*(-?\d+(?:\.\d+)?)/i);
      if (
        acceptCoords(
          realStatusLat ? parseCoord(realStatusLat[1]) : null,
          realStatusLng ? parseCoord(realStatusLng[1]) : null,
        )
      ) {
        break;
      }

      const latMatch = text.match(
        /\b(?:let|const)\s+lat(?:itude)?\s*=\s*(-?\d+(?:\.\d+)?)/i,
      );
      const lngMatch =
        text.match(
          /\b(?:let|const)\s+long(?:itude)?\s*=\s*(-?\d+(?:\.\d+)?)/i,
        ) || text.match(/\b(?:var|let|const)\s+lng\s*=\s*(-?\d+(?:\.\d+)?)/i);
      if (
        acceptCoords(
          latMatch ? parseCoord(latMatch[1]) : null,
          lngMatch ? parseCoord(lngMatch[1]) : null,
        )
      ) {
        break;
      }

      const setViewMatch = text.match(
        /\.setView\(\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/,
      );
      if (
        setViewMatch &&
        acceptCoords(parseCoord(setViewMatch[1]), parseCoord(setViewMatch[2]))
      ) {
        break;
      }

      const latLngMatch = text.match(
        /(?:LatLng|latLng)\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/,
      );
      if (
        latLngMatch &&
        acceptCoords(parseCoord(latLngMatch[1]), parseCoord(latLngMatch[2]))
      ) {
        break;
      }
    }
  }

  return {
    images: [...new Set(images)],
    raw_detail_text: descText,
    detail_specs: detailSpecs,
    detail_features: [...featureSet],
    external_id: externalId,
    title: titleText,
    price: priceText,
    location: locationText,
    latitude,
    longitude,
  };
}

/**
 * Merges one detail-page result into its listing item, exactly as a normal crawl does
 * (`DetailEnrichmentService.enrichDetailPages`). `error` marks the page as not read; with
 * `excludeFromCrawl` the item is dropped (the detail page redirected away from the listing).
 */
export function applyDetailResult(
  item: CrawlItem,
  detail: Partial<DetailPageExtraction> & {
    error?: string;
    excludeFromCrawl?: boolean;
    raw_html_path?: string | null;
  },
  detailConfig?: DetailPageConfig | null,
): void {
  if (detail.error) {
    item.raw._detail_enrichment_error = detail.error;
    if (detail.excludeFromCrawl) {
      item.raw._crawl_exclude = true;
    }
    return;
  }
  const listingImages = (item.raw._all_images as string[] | undefined) ?? [];
  const detailImages = detail.images ?? [];
  item.raw._all_images = detailConfig?.listing_image_first
    ? mergeImagesDedupingSizeVariants(listingImages, detailImages)
    : mergeImagesDedupingSizeVariants(detailImages, listingImages);
  item.raw._detail_text = detail.raw_detail_text ?? null;
  item.raw._detail_enriched_at = new Date().toISOString();
  if (detail.detail_specs && Object.keys(detail.detail_specs).length > 0) {
    item.raw._detail_specs = detail.detail_specs;
  }
  if (detail.detail_features && detail.detail_features.length > 0) {
    item.raw._detail_features = detail.detail_features;
  }
  if (detail.external_id) {
    item.raw._external_id = detail.external_id;
  }
  if (detail.title) {
    item.raw.title = detail.title;
  }
  if (detail.price) {
    item.raw.price = detail.price;
  }
  if (detail.location) {
    item.raw.location = detail.location;
  }
  if (detail.latitude != null && detail.longitude != null) {
    item.raw.latitude = detail.latitude;
    item.raw.longitude = detail.longitude;
    item.raw._lat_lng = `${detail.latitude},${detail.longitude}`;
  }
  if (detail.raw_html_path) {
    item.raw._raw_html_path = detail.raw_html_path;
  }
}
