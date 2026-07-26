import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PlatformConfigService } from '@/modules/platform-config/platform-config.service';
import { GcsService } from '@/integrations/storage/gcs/services/gcs.service';
import { GcsFolders } from '@/shared/config/gcs-folders';
import {
  CONTEXT_CLOSE_TIMEOUT_MS,
  DETAIL_HTML_UPLOAD_TIMEOUT_MS,
} from '../constants/crawler.constants';
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
  latitude: number | null;
  longitude: number | null;
  raw_html_path: string | null;
  error?: string;
}

export interface DetailEnrichmentOptions {
  deadlineAt?: number;
  onBatchComplete?: () => void | Promise<void>;
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

    for (let i = 0; i < items.length; i += detail_concurrency) {
      if (options?.deadlineAt != null && Date.now() >= options.deadlineAt) {
        this.logger.warn(
          `Detail enrichment soft-stopped at ${i}/${items.length} (deadline reached)`,
        );
        break;
      }

      const batch = items.slice(i, i + detail_concurrency);
      const results = await Promise.all(
        batch.map((item) =>
          this.enrichOneDetailPage(
            item,
            detailConfig,
            page_timeout_ms,
            sourceAgencyId,
          ),
        ),
      );

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const detail = results[j];
        const listingImages =
          (item.raw._all_images as string[] | undefined) ?? [];
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
        if (detail.latitude != null && detail.longitude != null) {
          item.raw.latitude = detail.latitude;
          item.raw.longitude = detail.longitude;
          item.raw._lat_lng = `${detail.latitude},${detail.longitude}`;
        }
        if (detail.raw_html_path) {
          item.raw._raw_html_path = detail.raw_html_path;
        }
      }

      if (options?.onBatchComplete) {
        await options.onBatchComplete();
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
    sourceAgencyId?: string,
  ): Promise<DetailEnrichmentResult> {
    const empty: DetailEnrichmentResult = {
      images: [],
      raw_detail_text: null,
      detail_specs: {},
      detail_features: [],
      external_id: null,
      latitude: null,
      longitude: null,
      raw_html_path: null,
    };

    const { context, page } = await this.stealthBrowserService.newStealthPage();

    try {
      const response = await page.goto(item.source_url, {
        waitUntil: 'domcontentloaded',
        timeout: pageTimeoutMs,
      });

      if (response && !response.ok()) {
        return { ...empty, error: `HTTP ${response.status()}` };
      }

      await page.waitForTimeout(1000);

      const extracted = await page.evaluate((cfg) => {
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
        const parseCoord = (value: string): number | null => {
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

        for (const script of Array.from(document.querySelectorAll('script'))) {
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
            text.match(/\b(?:var|let|const)\s+lng\s*=\s*(-?\d+(?:\.\d+)?)/i);
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

        return {
          images: [...new Set(images)],
          raw_detail_text: descText,
          detail_specs: detailSpecs,
          detail_features: [...featureSet],
          external_id: externalId,
          latitude,
          longitude,
        };
      }, detailConfig ?? null);

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
      await this.stealthBrowserService.closeContext(
        context,
        CONTEXT_CLOSE_TIMEOUT_MS,
      );
    }
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
