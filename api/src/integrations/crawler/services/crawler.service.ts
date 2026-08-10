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
  ScraperConfig,
} from '../interfaces/scraper-config.interface';
import { crawlTimestamp } from '../utils/crawler.utils';
import {
  INFINITE_SCROLL_MAX_WAIT_MS,
  INFINITE_SCROLL_POLL_INTERVAL_MS,
  INFINITE_SCROLL_STEP_VIEWPORT_RATIO,
} from '../constants/crawler.constants';
import {
  classifyPageAccess,
  waitForBotChallengeClearance,
} from '../block-handling/block-handling.utils';
import { BlockHandlingConfig } from '../block-handling/block-handling.interface';
import { CrawlerDebugService } from './crawler-debug.service';
import { FieldExtractionService } from './field-extraction.service';

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
  ) {}

  async runCrawl(
    config: ScraperConfig,
    diagnosticsCtx: DiagnosticsRunContext,
    options?: CrawlRunOptions,
    blockHandlingConfig?: BlockHandlingConfig,
  ): Promise<CrawlResult> {
    return this.diagnosticsCaptureService.run(diagnosticsCtx, (page) =>
      this.scrapeListingPages(page, config, options, blockHandlingConfig),
    );
  }

  private async scrapeListingPages(
    page: Page,
    config: ScraperConfig,
    options?: CrawlRunOptions,
    blockHandlingConfig?: BlockHandlingConfig,
  ): Promise<CrawlResult> {
    const crawlerConfig = await this.platformConfigService.getCrawlerConfig();
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
      const response = await page.goto(config.start_url, {
        waitUntil: 'domcontentloaded',
        timeout: crawlerConfig.page_timeout_ms,
      });

      await waitForBotChallengeClearance(
        page,
        blockHandlingConfig,
        Math.min(20_000, crawlerConfig.page_timeout_ms),
      );

      await this.dismissCookieConsent(page);

      const accessState = await classifyPageAccess(page, blockHandlingConfig);
      const blocked =
        accessState === 'blocked' || accessState === 'challenge';

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

        const advanced = await this.advancePagination(
          page,
          pagination,
          pageNum,
          log,
          crawlerConfig,
          config.listing_selector,
          blockHandlingConfig,
        );
        if (!advanced) {
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

      success = items.length > 0;
      log('done', { total_items: items.length, pages: pageNum + 1, success });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errorSummary = message;
      log('error', { message });
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

  private async advancePagination(
    page: Page,
    pagination: NonNullable<ScraperConfig['pagination']>,
    pageNum: number,
    log: (msg: string, data?: Record<string, unknown>) => void,
    crawlerConfig: ResolvedCrawlerConfig,
    listingSelector?: string,
    blockHandlingConfig?: BlockHandlingConfig,
  ): Promise<boolean> {
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
          return false;
        }
        const visible = await nextControl.isVisible().catch(() => false);
        const disabled = await nextControl.isDisabled().catch(() => false);
        if (!visible || disabled) {
          log('pagination_end', { reason: 'next_selector_not_clickable' });
          return false;
        }

        const navigated = await this.clickNextAndWaitForChange(
          page,
          nextControl,
          listingSelector,
          crawlerConfig,
        );
        if (!navigated) {
          log('pagination_end', { reason: 'url_unchanged_after_next' });
          return false;
        }
        log('clicked_next', { url: page.url() });
        return true;
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
        return false;
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
        return false;
      }

      const navigated = await this.clickNextAndWaitForChange(
        page,
        nextPageLink,
        listingSelector,
        crawlerConfig,
      );
      if (!navigated) {
        log('pagination_end', { reason: 'url_unchanged_after_page_click' });
        return false;
      }
      log('clicked_page', { page: nextPageNum, url: page.url() });
      return true;
    }

    if (pagination.type === 'load_more' || pagination.type === 'LOAD_MORE') {
      if (!pagination.selector) return false;
      const btn = page.locator(pagination.selector).first();
      const visible = await btn.isVisible().catch(() => false);
      if (!visible) {
        log('pagination_end', { reason: 'load_more_not_visible' });
        return false;
      }
      const prevCount = listingSelector
        ? await page.locator(listingSelector).count().catch(() => 0)
        : 0;
      await btn.click({ timeout: 8000 });
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
      return true;
    }

    if (
      pagination.type === 'infinite_scroll' ||
      pagination.type === 'INFINITE_SCROLL'
    ) {
      const prevCount = listingSelector
        ? await page.locator(listingSelector).count().catch(() => 0)
        : 0;

      const grew = await this.waitForInfiniteScrollGrowth(
        page,
        listingSelector,
        prevCount,
      );

      if (!grew) {
        log('pagination_end', {
          reason: 'scroll_no_new_cards',
          prevCount,
        });
        return false;
      }
      log('infinite_scroll_grew', {
        prevCount,
        count: listingSelector
          ? await page.locator(listingSelector).count().catch(() => prevCount)
          : prevCount,
      });
      return true;
    }

    if (pagination.type === 'url_param' || pagination.type === 'URL_PARAM') {
      const paramName = pagination.url_param ?? 'page';
      const url = new URL(page.url());
      url.searchParams.set(paramName, String(pageNum + 2));
      const response = await page.goto(url.href, {
        waitUntil: 'domcontentloaded',
        timeout: crawlerConfig.page_timeout_ms,
      });
      await waitForBotChallengeClearance(
        page,
        blockHandlingConfig,
        Math.min(15_000, crawlerConfig.page_timeout_ms),
      );
      if (response && !response.ok()) {
        log('network_error', { status: response.status(), url: url.href });
        return false;
      }
      return true;
    }

    return false;
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
          if (labels.some((label) => text === label || text.startsWith(label))) {
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

      await nextControl.click({ timeout: 8000 });
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

      if (urlChanged && fingerprintBefore && listingSelector && !fingerprintChanged) {
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
