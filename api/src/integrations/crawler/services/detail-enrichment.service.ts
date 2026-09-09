import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Browser } from 'playwright';
import { PlatformConfigService } from '@/modules/platform-config/platform-config.service';
import { GcsService } from '@/integrations/storage/gcs/services/gcs.service';
import { GcsFolders } from '@/shared/config/gcs-folders';
import {
  CONTEXT_CLOSE_TIMEOUT_MS,
  DETAIL_HTML_UPLOAD_TIMEOUT_MS,
  MANAGED_BROWSER_MIN_PAGE_TIMEOUT_MS,
  START_PAGE_GOTO_MAX_ATTEMPTS,
  START_PAGE_GOTO_RETRY_DELAY_MS,
} from '../constants/crawler.constants';
import {
  CrawlItem,
  DetailPageConfig,
} from '../interfaces/scraper-config.interface';
import { BlockHandlingConfig } from '../block-handling/block-handling.interface';
import {
  classifyPageAccess,
  waitForBotChallengeClearance,
} from '../block-handling/block-handling.utils';
import {
  isDetailPageRedirectAway,
  isManagedSessionDeadError,
  mergeImagesDedupingSizeVariants,
  retryTransient,
} from '../utils/crawler.utils';
import {
  MANAGED_SESSION_MAX_AGE_MS,
  StealthBrowserService,
} from './stealth-browser.service';

interface DetailEnrichmentResult {
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
  raw_html_path: string | null;
  error?: string;
  excludeFromCrawl?: boolean;
}

export interface DetailEnrichmentOptions {
  deadlineAt?: number;
  onBatchComplete?: () => void | Promise<void>;
  blockHandlingConfig?: BlockHandlingConfig;
  // See NewStealthPageOptions on StealthBrowserService -- routes every detail
  // page through the managed remote browser and skips image bytes.
  useManagedBrowser?: boolean;
}

@Injectable()
export class DetailEnrichmentService {
  private readonly logger = new Logger(DetailEnrichmentService.name);

  constructor(
    private readonly stealthBrowserService: StealthBrowserService,
    private readonly platformConfigService: PlatformConfigService,
    private readonly gcsService: GcsService,
  ) {}

  async enrichDetailPages(
    items: CrawlItem[],
    detailConfig?: DetailPageConfig | null,
    sourceAgencyId?: string,
    options?: DetailEnrichmentOptions,
  ): Promise<void> {
    if (items.length === 0) return;

    const { detail_concurrency, detail_delay_ms, page_timeout_ms } =
      await this.platformConfigService.getCrawlerConfig();

    this.logger.log(
      `Enriching ${items.length} detail pages (concurrency: ${detail_concurrency})`,
    );

    const useManagedBrowser = options?.useManagedBrowser ?? false;
    // Bright Data's own docs/examples set a 2-minute page.goto() timeout for
    // the Scraping Browser specifically ("default 30s is too short -- complex
    // anti-bot procedures take time") -- the platform default is fine for the
    // local Chromium.
    const effectivePageTimeoutMs = useManagedBrowser
      ? Math.max(page_timeout_ms, MANAGED_BROWSER_MIN_PAGE_TIMEOUT_MS)
      : page_timeout_ms;
    const queue = [...items];
    let processedCount = 0;
    let stoppedForDeadline = false;

    const applyResult = (item: CrawlItem, detail: DetailEnrichmentResult) => {
      if (detail.error) {
        item.raw._detail_enrichment_error = detail.error;
        if (detail.excludeFromCrawl) {
          item.raw._crawl_exclude = true;
        }
        this.logger.warn(
          `Detail enrichment skipped for ${item.source_url}: ${detail.error}`,
        );
        return;
      }
      const listingImages =
        (item.raw._all_images as string[] | undefined) ?? [];
      item.raw._all_images = mergeImagesDedupingSizeVariants(
        detail.images,
        listingImages,
      );
      item.raw._detail_text = detail.raw_detail_text;
      if (Object.keys(detail.detail_specs).length > 0) {
        item.raw._detail_specs = detail.detail_specs;
      }
      if (detail.detail_features.length > 0) {
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
    };

    // Each lane owns AT MOST one managed-browser connection at a time, reused
    // sequentially across every item that lane pulls off the shared queue --
    // Bright Data's own FAQ documents "unlimited navigations within the same
    // domain" per session, so reconnecting per item (the previous design) was
    // both unnecessarily slow and prone to connectOverCDP timing out once
    // several lanes reconnect at once. The lane rotates to a fresh connection
    // when it's approaching Bright Data's documented 60-minute hard session
    // cap (MANAGED_SESSION_MAX_AGE_MS), or immediately after any item fails
    // with a session-dead-shaped error (isManagedSessionDeadError) -- e.g.
    // network_inactivity_timeout, or a session that got flagged for
    // navigating off-domain (see isDetailPageRedirectAway) -- so one poisoned
    // connection can't fail every subsequent item in that lane too.
    const runLane = async (): Promise<void> => {
      let managedBrowser: Browser | null = null;
      let managedBrowserOpenedAt = 0;

      const closeManagedBrowser = async () => {
        if (!managedBrowser) return;
        const browser = managedBrowser;
        managedBrowser = null;
        await browser.close().catch(() => undefined);
      };

      try {
        for (;;) {
          if (options?.deadlineAt != null && Date.now() >= options.deadlineAt) {
            stoppedForDeadline = true;
            break;
          }
          const item = queue.shift();
          if (!item) break;

          if (useManagedBrowser) {
            const needsRotation =
              !managedBrowser ||
              !managedBrowser.isConnected() ||
              Date.now() - managedBrowserOpenedAt >= MANAGED_SESSION_MAX_AGE_MS;
            if (needsRotation) {
              await closeManagedBrowser();
              managedBrowser =
                await this.stealthBrowserService.openManagedBrowser();
              managedBrowserOpenedAt = Date.now();
            }
          }

          const detail = await this.enrichOneDetailPage(
            item,
            detailConfig,
            effectivePageTimeoutMs,
            sourceAgencyId,
            options?.blockHandlingConfig,
            useManagedBrowser,
            managedBrowser ?? undefined,
          );

          if (
            useManagedBrowser &&
            detail.error &&
            isManagedSessionDeadError(detail.error)
          ) {
            await closeManagedBrowser();
          }

          applyResult(item, detail);
          processedCount++;

          if (options?.onBatchComplete) {
            await options.onBatchComplete();
          }

          if (queue.length > 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, detail_delay_ms),
            );
          }
        }
      } finally {
        await closeManagedBrowser();
      }
    };

    const laneCount = Math.max(1, detail_concurrency);
    await Promise.all(Array.from({ length: laneCount }, () => runLane()));

    if (stoppedForDeadline) {
      this.logger.warn(
        `Detail enrichment soft-stopped at ${processedCount}/${items.length} (deadline reached)`,
      );
    }
  }

  private async enrichOneDetailPage(
    item: CrawlItem,
    detailConfig: DetailPageConfig | null | undefined,
    pageTimeoutMs: number,
    sourceAgencyId?: string,
    blockHandlingConfig?: BlockHandlingConfig,
    useManagedBrowser?: boolean,
    // When set, this item's page is built on a Browser connection owned and
    // reused by the caller's worker lane (see enrichDetailPages) -- close
    // only the context here, never the browser itself.
    pooledBrowser?: Browser,
  ): Promise<DetailEnrichmentResult> {
    const empty: DetailEnrichmentResult = {
      images: [],
      raw_detail_text: null,
      detail_specs: {},
      detail_features: [],
      external_id: null,
      title: null,
      price: null,
      location: null,
      latitude: null,
      longitude: null,
      raw_html_path: null,
    };

    const { context, page } = pooledBrowser
      ? await this.stealthBrowserService.newStealthPageOnBrowser(
          pooledBrowser,
          undefined,
          { useManagedBrowser, blockImages: useManagedBrowser },
        )
      : await this.stealthBrowserService.newStealthPage(undefined, {
          useManagedBrowser,
          blockImages: useManagedBrowser,
        });

    const gotoDetailPage = () =>
      retryTransient(
        () =>
          page.goto(item.source_url, {
            waitUntil: 'domcontentloaded',
            timeout: pageTimeoutMs,
          }),
        START_PAGE_GOTO_MAX_ATTEMPTS,
        START_PAGE_GOTO_RETRY_DELAY_MS,
        () => undefined,
      );

    let cleanedUp = false;
    const cleanupOnce = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      void this.stealthBrowserService.closeContext(
        context,
        CONTEXT_CLOSE_TIMEOUT_MS,
        { closeBrowser: !pooledBrowser },
      );
    };

    // page.evaluate() (used throughout extraction below) has no built-in
    // timeout in Playwright -- if a managed-browser session goes silently
    // unresponsive mid-page (rather than erroring outright), it hangs
    // forever with nothing to bound it. Race the whole operation against a
    // hard ceiling so one dead session can't hold its connection (and its
    // detail_concurrency slot) open for the rest of the crawl run --
    // confirmed via a run where exactly this hung a single item for 45
    // minutes and then starved every subsequent connectOverCDP() attempt of
    // a free session for the remaining retries. Sized to comfortably cover
    // the worst case: 3 goto retries at pageTimeoutMs each + 2 retry delays +
    // up to two challenge waits, each also up to pageTimeoutMs.
    const DETAIL_PAGE_HARD_TIMEOUT_MS = Math.max(pageTimeoutMs * 6, 120_000);

    const work = (async (): Promise<DetailEnrichmentResult> => {
      try {
        let response = await gotoDetailPage();

        // Confirmed live: Bright Data's challenge-solving took ~22s in a
        // normal case but a real failed production run ran the full 64s --
        // session-to-session variance means the wait needs the SAME budget
        // as the page load itself (pageTimeoutMs), not a smaller sub-ceiling.
        const challengeWaitMs = useManagedBrowser
          ? pageTimeoutMs
          : Math.min(15_000, pageTimeoutMs);

        let accessState = await waitForBotChallengeClearance(
          page,
          blockHandlingConfig,
          challengeWaitMs,
        );

        if (accessState === 'challenge' || accessState === 'blocked') {
          await page.waitForTimeout(2_500);
          response = await gotoDetailPage();
          accessState = await waitForBotChallengeClearance(
            page,
            blockHandlingConfig,
            challengeWaitMs,
          );
        }

        if (
          accessState === 'challenge' ||
          accessState === 'blocked' ||
          accessState === 'pending'
        ) {
          return {
            ...empty,
            error: `access barrier: ${accessState}`,
          };
        }

        // No response.ok() check here: by this point accessState is
        // guaranteed 'ok' (every other value already returned above), and
        // response is the HTTP status from THIS page's goto() -- which can
        // be a stale 403 from a Cloudflare challenge that has since cleared
        // in place (no further navigation, so the response object never
        // updates). Confirmed in production: a listing page with accessState
        // 'ok' and 280 real listing cards in its captured HTML still had
        // response.status() === 403 from the original challenge page. Trust
        // the fresh content classification, not the stale response.

        const finalUrl = page.url();
        if (isDetailPageRedirectAway(item.source_url, finalUrl)) {
          return {
            ...empty,
            error: `redirected away from listing to ${finalUrl}`,
            excludeFromCrawl: true,
          };
        }

        const extracted = await page.evaluate((cfg) => {
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
              if (type === 'background_image') {
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
                descText = preserveDescriptionText(
                  (el as HTMLElement).innerText,
                );
                break;
              }
            }
          }

          const cleanText = (value: string | null | undefined): string =>
            (value || '').replace(/\s+/g, ' ').trim();

          let externalId: string | null = null;
          if (
            cfg?.external_id_source === 'selector' &&
            cfg.external_id_selector
          ) {
            const el = document.querySelector(cfg.external_id_selector);
            const text = cleanText(el?.textContent);
            const stripped = text.replace(
              /^(?:Property\s*ID|Κωδ(?:ικός)?(?:\s+ακινήτου)?|Code|Ref(?:erence)?)\.?\s*[:：\-]?\s*/i,
              '',
            );
            externalId = stripped || null;
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
          const parseCoord = (
            value: string | null | undefined,
          ): number | null => {
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
            for (const script of Array.from(
              document.querySelectorAll('script'),
            )) {
              if ((script as HTMLScriptElement).src) continue;
              const text = script.textContent || '';
              if (!text || text.length > MAX_SCRIPT_CHARS) continue;
              if (!/lat|long|lng|setView|LatLng/i.test(text)) continue;

              const realStatusLat = text.match(
                /\bvar\s+lat\s*=\s*(-?\d+(?:\.\d+)?)/i,
              );
              const realStatusLng = text.match(
                /\bvar\s+long\s*=\s*(-?\d+(?:\.\d+)?)/i,
              );
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
                ) ||
                text.match(
                  /\b(?:var|let|const)\s+lng\s*=\s*(-?\d+(?:\.\d+)?)/i,
                );
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
                acceptCoords(
                  parseCoord(setViewMatch[1]),
                  parseCoord(setViewMatch[2]),
                )
              ) {
                break;
              }

              const latLngMatch = text.match(
                /(?:LatLng|latLng)\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/,
              );
              if (
                latLngMatch &&
                acceptCoords(
                  parseCoord(latLngMatch[1]),
                  parseCoord(latLngMatch[2]),
                )
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
        }, detailConfig ?? null);

        // Some WAF/bot-challenge interstitials (e.g. Imperva's "Pardon Our
        // Interruption" page) delay revealing their challenge content via a
        // client-side timer, so the clearance check above can sample the page
        // before that timer fires and read as 'ok' -- then the reveal lands in
        // the gap between that check and the extraction just above, and we'd
        // otherwise persist the interstitial's own title/text as if it were
        // real listing content. Re-classify right after extraction to catch a
        // late reveal and discard the result instead of accepting it.
        const postExtractState = await classifyPageAccess(
          page,
          blockHandlingConfig,
        );
        if (
          postExtractState === 'blocked' ||
          postExtractState === 'challenge'
        ) {
          return {
            ...empty,
            error: `access barrier revealed after extraction: ${postExtractState}`,
          };
        }

        const html = await page.content();
        const rawHtmlPath = await this.uploadDetailHtml(
          html,
          item.source_url,
          sourceAgencyId,
        );

        return {
          ...extracted,
          raw_html_path: rawHtmlPath,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ...empty, error: message };
      } finally {
        cleanupOnce();
      }
    })();

    const hardTimeout = new Promise<DetailEnrichmentResult>((resolve) => {
      const timer = setTimeout(() => {
        cleanupOnce();
        resolve({
          ...empty,
          error: `detail page hard-timeout after ${DETAIL_PAGE_HARD_TIMEOUT_MS}ms`,
        });
      }, DETAIL_PAGE_HARD_TIMEOUT_MS);
      timer.unref?.();
    });

    return Promise.race([work, hardTimeout]);
  }

  private async uploadDetailHtml(
    html: string,
    sourceUrl: string,
    sourceAgencyId?: string,
  ): Promise<string | null> {
    if (!html) return null;

    try {
      const urlHash = createHash('sha256')
        .update(sourceUrl)
        .digest('hex')
        .slice(0, 16);
      const agencySegment = sourceAgencyId ?? 'unknown';
      const filename = `${agencySegment}/${urlHash}.html`;

      const upload = await Promise.race([
        this.gcsService.uploadImageFromBuffer(
          Buffer.from(html, 'utf8'),
          filename,
          'text/html; charset=utf-8',
          GcsFolders.sourcePropertyHtml,
        ),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), DETAIL_HTML_UPLOAD_TIMEOUT_MS),
        ),
      ]);

      return upload?.path ?? null;
    } catch (error) {
      this.logger.warn(
        `Failed to upload detail HTML for ${sourceUrl}: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }
}
