import { Injectable, Logger } from '@nestjs/common';
import { Locator, Page } from 'playwright';
import { DiagnosticsCaptureService } from '@/integrations/diagnostics/services/diagnostics-capture.service';
import { DiagnosticsRunContext } from '@/integrations/diagnostics/interfaces/diagnostics.interfaces';
import { PlatformConfigService } from '@/modules/platform-config/platform-config.service';
import { ResolvedCrawlerConfig } from '../interfaces/crawler-runtime-config.interface';
import {
  CrawlItem,
  CrawlResult,
  CrawlStep,
  PaginationAdvanceResult,
  ScraperConfig,
} from '../interfaces/scraper-config.interface';
import {
  crawlTimestamp,
  isManagedSessionDeadError,
  isTransientNavigationError,
  retryTransient,
} from '../utils/crawler.utils';
import {
  CONTEXT_CLOSE_TIMEOUT_MS,
  INFINITE_SCROLL_MAX_WAIT_MS,
  INFINITE_SCROLL_POLL_INTERVAL_MS,
  INFINITE_SCROLL_STEP_VIEWPORT_RATIO,
  MANAGED_BROWSER_MIN_PAGE_TIMEOUT_MS,
  PAGINATION_CLICK_MAX_ATTEMPTS,
  PAGINATION_CLICK_RETRY_DELAY_MS,
  SHARED_PLACEHOLDER_IMAGE_MIN_OCCURRENCES,
  START_PAGE_GOTO_MAX_ATTEMPTS,
  START_PAGE_GOTO_RETRY_DELAY_MS,
} from '../constants/crawler.constants';
import {
  classifyPageAccess,
  waitForBotChallengeClearance,
} from '../block-handling/block-handling.utils';
import { BlockHandlingConfig } from '../block-handling/block-handling.interface';
import { CrawlerDebugService } from './crawler-debug.service';
import { FieldExtractionService } from './field-extraction.service';
import { StealthBrowserService } from './stealth-browser.service';

export interface CrawlRunOptions {
  onPageComplete?: () => void | Promise<void>;
}

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);

  constructor(
    private readonly diagnosticsCaptureService: DiagnosticsCaptureService,
    private readonly fieldExtractionService: FieldExtractionService,
    private readonly crawlerDebugService: CrawlerDebugService,
    private readonly platformConfigService: PlatformConfigService,
    private readonly stealthBrowserService: StealthBrowserService,
  ) {}

  // The listing-page walk holds ONE managed-browser session for its whole
  // (potentially 30+ page) pagination run -- long enough to realistically hit
  // Bright Data's 5-minute-inactivity or 60-minute-hard-cap session limits
  // (confirmed in production: "Target page, context or browser has been
  // closed" mid-walk, after successfully processing 8+ pages). Unlike the
  // detail-page worker pool, there's no queue to hand off to another lane --
  // recover in place by closing the dead context+browser, opening a fresh
  // session, and letting the caller resume pagination from exactly the URL
  // it was trying to reach.
  private async reconnectManagedPage(deadPage: Page): Promise<Page> {
    this.logger.warn('Managed browser session died mid-crawl — reconnecting');
    const deadContext = deadPage.context();
    await this.stealthBrowserService
      .closeContext(deadContext, CONTEXT_CLOSE_TIMEOUT_MS)
      .catch(() => undefined);
    const { page: newPage } = await this.stealthBrowserService.newStealthPage(
      undefined,
      { useManagedBrowser: true, blockImages: true },
    );
    return newPage;
  }

  async runCrawl(
    config: ScraperConfig,
    diagnosticsCtx: DiagnosticsRunContext,
    options?: CrawlRunOptions,
    blockHandlingConfig?: BlockHandlingConfig,
  ): Promise<CrawlResult> {
    return this.diagnosticsCaptureService.run(diagnosticsCtx, (page) =>
      this.scrapeListingPages(
        page,
        config,
        options,
        blockHandlingConfig,
        diagnosticsCtx.useManagedBrowser,
      ),
    );
  }

  private async scrapeListingPages(
    page: Page,
    config: ScraperConfig,
    options?: CrawlRunOptions,
    blockHandlingConfig?: BlockHandlingConfig,
    useManagedBrowser?: boolean,
  ): Promise<CrawlResult> {
    // Bright Data's own docs/examples set a 2-minute page.goto() timeout for
    // the Scraping Browser specifically ("default 30s is too short -- complex
    // anti-bot procedures take time") -- override the platform default just
    // for managed-browser crawls; every crawlerConfig.page_timeout_ms read
    // below picks this up automatically.
    const rawCrawlerConfig =
      await this.platformConfigService.getCrawlerConfig();
    const crawlerConfig = useManagedBrowser
      ? {
          ...rawCrawlerConfig,
          page_timeout_ms: Math.max(
            rawCrawlerConfig.page_timeout_ms,
            MANAGED_BROWSER_MIN_PAGE_TIMEOUT_MS,
          ),
        }
      : rawCrawlerConfig;
    const steps: CrawlStep[] = [];
    const items: CrawlItem[] = [];
    let success = false;
    let errorSummary: string | null = null;
    let networkError = false;
    let zeroListingsPage0 = false;

    const log = (msg: string, data: Record<string, unknown> = {}) => {
      steps.push({ ts: crawlTimestamp(), msg, ...data });
    };

    try {
      log('navigate', { url: config.start_url });
      const initialGoto = await this.gotoWithRetry(
        page,
        config.start_url,
        crawlerConfig.page_timeout_ms,
        log,
        useManagedBrowser,
      );
      page = initialGoto.page;
      const response = initialGoto.response;

      await waitForBotChallengeClearance(
        page,
        blockHandlingConfig,
        // Confirmed live: Bright Data's challenge-solving on this exact site
        // took ~22s in a normal case but a real failed production run logged
        // 4 internal navigations and ran the full 64s -- session-to-session
        // variance means the wait needs the SAME budget as the page load
        // itself (crawlerConfig.page_timeout_ms), not a smaller sub-ceiling.
        useManagedBrowser
          ? crawlerConfig.page_timeout_ms
          : Math.min(20_000, crawlerConfig.page_timeout_ms),
      );

      await this.dismissCookieConsent(page);

      const accessState = await classifyPageAccess(page, blockHandlingConfig);
      const blocked = accessState === 'blocked' || accessState === 'challenge';

      if (blocked || (response && !response.ok())) {
        const status = blocked ? 403 : response!.status();
        networkError = true;
        errorSummary = `HTTP ${status} on ${config.start_url}${
          accessState !== 'ok' ? ` (${accessState})` : ''
        }`;
        log('network_error', { status, blocked, accessState });
        return {
          items,
          steps,
          success: false,
          errorSummary,
          networkError,
          zeroListingsPage0,
        };
      }

      // infinite_scroll / load_more pagination appends new cards to the same DOM
      // list rather than replacing it, so listing_selector keeps matching every
      // card seen so far, not just the newly loaded ones -- track how many we've
      // already extracted so each pass only processes the new tail instead of
      // re-scraping (and re-pushing duplicate items for) the whole list every time.
      const isAccumulatingPagination =
        config.pagination?.type === 'infinite_scroll' ||
        config.pagination?.type === 'INFINITE_SCROLL' ||
        config.pagination?.type === 'load_more' ||
        config.pagination?.type === 'LOAD_MORE';

      let pageNum = 0;
      let prevUrl: string | null = null;
      let prevItemCount = -1;
      let processedCardCount = 0;

      while (pageNum < crawlerConfig.max_pages) {
        const currentUrl = page.url();

        if (
          !isAccumulatingPagination &&
          currentUrl === prevUrl &&
          items.length === prevItemCount
        ) {
          log('pagination_end', { reason: 'no_change_detected' });
          break;
        }
        prevUrl = currentUrl;
        prevItemCount = items.length;

        log(`page_${pageNum}`, { url: currentUrl });

        try {
          await page.waitForSelector(config.listing_selector, {
            timeout: crawlerConfig.selector_timeout_ms,
          });
        } catch {
          log('selector_timeout', {
            selector: config.listing_selector,
            page: pageNum,
          });
          if (pageNum === 0) {
            errorSummary = `listing_selector "${config.listing_selector}" not found on page 0`;
            await this.crawlerDebugService.dumpDebugInfo(
              page,
              config.listing_selector,
            );
          }
          break;
        }

        const cardCount = await page.locator(config.listing_selector).count();
        log('cards_found', { count: cardCount, page: pageNum });

        if (cardCount === 0 && pageNum === 0) {
          zeroListingsPage0 = true;
          errorSummary = `Zero listings found on page 0 with selector "${config.listing_selector}"`;
          break;
        }

        const startIndex = isAccumulatingPagination ? processedCardCount : 0;
        for (let i = startIndex; i < cardCount; i++) {
          const liveCount = await page
            .locator(config.listing_selector)
            .count()
            .catch(() => 0);
          if (i >= liveCount) {
            log('card_dom_changed', {
              index: i,
              expected: cardCount,
              actual: liveCount,
            });
            break;
          }

          const card = page.locator(config.listing_selector).nth(i);
          try {
            const raw: Record<string, unknown> = {};
            for (const [fieldName, fieldDef] of Object.entries(
              config.fields ?? {},
            )) {
              raw[fieldName] = await this.fieldExtractionService.extractField(
                card,
                fieldDef,
              );
            }

            raw._all_images = await card
              .evaluate((el) => {
                const imgs: string[] = [];
                el.querySelectorAll('[style]').forEach((node) => {
                  const match = (node.getAttribute('style') || '').match(
                    /background-image:\s*url\(['"]?(.*?)['"]?\)/,
                  );
                  if (match?.[1]) imgs.push(match[1]);
                });
                el.querySelectorAll('img').forEach((node) => {
                  // Lazy-loaded images often keep a tiny base64 placeholder in
                  // `src` and stash the real URL in a data-* attribute until
                  // the image scrolls into view -- prefer that real URL when
                  // `src` is a data: URI instead of capturing the placeholder.
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
                return [...new Set(imgs)].filter(
                  (src) => !src.startsWith('data:'),
                );
              })
              .catch(() => []);

            let sourceUrl =
              (raw.url as string | null) ?? (raw.href as string | null) ?? null;
            if (sourceUrl && !sourceUrl.startsWith('http')) {
              try {
                sourceUrl = new URL(sourceUrl, currentUrl).href;
              } catch {
                /* keep as-is */
              }
            }
            if (!sourceUrl) sourceUrl = currentUrl;
            items.push({ source_url: sourceUrl, raw });
          } catch (cardErr) {
            const message =
              cardErr instanceof Error ? cardErr.message : String(cardErr);
            log('card_extract_failed', { index: i, message });
          }
        }

        processedCardCount = Math.max(processedCardCount, cardCount);

        if (options?.onPageComplete) {
          await options.onPageComplete();
        }

        const pagination = config.pagination;
        if (
          !pagination ||
          pagination.type === 'none' ||
          pagination.type === 'NONE'
        ) {
          break;
        }

        const advanceResult = await this.advancePagination(
          page,
          pagination,
          pageNum,
          log,
          crawlerConfig,
          config.listing_selector,
          blockHandlingConfig,
          useManagedBrowser,
        );
        if (advanceResult.page) {
          page = advanceResult.page;
        }
        if (!advanceResult.advanced) {
          if (advanceResult.networkError) {
            // A real HTTP failure mid-pagination (e.g. a 5xx on page N) is not the
            // same as "we reached the last page" -- surface it as a genuine failure
            // instead of silently reporting whatever was scraped so far as success.
            networkError = true;
            errorSummary = advanceResult.errorMessage ?? errorSummary;
            break;
          }
          if (isAccumulatingPagination) {
            const trailingCount = await page
              .locator(config.listing_selector)
              .count()
              .catch(() => processedCardCount);
            if (trailingCount > processedCardCount) {
              log('trailing_cards_after_scroll_end', {
                processed: processedCardCount,
                domCount: trailingCount,
              });
              continue;
            }
          }
          break;
        }
        pageNum++;
      }

      this.stripSharedPlaceholderImages(items, log);

      success = networkError ? false : items.length > 0;
      log('done', {
        total_items: items.length,
        pages: pageNum + 1,
        success,
        networkError,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errorSummary = message;
      if (isTransientNavigationError(message)) {
        networkError = true;
      }
      log('error', { message, networkError });
    }

    return {
      items,
      steps,
      success,
      errorSummary,
      networkError,
      zeroListingsPage0,
    };
  }

  private async gotoWithRetry(
    page: Page,
    url: string,
    timeoutMs: number,
    log: (msg: string, data?: Record<string, unknown>) => void,
    useManagedBrowser?: boolean,
  ) {
    try {
      const response = await retryTransient(
        () =>
          page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: timeoutMs,
          }),
        START_PAGE_GOTO_MAX_ATTEMPTS,
        START_PAGE_GOTO_RETRY_DELAY_MS,
        (attempt, message) => log('navigate_retry', { attempt, message }),
      );
      return { page, response };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!useManagedBrowser || !isManagedSessionDeadError(message)) {
        throw err;
      }
      log('managed_session_reconnect', { reason: message, url });
      const freshPage = await this.reconnectManagedPage(page);
      const response = await freshPage.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });
      return { page: freshPage, response };
    }
  }

  // Card-level image extraction (field.image and the broader per-card img/
  // background-image sweep above) has no way to tell a real listing photo from
  // a fallback graphic the site renders for photo-less listings (often the
  // agency's own header logo) -- the URL itself gives no textual hint, unlike
  // "logo.png". A genuine property photo essentially never repeats verbatim
  // across unrelated listings, so treat any image URL seen this often across
  // one crawl's items as a shared placeholder and strip it everywhere.
  private stripSharedPlaceholderImages(
    items: CrawlItem[],
    log: (msg: string, data?: Record<string, unknown>) => void,
  ): void {
    const counts = new Map<string, number>();
    const bump = (url: unknown) => {
      if (typeof url === 'string' && url) {
        counts.set(url, (counts.get(url) ?? 0) + 1);
      }
    };
    for (const item of items) {
      bump(item.raw.image);
      for (const url of (item.raw._all_images as string[] | undefined) ?? []) {
        bump(url);
      }
    }

    const placeholders = new Set(
      [...counts.entries()]
        .filter(
          ([, count]) => count >= SHARED_PLACEHOLDER_IMAGE_MIN_OCCURRENCES,
        )
        .map(([url]) => url),
    );
    if (placeholders.size === 0) return;

    let affectedItems = 0;
    for (const item of items) {
      let affected = false;
      if (
        typeof item.raw.image === 'string' &&
        placeholders.has(item.raw.image)
      ) {
        item.raw.image = null;
        affected = true;
      }
      const allImages = item.raw._all_images as string[] | undefined;
      if (allImages?.length) {
        const filtered = allImages.filter((url) => !placeholders.has(url));
        if (filtered.length !== allImages.length) {
          item.raw._all_images = filtered;
          affected = true;
        }
      }
      if (affected) affectedItems++;
    }

    log('stripped_shared_placeholder_images', {
      urls: [...placeholders],
      affected_items: affectedItems,
    });
  }

  private async advancePagination(
    page: Page,
    pagination: NonNullable<ScraperConfig['pagination']>,
    pageNum: number,
    log: (msg: string, data?: Record<string, unknown>) => void,
    crawlerConfig: ResolvedCrawlerConfig,
    listingSelector?: string,
    blockHandlingConfig?: BlockHandlingConfig,
    useManagedBrowser?: boolean,
  ): Promise<PaginationAdvanceResult> {
    if (
      pagination.type === 'next_button' ||
      pagination.type === 'NEXT_BUTTON'
    ) {
      // Prefer the AI-verified selector for the persistent "next" control. It was
      // confirmed during generation to still resolve after advancing at least once,
      // so it generalizes to sites with many pages (unlike matching page numbers by
      // literal text, which breaks once the current page scrolls out of a windowed
      // pagination widget).
      if (pagination.selector) {
        const nextControl = page.locator(pagination.selector).first();
        const exists = await nextControl.count().catch(() => 0);
        if (!exists) {
          log('pagination_end', { reason: 'next_selector_not_found' });
          return { advanced: false };
        }
        const visible = await nextControl.isVisible().catch(() => false);
        const disabled = await nextControl.isDisabled().catch(() => false);
        if (!visible || disabled) {
          log('pagination_end', { reason: 'next_selector_not_clickable' });
          return { advanced: false };
        }

        const navigated = await this.clickNextAndWaitForChange(
          page,
          nextControl,
          listingSelector,
          crawlerConfig,
          log,
        );
        if (!navigated) {
          log('pagination_end', { reason: 'url_unchanged_after_next' });
          return { advanced: false };
        }
        log('clicked_next', { url: page.url() });
        return { advanced: true };
      }

      // Legacy fallback for configs generated before pagination.selector was
      // required: guess a Bootstrap-style numbered pagination widget.
      const activePage = await page.evaluate(() => {
        const el = document.querySelector(
          '.page-item.active .page-link, .pagination .active a, .page-item.active a',
        );
        return el ? parseInt(el.textContent?.trim() ?? '', 10) : 1;
      });
      const nextPageNum = Number.isNaN(activePage) ? null : activePage + 1;

      if (!nextPageNum) {
        log('pagination_end', { reason: 'cannot_detect_active_page' });
        return { advanced: false };
      }

      const nextPageLink = page
        .locator('.page-item .page-link, .pagination a')
        .filter({ hasText: new RegExp(`^${nextPageNum}$`) })
        .first();
      const exists = await nextPageLink.count().catch(() => 0);
      if (!exists) {
        log('pagination_end', {
          reason: `no_page_link_for_page_${nextPageNum}`,
        });
        return { advanced: false };
      }

      const navigated = await this.clickNextAndWaitForChange(
        page,
        nextPageLink,
        listingSelector,
        crawlerConfig,
        log,
      );
      if (!navigated) {
        log('pagination_end', { reason: 'url_unchanged_after_page_click' });
        return { advanced: false };
      }
      log('clicked_page', { page: nextPageNum, url: page.url() });
      return { advanced: true };
    }

    if (pagination.type === 'load_more' || pagination.type === 'LOAD_MORE') {
      if (!pagination.selector) return { advanced: false };
      const btn = page.locator(pagination.selector).first();
      const visible = await btn.isVisible().catch(() => false);
      if (!visible) {
        log('pagination_end', { reason: 'load_more_not_visible' });
        return { advanced: false };
      }
      const prevCount = listingSelector
        ? await page
            .locator(listingSelector)
            .count()
            .catch(() => 0)
        : 0;
      try {
        await retryTransient(
          () => btn.click({ timeout: 8000 }),
          PAGINATION_CLICK_MAX_ATTEMPTS,
          PAGINATION_CLICK_RETRY_DELAY_MS,
          (retryAttempt, message) =>
            log('pagination_click_retry', { attempt: retryAttempt, message }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log('pagination_end', {
          reason: 'load_more_click_failed_after_retries',
          message,
        });
        return { advanced: false };
      }
      const grew = await this.waitForCardCountIncrease(
        page,
        listingSelector,
        prevCount,
      );
      if (!grew) {
        // Give the fixed pause a chance too -- some "load more" buttons swap
        // content in place (same count, different cards) rather than appending.
        await page.waitForTimeout(crawlerConfig.scroll_pause_ms);
      }
      return { advanced: true };
    }

    if (
      pagination.type === 'infinite_scroll' ||
      pagination.type === 'INFINITE_SCROLL'
    ) {
      const prevCount = listingSelector
        ? await page
            .locator(listingSelector)
            .count()
            .catch(() => 0)
        : 0;

      let grew = await this.waitForInfiniteScrollGrowth(
        page,
        listingSelector,
        prevCount,
      );

      // The very first scroll-growth wait occasionally stalls for the full
      // timeout with zero growth -- the site's lazy-load AJAX never fires,
      // seen intermittently on JetEngine infinite-scroll grids (e.g.
      // domilux.gr), roughly every other crawl. A genuine "fewer listings
      // than one page" end-of-list would fail identically on retry, costing
      // one extra wait cycle; every real multi-page site only reaches this
      // no-growth branch after already growing at least once (pageNum > 0),
      // so this retry is scoped to pageNum 0 only.
      if (!grew && pageNum === 0) {
        log('infinite_scroll_stall_retry', { prevCount });
        await page
          .reload({
            waitUntil: 'domcontentloaded',
            timeout: crawlerConfig.page_timeout_ms,
          })
          .catch(() => undefined);
        if (listingSelector) {
          await page
            .waitForSelector(listingSelector, {
              timeout: crawlerConfig.selector_timeout_ms,
            })
            .catch(() => undefined);
        }
        grew = await this.waitForInfiniteScrollGrowth(
          page,
          listingSelector,
          prevCount,
        );
      }

      if (!grew) {
        log('pagination_end', {
          reason: 'scroll_no_new_cards',
          prevCount,
        });
        return { advanced: false };
      }
      log('infinite_scroll_grew', {
        prevCount,
        count: listingSelector
          ? await page
              .locator(listingSelector)
              .count()
              .catch(() => prevCount)
          : prevCount,
      });
      return { advanced: true };
    }

    if (pagination.type === 'url_param' || pagination.type === 'URL_PARAM') {
      const paramName = pagination.url_param ?? 'page';
      const url = new URL(page.url());
      url.searchParams.set(paramName, String(pageNum + 2));

      let activePage = page;
      let reconnected = false;
      let response;
      try {
        response = await retryTransient(
          () =>
            activePage.goto(url.href, {
              waitUntil: 'domcontentloaded',
              timeout: crawlerConfig.page_timeout_ms,
            }),
          START_PAGE_GOTO_MAX_ATTEMPTS,
          START_PAGE_GOTO_RETRY_DELAY_MS,
          (attempt, message) =>
            log('navigate_retry', { attempt, message, url: url.href }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!useManagedBrowser || !isManagedSessionDeadError(message)) {
          throw err;
        }
        // The session died mid-pagination -- url_param pagination can resume
        // exactly where it left off (unlike next_button/infinite_scroll,
        // which have no direct-access URL to jump back to), so reconnect and
        // retry this SAME target page on a fresh session instead of failing
        // the whole crawl over what's otherwise a recoverable timing issue.
        log('managed_session_reconnect', { reason: message, url: url.href });
        activePage = await this.reconnectManagedPage(page);
        reconnected = true;
        response = await activePage.goto(url.href, {
          waitUntil: 'domcontentloaded',
          timeout: crawlerConfig.page_timeout_ms,
        });
      }

      await waitForBotChallengeClearance(
        activePage,
        blockHandlingConfig,
        useManagedBrowser
          ? crawlerConfig.page_timeout_ms
          : Math.min(15_000, crawlerConfig.page_timeout_ms),
      );
      if (response && !response.ok()) {
        const status = response.status();
        log('network_error', { status, url: url.href });
        return {
          advanced: false,
          networkError: true,
          errorMessage: `HTTP ${status} on ${url.href} while paginating to page ${pageNum + 2}`,
          ...(reconnected && { page: activePage }),
        };
      }
      return { advanced: true, ...(reconnected && { page: activePage }) };
    }

    return { advanced: false };
  }

  private async waitForInfiniteScrollGrowth(
    page: Page,
    listingSelector: string | undefined,
    prevCount: number,
  ): Promise<boolean> {
    if (!listingSelector) return false;

    const deadline = Date.now() + INFINITE_SCROLL_MAX_WAIT_MS;
    while (Date.now() < deadline) {
      const scrolled = await page
        .evaluate((stepRatio) => {
          const maxY = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
          );
          const step = Math.max(window.innerHeight * stepRatio, 200);
          const nextY = Math.min(window.scrollY + step, maxY);
          window.scrollTo(0, nextY);
          return nextY;
        }, INFINITE_SCROLL_STEP_VIEWPORT_RATIO)
        .catch(() => null);

      if (scrolled === null) {
        return false;
      }

      await page
        .locator(listingSelector)
        .last()
        .scrollIntoViewIfNeeded({ timeout: 1000 })
        .catch(() => undefined);

      await page
        .locator(
          '.jet-listing-grid__loader, .jet-listing-grid__loader-spinner, [class*="listing-grid__loader"]',
        )
        .last()
        .scrollIntoViewIfNeeded({ timeout: 500 })
        .catch(() => undefined);

      await page.waitForTimeout(INFINITE_SCROLL_POLL_INTERVAL_MS);

      const currentCount = await page
        .locator(listingSelector)
        .count()
        .catch(() => prevCount);
      if (currentCount > prevCount) {
        await page.waitForTimeout(INFINITE_SCROLL_POLL_INTERVAL_MS);
        return true;
      }
    }

    return false;
  }

  private async dismissCookieConsent(page: Page): Promise<void> {
    await page
      .evaluate(() => {
        const labels = [
          'agree',
          'accept',
          'accept all',
          'allow all',
          'i agree',
          'ok',
          'got it',
        ];
        for (const button of document.querySelectorAll('button')) {
          const text = (button.textContent ?? '').trim().toLowerCase();
          if (
            labels.some((label) => text === label || text.startsWith(label))
          ) {
            button.click();
            return true;
          }
        }
        return false;
      })
      .catch(() => undefined);
    await page.waitForTimeout(300);
  }

  private async waitForCardCountIncrease(
    page: Page,
    listingSelector: string | undefined,
    prevCount: number,
  ): Promise<boolean> {
    if (!listingSelector) return false;
    const deadline = Date.now() + INFINITE_SCROLL_MAX_WAIT_MS;
    while (Date.now() < deadline) {
      await page.waitForTimeout(INFINITE_SCROLL_POLL_INTERVAL_MS);
      const currentCount = await page
        .locator(listingSelector)
        .count()
        .catch(() => prevCount);
      if (currentCount > prevCount) return true;
    }
    return false;
  }

  private async clickNextAndWaitForChange(
    page: Page,
    nextControl: Locator,
    listingSelector: string | undefined,
    crawlerConfig: ResolvedCrawlerConfig,
    log: (msg: string, data?: Record<string, unknown>) => void,
  ): Promise<boolean> {
    const urlBefore = page.url();
    const fingerprintBefore = listingSelector
      ? await this.listingFingerprint(page, listingSelector)
      : null;

    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        const stillThere = await nextControl.count().catch(() => 0);
        if (!stillThere) return false;
        const visible = await nextControl.isVisible().catch(() => false);
        const disabled = await nextControl.isDisabled().catch(() => false);
        if (!visible || disabled) return false;
      }

      try {
        await retryTransient(
          () => nextControl.click({ timeout: 8000 }),
          PAGINATION_CLICK_MAX_ATTEMPTS,
          PAGINATION_CLICK_RETRY_DELAY_MS,
          (retryAttempt, message) =>
            log('pagination_click_retry', { attempt: retryAttempt, message }),
        );
      } catch (err) {
        // The click itself never went through despite retries -- treat this
        // as the end of pagination (like a missing/disabled next control)
        // rather than failing the whole crawl over what we already found.
        const message = err instanceof Error ? err.message : String(err);
        log('pagination_end', {
          reason: 'next_click_failed_after_retries',
          message,
        });
        return false;
      }
      await page
        .waitForLoadState('domcontentloaded', {
          timeout: crawlerConfig.page_timeout_ms,
        })
        .catch(() => undefined);

      const urlChanged = await page
        .waitForFunction((prev) => window.location.href !== prev, urlBefore, {
          timeout: crawlerConfig.selector_timeout_ms,
        })
        .then(() => true)
        .catch(() => false);

      const fingerprintChanged =
        fingerprintBefore && listingSelector
          ? await this.waitForListingFingerprintChange(
              page,
              listingSelector,
              fingerprintBefore,
              crawlerConfig.selector_timeout_ms,
            )
          : false;

      if (!urlChanged && !fingerprintChanged) {
        await page.waitForTimeout(crawlerConfig.scroll_pause_ms);
        continue;
      }

      if (
        urlChanged &&
        fingerprintBefore &&
        listingSelector &&
        !fingerprintChanged
      ) {
        await this.waitForListingFingerprintChange(
          page,
          listingSelector,
          fingerprintBefore,
          crawlerConfig.selector_timeout_ms,
        );
      }

      if (listingSelector) {
        await page
          .waitForSelector(listingSelector, {
            timeout: crawlerConfig.selector_timeout_ms,
          })
          .catch(() => undefined);
      }
      await page.waitForTimeout(1000);
      return true;
    }

    return page.url() !== urlBefore;
  }

  private async waitForListingFingerprintChange(
    page: Page,
    listingSelector: string,
    prev: { href: string; count: number },
    timeout: number,
  ): Promise<boolean> {
    return page
      .waitForFunction(
        ({ selector, previous }) => {
          const card = document.querySelector(selector);
          if (!card) return false;
          const href =
            card.querySelector('a')?.getAttribute('href') ??
            card.textContent?.trim() ??
            '';
          const count = document.querySelectorAll(selector).length;
          return href !== previous.href || count !== previous.count;
        },
        { selector: listingSelector, previous: prev },
        { timeout },
      )
      .then(() => true)
      .catch(() => false);
  }

  private async listingFingerprint(
    page: Page,
    listingSelector: string,
  ): Promise<{ href: string; count: number }> {
    return page.evaluate((selector) => {
      const cards = document.querySelectorAll(selector);
      const first = cards[0];
      const href =
        first?.querySelector('a')?.getAttribute('href') ??
        first?.textContent?.trim() ??
        '';
      return { href, count: cards.length };
    }, listingSelector);
  }
}
