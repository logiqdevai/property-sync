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
  PROXY_BROWSER_CHALLENGE_WAIT_MS,
  PROXY_BROWSER_MIN_PAGE_TIMEOUT_MS,
  START_PAGE_GOTO_MAX_ATTEMPTS,
  START_PAGE_GOTO_RETRY_DELAY_MS,
} from '../constants/crawler.constants';
import {
  CrawlItem,
  DetailPageConfig,
} from '../interfaces/scraper-config.interface';
import { BlockHandlingConfig } from '../block-handling/block-handling.interface';
import { ProxyBrowserSession } from '../interfaces/proxy-browser-session.interface';
import {
  classifyPageAccess,
  waitForBotChallengeClearance,
} from '../block-handling/block-handling.utils';
import {
  isBotChallengeUrl,
  isDetailPageRedirectAway,
  isManagedSessionDeadError,
  retryTransient,
  withQueryParams,
} from '../utils/crawler.utils';
import {
  MANAGED_SESSION_MAX_AGE_MS,
  StealthBrowserService,
} from './stealth-browser.service';
import { redactSecrets } from '@/shared/utils/redact-secrets.util';
import { applyDetailResult, extractDetailPage } from '../utils/page-extractors';

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
  // See NewStealthPageOptions.proxySession -- every detail page runs in a
  // local Chromium through the crawl's Webshare proxy (same exit IP and
  // cookie jar as the listing walk), with heavy resources blocked.
  proxySession?: ProxyBrowserSession;
  // Per-scraper override for PlatformConfig.crawler_detail_concurrency
  // (Scraper.detail_concurrency). Undefined = use the platform default.
  detailConcurrencyOverride?: number;
}

export interface DetailEnrichmentSummary {
  total: number;
  // Items whose detail page was actually fetched (successfully or not).
  attempted: number;
  // Items never reached because the deadline hit first. Each carries
  // raw._detail_not_attempted so the caller never persists their card-only data.
  notAttempted: number;
}

// Detail-derived keys on CrawlItem.raw. Kept in one place so a resumed crawl
// can copy a previous run's detail data onto a fresh listing-card item.
const STORED_DETAIL_RAW_KEYS = [
  '_all_images',
  '_detail_text',
  '_detail_specs',
  '_detail_features',
  '_external_id',
  '_lat_lng',
  '_raw_html_path',
  '_detail_enriched_at',
  'latitude',
  'longitude',
] as const;

// Below this much visible body text a "loaded" detail page is not a real page.
const MIN_DETAIL_BODY_TEXT_CHARS = 200;

// A detail page that loaded with an essentially empty body and yielded
// neither its configured gallery nor its description was not really read --
// the origin returned a truncated document (head only) behind a 200.
// Confirmed on cretahouses.gr: such a page was accepted as real, its 0
// gallery photos fell back to the 3 listing-card photos, and that replaced a
// stored 54-photo gallery. Treating it as a failed fetch makes the crawl keep
// the stored data. The body-text check matters: a real, full page for a
// listing that simply has no photos (e.g. some housemarket plots) must still
// count as read so its price/title keep updating.
export function isIncompleteDetailExtraction(
  extracted: { images: string[]; raw_detail_text: string | null },
  detailConfig: DetailPageConfig | null | undefined,
  bodyTextLength: number,
): boolean {
  if (!detailConfig?.image_selector) return false;
  if (extracted.images.length > 0) return false;
  if (detailConfig.description_selector && extracted.raw_detail_text)
    return false;
  return bodyTextLength < MIN_DETAIL_BODY_TEXT_CHARS;
}

export function getDetailEnrichedAt(
  raw: Record<string, unknown> | null | undefined,
): number | null {
  const value = raw?._detail_enriched_at;
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

// Copies a previous crawl's detail-page data onto a fresh listing-card item so
// its detail page doesn't have to be fetched again. Fields the detail page
// overrides (title/price/location) are only carried over when the scraper
// actually configures a selector for them; otherwise the fresh card value wins.
export function applyStoredDetail(
  item: CrawlItem,
  storedRaw: Record<string, unknown>,
  detailConfig?: DetailPageConfig | null,
): void {
  for (const key of STORED_DETAIL_RAW_KEYS) {
    if (storedRaw[key] !== undefined) item.raw[key] = storedRaw[key];
  }
  const overrides: Array<[string, string | undefined]> = [
    ['title', detailConfig?.title_selector],
    ['price', detailConfig?.price_selector],
    ['location', detailConfig?.location_selector],
  ];
  for (const [key, selector] of overrides) {
    if (selector && storedRaw[key] !== undefined)
      item.raw[key] = storedRaw[key];
  }
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
  ): Promise<DetailEnrichmentSummary> {
    if (items.length === 0) {
      return { total: 0, attempted: 0, notAttempted: 0 };
    }

    const {
      detail_concurrency: platformDetailConcurrency,
      detail_delay_ms,
      page_timeout_ms,
    } = await this.platformConfigService.getCrawlerConfig();
    const detail_concurrency =
      options?.detailConcurrencyOverride ?? platformDetailConcurrency;

    this.logger.log(
      `Enriching ${items.length} detail pages (concurrency: ${detail_concurrency})`,
    );

    const useManagedBrowser = options?.useManagedBrowser ?? false;
    // Bright Data's own docs/examples set a 2-minute page.goto() timeout for
    // the Scraping Browser specifically ("default 30s is too short -- complex
    // anti-bot procedures take time") -- the platform default is fine for the
    // local Chromium.
    const proxySession = useManagedBrowser ? undefined : options?.proxySession;
    const effectivePageTimeoutMs = useManagedBrowser
      ? Math.max(page_timeout_ms, MANAGED_BROWSER_MIN_PAGE_TIMEOUT_MS)
      : proxySession
        ? Math.max(page_timeout_ms, PROXY_BROWSER_MIN_PAGE_TIMEOUT_MS)
        : page_timeout_ms;
    const queue = [...items];
    let processedCount = 0;
    let stoppedForDeadline = false;

    const applyResult = (item: CrawlItem, detail: DetailEnrichmentResult) => {
      if (detail.error) {
        this.logger.warn(
          `Detail enrichment skipped for ${item.source_url}: ${detail.error}`,
        );
      }
      applyDetailResult(item, detail, detailConfig);
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

          if (useManagedBrowser || proxySession) {
            const needsRotation =
              !managedBrowser ||
              !managedBrowser.isConnected() ||
              Date.now() - managedBrowserOpenedAt >= MANAGED_SESSION_MAX_AGE_MS;
            if (needsRotation) {
              await closeManagedBrowser();
              managedBrowser = proxySession
                ? await this.stealthBrowserService.openProxyBrowser(
                    proxySession,
                  )
                : await this.stealthBrowserService.openManagedBrowser();
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
            proxySession,
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

    // Whatever is still queued was never fetched. Mark it so the caller keeps
    // the previously stored data (or skips a brand-new listing) instead of
    // saving card-only data -- no description, thumbnail-only images -- as if
    // the detail page had been read.
    for (const item of queue) {
      item.raw._detail_not_attempted = true;
    }

    if (stoppedForDeadline) {
      this.logger.warn(
        `Detail enrichment soft-stopped at ${processedCount}/${items.length} (deadline reached)`,
      );
    }

    return {
      total: items.length,
      attempted: processedCount,
      notAttempted: queue.length,
    };
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
    proxySession?: ProxyBrowserSession,
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
          { useManagedBrowser, blockImages: useManagedBrowser, proxySession },
        )
      : await this.stealthBrowserService.newStealthPage(undefined, {
          useManagedBrowser,
          blockImages: useManagedBrowser,
          proxySession,
        });

    const detailNavUrl = withQueryParams(
      item.source_url,
      detailConfig?.url_query,
    );
    const gotoDetailPage = () =>
      retryTransient(
        () =>
          page.goto(detailNavUrl, {
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
          : Math.min(
              proxySession ? PROXY_BROWSER_CHALLENGE_WAIT_MS : 15_000,
              pageTimeoutMs,
            );

        let accessState = await waitForBotChallengeClearance(
          page,
          blockHandlingConfig,
          challengeWaitMs,
        );

        // 'pending' retried too, not just challenge/blocked: confirmed in
        // production on the listing walk that a transient origin-side hiccup
        // (Cloudflare HTTP 522 "origin connection timed out" on the resource
        // that populates the page's content, not any bot check) leaves the
        // page with a real title but an empty body -- classified 'pending',
        // not 'challenge'/'blocked' -- and is worth exactly this same retry.
        if (
          accessState === 'challenge' ||
          accessState === 'blocked' ||
          accessState === 'pending'
        ) {
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
        // Landing on a bot-challenge URL means we were blocked, not that the
        // listing is gone: no excludeFromCrawl, so the crawl loop keeps the
        // existing SourceProperty alive instead of letting it read as removed.
        if (isBotChallengeUrl(finalUrl)) {
          return {
            ...empty,
            error: 'access barrier: challenge',
          };
        }
        if (isDetailPageRedirectAway(item.source_url, finalUrl)) {
          return {
            ...empty,
            error: `redirected away from listing to ${finalUrl}`,
            excludeFromCrawl: true,
          };
        }

        const extracted = await page.evaluate(
          extractDetailPage,
          detailConfig ?? null,
        );

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

        const bodyTextLength = await page.evaluate(
          () => document.body?.innerText.trim().length ?? 0,
        );
        if (
          isIncompleteDetailExtraction(extracted, detailConfig, bodyTextLength)
        ) {
          return {
            ...empty,
            error:
              'incomplete detail page: no gallery images and no description',
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
        const message = redactSecrets(
          err instanceof Error ? err.message : String(err),
        );
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
