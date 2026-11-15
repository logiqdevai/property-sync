import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CrawlRunStatus, Prisma, PropertyStatus } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { PropertyNormalizationService } from '@/modules/properties/services/property-normalization.service';
import { isAccessBarrierTitle } from '@/integrations/crawler/block-handling/block-handling.utils';
import type {
  CrawlItem,
  ScraperConfig,
} from '@/integrations/crawler/interfaces/scraper-config.interface';
import {
  contentHash,
  extractDenormalizedRawFields,
  extractPriceFromText,
  extractSourcePropertyIds,
  isBotChallengeUrl,
  isDetailPageRedirectAway,
  mergeImagesDedupingSizeVariants,
} from '@/integrations/crawler/utils/crawler.utils';
import { stripSharedPlaceholdersFromItems } from '@/integrations/crawler/utils/placeholder-images.util';
import {
  applyDetailResult,
  type DetailPageExtraction,
} from '@/integrations/crawler/utils/page-extractors';
import { isIncompleteDetailExtraction } from '@/integrations/crawler/services/detail-enrichment.service';
import {
  DESKTOP_CRAWL_SOURCE,
  DESKTOP_CRAWL_TRANSPORT,
  PENDING_RESTORE_LOOKBACK_MS,
} from '../constants/desktop-crawl.constants';
import type { DesktopCrawlUploadDto } from '../dto/desktop-crawl.schemas';
import {
  DesktopCrawlPhases,
  type DesktopCrawlRunMetadata,
  type DesktopCrawlUploadItem,
} from '../interfaces/desktop-crawl.interfaces';

interface ScraperForIngest {
  id: string;
  source_agency_id: string;
  config: ScraperConfig;
}

/**
 * Ingests a crawl collected by the desktop crawler app into the same pipeline a scheduled crawl
 * uses: SourceProperty upsert (same mapping as crawl.processor.ts and scripts/mcp-crawl-ingest.ts),
 * then the real `normalizeForCrawlRun()`.
 *
 * The CRM is protected the same way the mcp-crawl skill does it (§2): every enabled tracker of the
 * agency with `auto_update_to_crm = true` and an active integration is switched off before
 * anything is written, so new/changed listings are held as `pending_crm_update` for the user to
 * review and push. DesktopCrawlAutoUpdateRestoreCron switches them back on once the crawl's
 * finalization has run. Removals are still pushed, as with any full crawl.
 */
@Injectable()
export class DesktopCrawlIngestService {
  private readonly logger = new Logger(DesktopCrawlIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly propertyNormalizationService: PropertyNormalizationService,
  ) {}

  /** Creates the CrawlRun and starts the ingest in the background; returns the run id at once. */
  async startIngest(
    scraperId: string,
    upload: DesktopCrawlUploadDto,
    userId: string,
  ): Promise<{ crawl_run_id: string }> {
    const scraper = await this.loadScraper(scraperId);

    const running = await this.prisma.crawlRun.findFirst({
      where: {
        scraper_id: scraper.id,
        status: CrawlRunStatus.RUNNING,
        metadata: { path: ['transport'], equals: DESKTOP_CRAWL_TRANSPORT },
      },
      select: { id: true },
    });
    if (running) {
      throw new ConflictException(
        'This agency is already being saved. Wait a minute and try again.',
      );
    }

    const startedAt = new Date();
    const crawlRun = await this.prisma.crawlRun.create({
      data: {
        source_agency_id: scraper.source_agency_id,
        scraper_id: scraper.id,
        status: CrawlRunStatus.RUNNING,
        started_at: startedAt,
        metadata: {
          source: DESKTOP_CRAWL_SOURCE,
          transport: DESKTOP_CRAWL_TRANSPORT,
          desktop_crawl: {
            uploaded_by: userId,
            uploaded_items: upload.items.length,
            complete: upload.complete,
            phase: DesktopCrawlPhases.SAVING,
            restore_auto_update_ids: [],
            auto_update_restored_at: null,
            restore_handed_to: null,
            stats: upload.stats ?? {},
          } satisfies DesktopCrawlRunMetadata,
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    // Switch auto-update off before anything is written (and before replying), so nothing this
    // run produces can reach the CRM on its own.
    await this.holdAutoUpdate(crawlRun.id, scraper.source_agency_id);

    void this.ingest(crawlRun.id, scraper, upload, startedAt).catch((error) =>
      this.logger.error(
        `desktop crawl ${crawlRun.id} ingest crashed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );

    return { crawl_run_id: crawlRun.id };
  }

  private async loadScraper(scraperId: string): Promise<ScraperForIngest> {
    const scraper = await this.prisma.scraper.findUnique({
      where: { id: scraperId },
      select: {
        id: true,
        source_agency_id: true,
        active_version: { select: { config: true } },
      },
    });
    if (!scraper) throw new NotFoundException('Scraper not found');
    return {
      id: scraper.id,
      source_agency_id: scraper.source_agency_id,
      config: (scraper.active_version?.config ??
        {}) as unknown as ScraperConfig,
    };
  }

  /**
   * Turns auto_update_to_crm off for this agency's live trackers and records which ones, so the
   * restore cron can turn exactly those back on. A pending restore of an earlier desktop run of the
   * same agency is taken over by this run -- otherwise that restore could switch auto-update back
   * on while this run's finalization is still to come.
   */
  private async holdAutoUpdate(
    crawlRunId: string,
    sourceAgencyId: string,
  ): Promise<void> {
    const candidates = await this.prisma.crawlRun.findMany({
      where: {
        id: { not: crawlRunId },
        source_agency_id: sourceAgencyId,
        metadata: { path: ['transport'], equals: DESKTOP_CRAWL_TRANSPORT },
        created_at: { gte: new Date(Date.now() - PENDING_RESTORE_LOOKBACK_MS) },
      },
      select: { id: true, metadata: true },
    });
    const pending = candidates.filter((run) => {
      const desktop = (
        run.metadata as { desktop_crawl?: DesktopCrawlRunMetadata }
      ).desktop_crawl;
      return (
        !!desktop &&
        !desktop.auto_update_restored_at &&
        !desktop.restore_handed_to
      );
    });

    const ids = new Set<string>();
    for (const run of pending) {
      const meta = run.metadata as {
        desktop_crawl?: DesktopCrawlRunMetadata;
      };
      const taken = meta.desktop_crawl?.restore_auto_update_ids ?? [];
      if (taken.length === 0) continue;
      taken.forEach((id) => ids.add(id));
      await this.patchDesktopMetadata(run.id, {
        restore_handed_to: crawlRunId,
      });
    }

    const live = await this.prisma.userTrackedAgency.findMany({
      where: {
        source_agency_id: sourceAgencyId,
        enabled: true,
        auto_update_to_crm: true,
        integration_link: { user_integration: { is_active: true } },
      },
      select: { id: true },
    });
    if (live.length > 0) {
      await this.prisma.userTrackedAgency.updateMany({
        where: { id: { in: live.map((t) => t.id) }, auto_update_to_crm: true },
        data: { auto_update_to_crm: false },
      });
      live.forEach((t) => ids.add(t.id));
    }

    if (ids.size > 0) {
      this.logger.log(
        `desktop crawl ${crawlRunId}: auto-update held for ${ids.size} tracker(s) until finalization`,
      );
      await this.patchDesktopMetadata(crawlRunId, {
        restore_auto_update_ids: [...ids],
      });
    }
  }

  private async ingest(
    crawlRunId: string,
    scraper: ScraperForIngest,
    upload: DesktopCrawlUploadDto,
    startedAt: Date,
  ): Promise<void> {
    try {
      const items = this.buildCrawlItems(
        upload.items as DesktopCrawlUploadItem[],
        scraper.config,
      );
      const { created, updated, unique } = await this.upsertSourceProperties(
        scraper.source_agency_id,
        items,
      );

      const finishedAt = new Date();
      const failed = unique === 0;
      await this.prisma.crawlRun.update({
        where: { id: crawlRunId },
        data: {
          status: failed ? CrawlRunStatus.FAILED : CrawlRunStatus.SUCCESS,
          finished_at: finishedAt,
          duration_ms: finishedAt.getTime() - startedAt.getTime(),
          total_found: unique,
          total_new_listings: created,
          total_refreshed_listings: updated,
          error_message: failed ? 'No listings could be saved' : null,
        },
      });

      if (failed) {
        await this.patchDesktopMetadata(crawlRunId, {
          phase: DesktopCrawlPhases.FAILED,
        });
        await this.restoreNow(crawlRunId);
        return;
      }

      await this.patchDesktopMetadata(crawlRunId, {
        phase: DesktopCrawlPhases.NORMALIZING,
      });
      await this.propertyNormalizationService.normalizeForCrawlRun(crawlRunId);
      this.logger.log(
        `desktop crawl ${crawlRunId}: ${created} new, ${updated} refreshed; normalization started`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`desktop crawl ${crawlRunId} failed: ${message}`);
      const now = new Date();
      await this.prisma.crawlRun
        .update({
          where: { id: crawlRunId },
          data: {
            status: CrawlRunStatus.FAILED,
            finished_at: now,
            duration_ms: now.getTime() - startedAt.getTime(),
            error_message: message.slice(0, 2000),
          },
        })
        .catch(() => undefined);
      await this.patchDesktopMetadata(crawlRunId, {
        phase: DesktopCrawlPhases.FAILED,
      }).catch(() => undefined);
      // Normalization never started, so nothing will finalize: restore right away.
      await this.restoreNow(crawlRunId).catch(() => undefined);
    }
  }

  /**
   * Turns the listing cards + raw detail results into CrawlItems the way a scheduled crawl does:
   * shared placeholder photos stripped from the cards first, then each detail result checked for
   * a bot wall / redirect / truncated page and merged with `applyDetailResult`.
   */
  private buildCrawlItems(
    uploaded: DesktopCrawlUploadItem[],
    config: ScraperConfig,
  ): CrawlItem[] {
    const seen = new Set<string>();
    const items: Array<CrawlItem & { upload: DesktopCrawlUploadItem }> = [];
    for (const u of uploaded) {
      if (seen.has(u.source_url)) continue;
      seen.add(u.source_url);
      items.push({ source_url: u.source_url, raw: { ...u.raw }, upload: u });
    }

    stripSharedPlaceholdersFromItems(items);

    const detailConfig = config.detail_page ?? null;
    for (const item of items) {
      const u = item.upload;
      if (u.detail_error) {
        applyDetailResult(item, { error: u.detail_error }, detailConfig);
        continue;
      }
      if (!u.detail) continue;

      const finalUrl = u.detail_final_url ?? null;
      if (finalUrl && isBotChallengeUrl(finalUrl)) {
        applyDetailResult(item, { error: 'access barrier: challenge' });
        continue;
      }
      if (finalUrl && isDetailPageRedirectAway(item.source_url, finalUrl)) {
        applyDetailResult(item, {
          error: `redirected away from listing to ${finalUrl}`,
          excludeFromCrawl: true,
        });
        continue;
      }

      const detail = this.toDetailExtraction(u.detail);
      if (
        isIncompleteDetailExtraction(
          detail,
          detailConfig,
          u.detail_body_text_length ?? Number.MAX_SAFE_INTEGER,
        )
      ) {
        applyDetailResult(item, {
          error: 'incomplete detail page: no gallery images and no description',
        });
        continue;
      }
      applyDetailResult(item, detail, detailConfig);
    }

    return items.map(({ source_url, raw }) => ({ source_url, raw }));
  }

  private toDetailExtraction(
    detail: Record<string, unknown>,
  ): DetailPageExtraction {
    const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
    const num = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;
    const specs: Record<string, string> = {};
    if (detail.detail_specs && typeof detail.detail_specs === 'object') {
      for (const [k, v] of Object.entries(detail.detail_specs)) {
        if (typeof v === 'string') specs[k] = v;
      }
    }
    return {
      images: Array.isArray(detail.images)
        ? detail.images.filter((x): x is string => typeof x === 'string')
        : [],
      raw_detail_text: str(detail.raw_detail_text),
      detail_specs: specs,
      detail_features: Array.isArray(detail.detail_features)
        ? detail.detail_features.filter(
            (x): x is string => typeof x === 'string',
          )
        : [],
      external_id: str(detail.external_id),
      title: str(detail.title),
      price: str(detail.price),
      location: str(detail.location),
      latitude: num(detail.latitude),
      longitude: num(detail.longitude),
    };
  }

  // Mirrors crawl.processor.ts's SourceProperty-upsert loop (same field mapping, same pure
  // utility functions) -- see that file, and scripts/mcp-crawl-ingest.ts, if this drifts.
  private async upsertSourceProperties(
    sourceAgencyId: string,
    items: CrawlItem[],
  ): Promise<{ created: number; updated: number; unique: number }> {
    const seenUrls = new Set<string>();
    let created = 0;
    let updated = 0;
    const now = new Date();

    for (const item of items) {
      if (seenUrls.has(item.source_url)) continue;
      const raw = item.raw ?? {};
      if (raw._crawl_exclude === true) continue;
      seenUrls.add(item.source_url);

      if (Array.isArray(raw._all_images)) {
        raw._all_images = mergeImagesDedupingSizeVariants(
          raw._all_images as string[],
        );
      }

      const denormalized = extractDenormalizedRawFields(raw);
      const { property_id: propertyId, internal_id: internalId } =
        extractSourcePropertyIds(item.source_url, raw);
      const priceText =
        (raw.price as string | undefined) ??
        extractPriceFromText(
          raw.title as string | undefined,
          raw._detail_text as string | undefined,
        ) ??
        null;
      const hash = contentHash({
        url: item.source_url,
        title: raw.title,
        price: priceText,
      });

      const key = {
        source_agency_id_source_url: {
          source_agency_id: sourceAgencyId,
          source_url: item.source_url,
        },
      };
      const existing = await this.prisma.sourceProperty.findUnique({
        where: key,
        select: { id: true },
      });

      const detailFailed =
        typeof raw._detail_enrichment_error === 'string' &&
        raw._detail_enrichment_error.length > 0;
      const barrierTitle = isAccessBarrierTitle(
        typeof raw.title === 'string' ? raw.title : null,
      );

      // A page we couldn't read must not overwrite good stored data: just keep it alive.
      if (existing && (detailFailed || barrierTitle)) {
        await this.prisma.sourceProperty.update({
          where: { id: existing.id },
          data: { last_seen_at: now, status: PropertyStatus.ACTIVE },
        });
        updated += 1;
        continue;
      }

      const safeTitle = barrierTitle
        ? null
        : ((raw.title as string | undefined) ?? null);
      const fields = {
        property_id: propertyId,
        internal_id: internalId,
        raw_title: safeTitle,
        raw_description: (raw._detail_text as string | undefined) ?? null,
        raw_price: priceText,
        raw_location: (raw.location as string | undefined) ?? null,
        ...denormalized,
        raw_data: raw as Prisma.InputJsonValue,
        content_hash: hash,
        last_seen_at: now,
        status: PropertyStatus.ACTIVE,
      };

      await this.prisma.sourceProperty.upsert({
        where: key,
        create: {
          source_agency_id: sourceAgencyId,
          source_url: item.source_url,
          first_seen_at: now,
          ...fields,
        },
        update: fields,
      });

      if (existing) updated += 1;
      else created += 1;
    }

    return { created, updated, unique: seenUrls.size };
  }

  /** Restores held auto-update flags immediately (used when the run fails before normalization). */
  async restoreNow(crawlRunId: string): Promise<void> {
    const run = await this.prisma.crawlRun.findUnique({
      where: { id: crawlRunId },
      select: { metadata: true },
    });
    const desktop = (
      run?.metadata as { desktop_crawl?: DesktopCrawlRunMetadata }
    )?.desktop_crawl;
    if (
      !desktop ||
      desktop.auto_update_restored_at ||
      desktop.restore_handed_to
    ) {
      return;
    }
    if (desktop.restore_auto_update_ids.length > 0) {
      await this.prisma.userTrackedAgency.updateMany({
        where: {
          id: { in: desktop.restore_auto_update_ids },
          auto_update_to_crm: false,
        },
        data: { auto_update_to_crm: true },
      });
    }
    await this.patchDesktopMetadata(crawlRunId, {
      auto_update_restored_at: new Date().toISOString(),
    });
  }

  /**
   * Merges `patch` into metadata.desktop_crawl in one statement, so it can never overwrite keys
   * the normalization pipeline writes to the same column (normalization_status etc.).
   */
  async patchDesktopMetadata(
    crawlRunId: string,
    patch: Partial<DesktopCrawlRunMetadata>,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      update crawl_runs
      set metadata = jsonb_set(
            coalesce(metadata, '{}'::jsonb),
            '{desktop_crawl}',
            coalesce(metadata->'desktop_crawl', '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb
          ),
          updated_at = now()
      where id = ${crawlRunId}`;
  }
}
