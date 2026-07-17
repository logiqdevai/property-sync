import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import {
  DEFAULT_CHROMIUM_MAX_CONTEXTS_BEFORE_RESTART,
  DEFAULT_CRAWL_JOB_TIMEOUT_MS,
  DEFAULT_CRAWL_WORKER_CONCURRENCY,
  DEFAULT_DETAIL_CONCURRENCY,
  DEFAULT_DETAIL_DELAY_MS,
  DEFAULT_MAX_PAGES,
  DEFAULT_PAGE_TIMEOUT_MS,
  DEFAULT_SCROLL_PAUSE_MS,
  DEFAULT_SELECTOR_TIMEOUT_MS,
} from '@/integrations/crawler/constants/crawler.constants';
import { ResolvedCrawlerConfig } from '@/integrations/crawler/interfaces/crawler-runtime-config.interface';
import { UpdatePlatformConfigDto } from './dto/update-platform-config.dto';
import { PlatformConfig } from 'generated/prisma';

const SINGLETON_ID = 'singleton';

@Injectable()
export class PlatformConfigService {
  // Cached in-memory so high-frequency callers (e.g. a new browser context per
  // crawl page/detail item) don't hit the DB on every call. Invalidated whenever
  // an admin updates the config, so changes apply without a restart. `undefined`
  // means "not fetched yet" -- distinct from a confirmed-missing row (`null`).
  private cachedRow: PlatformConfig | null | undefined = undefined;

  constructor(private readonly prisma: PrismaService) {}

  async getCrawlerConfig(): Promise<ResolvedCrawlerConfig> {
    const row = await this.getCachedRow();

    return {
      max_pages: row?.crawler_max_pages ?? DEFAULT_MAX_PAGES,
      page_timeout_ms: row?.crawler_page_timeout_ms ?? DEFAULT_PAGE_TIMEOUT_MS,
      selector_timeout_ms:
        row?.crawler_selector_timeout_ms ?? DEFAULT_SELECTOR_TIMEOUT_MS,
      scroll_pause_ms: row?.crawler_scroll_pause_ms ?? DEFAULT_SCROLL_PAUSE_MS,
      detail_concurrency: row?.crawler_detail_concurrency ?? DEFAULT_DETAIL_CONCURRENCY,
      detail_delay_ms: row?.crawler_detail_delay_ms ?? DEFAULT_DETAIL_DELAY_MS,
      crawl_worker_concurrency:
        row?.crawler_worker_concurrency ?? DEFAULT_CRAWL_WORKER_CONCURRENCY,
      crawl_job_timeout_ms: row?.crawler_job_timeout_ms ?? DEFAULT_CRAWL_JOB_TIMEOUT_MS,
      chromium_max_contexts_before_restart:
        row?.crawler_chromium_max_contexts_before_restart ??
        DEFAULT_CHROMIUM_MAX_CONTEXTS_BEFORE_RESTART,
    };
  }

  async getRaw(): Promise<PlatformConfig> {
    const existing = await this.getCachedRow();
    if (existing) return existing;

    const created = await this.prisma.platformConfig.create({
      data: { id: SINGLETON_ID },
    });
    this.cachedRow = created;
    return created;
  }

  async update(dto: UpdatePlatformConfigDto): Promise<PlatformConfig> {
    const updated = await this.prisma.platformConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...dto },
      update: dto,
    });

    this.cachedRow = updated;
    return updated;
  }

  private async getCachedRow(): Promise<PlatformConfig | null> {
    if (this.cachedRow !== undefined) return this.cachedRow;

    this.cachedRow = await this.prisma.platformConfig.findUnique({
      where: { id: SINGLETON_ID },
    });
    return this.cachedRow;
  }
}
