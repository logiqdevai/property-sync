import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
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
import { CrawlerDebugService } from './crawler-debug.service';
import { FieldExtractionService } from './field-extraction.service';

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
  ): Promise<CrawlResult> {
    return this.diagnosticsCaptureService.run(diagnosticsCtx, (page) =>
      this.scrapeListingPages(page, config),
    );
  }

  private async scrapeListingPages(
    page: Page,
    config: ScraperConfig,
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

      if (response && !response.ok()) {
        networkError = true;
        errorSummary = `HTTP ${response.status()} on ${config.start_url}`;
        log('network_error', { status: response.status() });
        return {
          items,
          steps,
          success: false,
          errorSummary,
          networkError,
          zeroListingsPage0,
        };
      }

      await page.waitForTimeout(2000);

      let pageNum = 0;
      let prevUrl: string | null = null;
      let prevItemCount = -1;

      while (pageNum < crawlerConfig.max_pages) {
        const currentUrl = page.url();

        if (currentUrl === prevUrl && items.length === prevItemCount) {
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

        const cards = await page.locator(config.listing_selector).all();
        log('cards_found', { count: cards.length, page: pageNum });

        if (cards.length === 0 && pageNum === 0) {
          zeroListingsPage0 = true;
          errorSummary = `Zero listings found on page 0 with selector "${config.listing_selector}"`;
          break;
        }

        for (let i = 0; i < cards.length; i++) {
          const raw: Record<string, unknown> = {};
          for (const [fieldName, fieldDef] of Object.entries(
            config.fields ?? {},
          )) {
            raw[fieldName] = await this.fieldExtractionService.extractField(
              cards[i],
              fieldDef,
            );
          }

          raw._all_images = await cards[i].evaluate((el) => {
            const imgs: string[] = [];
            el.querySelectorAll('[style]').forEach((node) => {
              const match = (node.getAttribute('style') || '').match(
                /background-image:\s*url\(['"]?(.*?)['"]?\)/,
              );
              if (match?.[1]) imgs.push(match[1]);
            });
            el.querySelectorAll('img').forEach((node) => {
              if (node.src) imgs.push(node.src);
            });
            return [...new Set(imgs)];
          });

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
        );
        if (!advanced) break;
        pageNum++;
      }

      success = items.length > 0;
      log('done', { total_items: items.length, pages: pageNum + 1, success });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errorSummary = message;
      networkError = true;
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
        await nextControl.click({ timeout: 8000 });
        await page
          .waitForLoadState('domcontentloaded', {
            timeout: crawlerConfig.page_timeout_ms,
          })
          .catch(() => undefined);
        await page.waitForTimeout(2000);
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

      await nextPageLink.click({ timeout: 8000 });
      await page
        .waitForLoadState('domcontentloaded', {
          timeout: crawlerConfig.page_timeout_ms,
        })
        .catch(() => undefined);
      await page.waitForTimeout(2000);
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
      await btn.click({ timeout: 8000 });
      await page.waitForTimeout(crawlerConfig.scroll_pause_ms);
      return true;
    }

    if (
      pagination.type === 'infinite_scroll' ||
      pagination.type === 'INFINITE_SCROLL'
    ) {
      const prevHeight = await page.evaluate(() => document.body.scrollHeight);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(crawlerConfig.scroll_pause_ms);
      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === prevHeight) {
        log('pagination_end', { reason: 'scroll_height_unchanged' });
        return false;
      }
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
      if (response && !response.ok()) {
        log('network_error', { status: response.status(), url: url.href });
        return false;
      }
      await page.waitForTimeout(2000);
      return true;
    }

    return false;
  }
}
