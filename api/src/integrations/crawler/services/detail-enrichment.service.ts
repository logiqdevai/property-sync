import { Injectable, Logger } from '@nestjs/common';
import { PlatformConfigService } from '@/modules/platform-config/platform-config.service';
import {
  CrawlItem,
  DetailPageConfig,
} from '../interfaces/scraper-config.interface';
import { StealthBrowserService } from './stealth-browser.service';

interface DetailEnrichmentResult {
  images: string[];
  raw_detail_text: string | null;
  external_id: string | null;
  error?: string;
}

@Injectable()
export class DetailEnrichmentService {
  private readonly logger = new Logger(DetailEnrichmentService.name);

  constructor(
    private readonly stealthBrowserService: StealthBrowserService,
    private readonly platformConfigService: PlatformConfigService,
  ) {}

  async enrichDetailPages(
    items: CrawlItem[],
    detailConfig?: DetailPageConfig | null,
  ): Promise<void> {
    if (items.length === 0) return;

    const { detail_concurrency, detail_delay_ms, page_timeout_ms } =
      await this.platformConfigService.getCrawlerConfig();

    this.logger.log(
      `Enriching ${items.length} detail pages (concurrency: ${detail_concurrency})`,
    );

    for (let i = 0; i < items.length; i += detail_concurrency) {
      const batch = items.slice(i, i + detail_concurrency);
      const results = await Promise.all(
        batch.map((item) =>
          this.enrichOneDetailPage(item, detailConfig, page_timeout_ms),
        ),
      );

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const detail = results[j];
        const listingImages = (item.raw._all_images as string[] | undefined) ?? [];
        item.raw._all_images = [
          ...new Set([...detail.images, ...listingImages]),
        ];
        item.raw._detail_text = detail.raw_detail_text;
        if (detail.external_id) {
          item.raw._external_id = detail.external_id;
        }
      }

      if (i + detail_concurrency < items.length) {
        await new Promise((resolve) => setTimeout(resolve, detail_delay_ms));
      }
    }
  }

  private async enrichOneDetailPage(
    item: CrawlItem,
    detailConfig: DetailPageConfig | null | undefined,
    pageTimeoutMs: number,
  ): Promise<DetailEnrichmentResult> {
    const { context, page } =
      await this.stealthBrowserService.newStealthPage();

    try {
      const response = await page.goto(item.source_url, {
        waitUntil: 'domcontentloaded',
        timeout: pageTimeoutMs,
      });

      if (response && !response.ok()) {
        return {
          images: [],
          raw_detail_text: null,
          external_id: null,
          error: `HTTP ${response.status()}`,
        };
      }

      await page.waitForTimeout(1000);

      return await page.evaluate((cfg) => {
        const images: string[] = [];

        if (cfg?.image_selector) {
          const type = cfg.image_type ?? 'src';
          document.querySelectorAll(cfg.image_selector).forEach((el) => {
            if (type === 'background_image') {
              const match = (el.getAttribute('style') || '').match(
                /background-image:\s*url\(['"]?(.*?)['"]?\)/,
              );
              if (match?.[1]) images.push(match[1]);
            } else if (el instanceof HTMLImageElement && el.src) {
              images.push(el.src);
            }
          });
        } else {
          document.querySelectorAll('[style]').forEach((el) => {
            const match = (el.getAttribute('style') || '').match(
              /background-image:\s*url\(['"]?(.*?)['"]?\)/,
            );
            if (match?.[1] && !match[1].endsWith('.svg')) images.push(match[1]);
          });
          document.querySelectorAll('img').forEach((el) => {
            if (
              el.src &&
              !el.src.endsWith('.svg') &&
              !el.src.includes('logo') &&
              !el.src.includes('icon')
            ) {
              images.push(el.src);
            }
          });
        }

        let descText: string | null = null;
        if (cfg?.description_selector) {
          const el = document.querySelector(cfg.description_selector);
          descText = el
            ? (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim()
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
              descText = (el as HTMLElement).innerText
                .replace(/\s+/g, ' ')
                .trim();
              break;
            }
          }
        }

        let externalId: string | null = null;
        if (
          cfg?.external_id_source === 'selector' &&
          cfg.external_id_selector
        ) {
          const el = document.querySelector(cfg.external_id_selector);
          externalId = el?.textContent?.trim() ?? null;
        }

        return {
          images: [...new Set(images)],
          raw_detail_text: descText,
          external_id: externalId,
        };
      }, detailConfig ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        images: [],
        raw_detail_text: null,
        external_id: null,
        error: message,
      };
    } finally {
      await context.close().catch(() => undefined);
    }
  }
}
