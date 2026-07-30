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
import { DEFAULT_AZURE_TRANSLATE_COST_PER_MILLION_CHARS } from '@/integrations/azure-translate/constants/azure-translate.constants';
import { DEFAULT_GOOGLE_TRANSLATE_COST_PER_MILLION_CHARS } from '@/integrations/google-translate/constants/google-translate.constants';
import { DEFAULT_AI_RAW_DESCRIPTION_MAX_CHARS } from '@/modules/properties/constants/normalization.constants';
import { UpdatePlatformConfigDto } from './dto/update-platform-config.dto';
import {
  IntegrationType,
  PlatformConfig,
  TranslationProvider,
} from 'generated/prisma';

const SINGLETON_ID = 'singleton';

const DEFAULT_DEWATERMARK_COST_PER_IMAGE = 0.02;
const DEFAULT_TRANSLATION_PROVIDER = TranslationProvider.GOOGLE_TRANSLATE;

const CACHE_TTL_MS = 30_000;

export interface ResolvedNormalizationConfig {
  ai_raw_description_max_chars: number;
}

@Injectable()
export class PlatformConfigService {
  private cachedRow: PlatformConfig | null | undefined = undefined;
  private cachedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async getCrawlerConfig(): Promise<ResolvedCrawlerConfig> {
    const row = await this.getCachedRow();

    return {
      max_pages: row?.crawler_max_pages ?? DEFAULT_MAX_PAGES,
      page_timeout_ms: row?.crawler_page_timeout_ms ?? DEFAULT_PAGE_TIMEOUT_MS,
      selector_timeout_ms:
        row?.crawler_selector_timeout_ms ?? DEFAULT_SELECTOR_TIMEOUT_MS,
      scroll_pause_ms: row?.crawler_scroll_pause_ms ?? DEFAULT_SCROLL_PAUSE_MS,
      detail_concurrency:
        row?.crawler_detail_concurrency ?? DEFAULT_DETAIL_CONCURRENCY,
      detail_delay_ms: row?.crawler_detail_delay_ms ?? DEFAULT_DETAIL_DELAY_MS,
      crawl_worker_concurrency:
        row?.crawler_worker_concurrency ?? DEFAULT_CRAWL_WORKER_CONCURRENCY,
      crawl_job_timeout_ms:
        row?.crawler_job_timeout_ms ?? DEFAULT_CRAWL_JOB_TIMEOUT_MS,
      chromium_max_contexts_before_restart:
        row?.crawler_chromium_max_contexts_before_restart ??
        DEFAULT_CHROMIUM_MAX_CONTEXTS_BEFORE_RESTART,
    };
  }

  async getNormalizationConfig(): Promise<ResolvedNormalizationConfig> {
    const row = await this.getCachedRow();

    return {
      ai_raw_description_max_chars:
        row?.normalization_ai_raw_description_max_chars ??
        DEFAULT_AI_RAW_DESCRIPTION_MAX_CHARS,
    };
  }

  async getDewatermarkCostPerImage(): Promise<number> {
    const row = await this.getCachedRow();
    const value = row?.dewatermark_cost_per_image;
    return value !== null && value !== undefined
      ? Number(value)
      : DEFAULT_DEWATERMARK_COST_PER_IMAGE;
  }

  async getGoogleTranslateCostPerMillionChars(): Promise<number> {
    const row = await this.getCachedRow();
    const value = row?.google_translate_cost_per_million_chars;
    return value !== null && value !== undefined
      ? Number(value)
      : DEFAULT_GOOGLE_TRANSLATE_COST_PER_MILLION_CHARS;
  }

  async getAzureTranslateCostPerMillionChars(): Promise<number> {
    const row = await this.getCachedRow();
    const value = row?.azure_translate_cost_per_million_chars;
    return value !== null && value !== undefined
      ? Number(value)
      : DEFAULT_AZURE_TRANSLATE_COST_PER_MILLION_CHARS;
  }

  async getTranslationProvider(): Promise<TranslationProvider> {
    const row = await this.prisma.platformConfig.findUnique({
      where: { id: SINGLETON_ID },
      select: { translation_provider: true },
    });
    this.cachedAt = 0;
    return row?.translation_provider ?? DEFAULT_TRANSLATION_PROVIDER;
  }

  async getTranslateCost(
    provider:
      | typeof IntegrationType.GOOGLE_TRANSLATE
      | typeof IntegrationType.AZURE,
    characterCount: number,
  ): Promise<number> {
    const costPerMillion =
      provider === IntegrationType.AZURE
        ? await this.getAzureTranslateCostPerMillionChars()
        : await this.getGoogleTranslateCostPerMillionChars();
    return (characterCount * costPerMillion) / 1_000_000;
  }

  toCostLogProvider(
    provider: TranslationProvider | string,
  ): typeof IntegrationType.GOOGLE_TRANSLATE | typeof IntegrationType.AZURE {
    return provider === TranslationProvider.AZURE || provider === 'AZURE'
      ? IntegrationType.AZURE
      : IntegrationType.GOOGLE_TRANSLATE;
  }

  async getRaw(): Promise<PlatformConfig> {
    const existing = await this.getCachedRow();
    if (existing) return existing;

    const created = await this.prisma.platformConfig.create({
      data: { id: SINGLETON_ID },
    });
    this.setCachedRow(created);
    return created;
  }

  async update(dto: UpdatePlatformConfigDto): Promise<PlatformConfig> {
    const updated = await this.prisma.platformConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...dto },
      update: dto,
    });

    this.setCachedRow(updated);
    return updated;
  }

  private async getCachedRow(): Promise<PlatformConfig | null> {
    const isStale =
      this.cachedRow === undefined || Date.now() - this.cachedAt > CACHE_TTL_MS;
    if (!isStale) return this.cachedRow as PlatformConfig | null;

    const row = await this.prisma.platformConfig.findUnique({
      where: { id: SINGLETON_ID },
    });
    this.setCachedRow(row);
    return row;
  }

  private setCachedRow(row: PlatformConfig | null): void {
    this.cachedRow = row;
    this.cachedAt = Date.now();
  }
}
