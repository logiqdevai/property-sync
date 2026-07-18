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
  detail_specs: Record<string, string>;
  detail_features: string[];
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
        if (Object.keys(detail.detail_specs).length > 0) {
          item.raw._detail_specs = detail.detail_specs;
        }
        if (detail.detail_features.length > 0) {
          item.raw._detail_features = detail.detail_features;
        }
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
          detail_specs: {},
          detail_features: [],
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

        const cleanText = (value: string | null | undefined): string =>
          (value || '').replace(/\s+/g, ' ').trim();

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
            if (
              anchor &&
              cleanText(anchor.textContent) === text
            ) {
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

        return {
          images: [...new Set(images)],
          raw_detail_text: descText,
          detail_specs: detailSpecs,
          detail_features: [...featureSet],
          external_id: externalId,
        };
      }, detailConfig ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        images: [],
        raw_detail_text: null,
        detail_specs: {},
        detail_features: [],
        external_id: null,
        error: message,
      };
    } finally {
      await context.close().catch(() => undefined);
    }
  }
}
