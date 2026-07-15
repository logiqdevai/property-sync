import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CRAWL_QUEUE } from '@/core/queues/queues.constants';
import { CRAWL_WORKER_CONCURRENCY } from '@/integrations/crawler/constants/crawler.constants';
import { CrawlerService } from '@/integrations/crawler/services/crawler.service';
import { DetailEnrichmentService } from '@/integrations/crawler/services/detail-enrichment.service';
import { ScraperConfig } from '@/integrations/crawler/interfaces/scraper-config.interface';
import { contentHash } from '@/integrations/crawler/utils/crawler.utils';
import { ScraperGenerationService } from '@/modules/scraper-generation/scraper-generation.service';
import { PropertyNormalizationService } from '@/modules/properties/services/property-normalization.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import {
  CrawlRunStatus,
  GenerationTrigger,
  JobStatus,
  NotificationSeverity,
  NotificationType,
  Prisma,
  PropertyStatus,
  ScraperStatus,
} from 'generated/prisma';

interface CrawlJobData {
  crawlRunId: string;
  jobLogId?: string;
}

@Processor(CRAWL_QUEUE, { concurrency: CRAWL_WORKER_CONCURRENCY })
export class CrawlProcessor extends WorkerHost {
  private readonly logger = new Logger(CrawlProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crawlerService: CrawlerService,
    private readonly detailEnrichmentService: DetailEnrichmentService,
    private readonly scraperGenerationService: ScraperGenerationService,
    private readonly propertyNormalizationService: PropertyNormalizationService,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<CrawlJobData>): Promise<void> {
    try {
      await this.processCrawlJob(job);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.notificationsService.create({
        type: NotificationType.QUEUE_FAILURE,
        severity: NotificationSeverity.CRITICAL,
        title: 'Crawl queue job failed',
        message: `Crawl job ${job.data.crawlRunId} failed: ${message}`,
        crawl_run_id: job.data.crawlRunId,
      });
      throw error;
    }
  }

  private async processCrawlJob(job: Job<CrawlJobData>): Promise<void> {
    const { crawlRunId, jobLogId } = job.data;
    this.logger.log(`crawl job received: ${crawlRunId}`);

    const run = await this.prisma.crawlRun.findUnique({
      where: { id: crawlRunId },
      include: {
        scraper: {
          include: { active_version: true },
        },
      },
    });

    if (!run) {
      this.logger.error(`crawl job ${crawlRunId}: run not found`);
      return;
    }

    if (run.status !== CrawlRunStatus.QUEUED) {
      this.logger.warn(
        `crawl job ${crawlRunId}: run is ${run.status}, not QUEUED — skipping`,
      );
      return;
    }

    const startedAt = new Date();
    const attempt = job.attemptsMade + 1;
    const logId = await this.markJobActive(
      job,
      crawlRunId,
      jobLogId,
      attempt,
      startedAt,
    );

    await this.prisma.crawlRun.update({
      where: { id: crawlRunId },
      data: {
        status: CrawlRunStatus.RUNNING,
        started_at: startedAt,
      },
    });

    try {
      const scraper = run.scraper;
      const activeVersion = scraper?.active_version;

      if (!scraper || !activeVersion?.config) {
        throw new Error('Crawl run has no scraper with an active version config');
      }

      const config = activeVersion.config as unknown as ScraperConfig;
      if (!config.start_url || !config.listing_selector) {
        throw new Error(
          'Active scraper config is missing start_url or listing_selector',
        );
      }

      const crawlResult = await this.crawlerService.runCrawl(config);
      await this.detailEnrichmentService.enrichDetailPages(
        crawlResult.items,
        config.detail_page,
      );

      const seenUrls = new Set<string>();
      let totalCreated = 0;
      let totalUpdated = 0;
      const now = new Date();

      for (const item of crawlResult.items) {
        if (seenUrls.has(item.source_url)) continue;
        seenUrls.add(item.source_url);

        const raw = item.raw ?? {};
        const externalId =
          (raw._external_id as string | undefined) ??
          item.source_url.split('/').filter(Boolean).pop() ??
          null;
        const hash = contentHash({
          url: item.source_url,
          title: raw.title,
          price: raw.price,
        });

        const existing = await this.prisma.sourceProperty.findUnique({
          where: {
            source_agency_id_source_url: {
              source_agency_id: run.source_agency_id,
              source_url: item.source_url,
            },
          },
          select: { id: true },
        });

        await this.prisma.sourceProperty.upsert({
          where: {
            source_agency_id_source_url: {
              source_agency_id: run.source_agency_id,
              source_url: item.source_url,
            },
          },
          create: {
            source_agency_id: run.source_agency_id,
            external_id: externalId,
            source_url: item.source_url,
            raw_title: (raw.title as string | undefined) ?? null,
            raw_description: (raw._detail_text as string | undefined) ?? null,
            raw_price: (raw.price as string | undefined) ?? null,
            raw_location: (raw.location as string | undefined) ?? null,
            raw_data: raw as Prisma.InputJsonValue,
            content_hash: hash,
            first_seen_at: now,
            last_seen_at: now,
            status: PropertyStatus.ACTIVE,
          },
          update: {
            external_id: externalId,
            raw_title: (raw.title as string | undefined) ?? null,
            raw_description: (raw._detail_text as string | undefined) ?? null,
            raw_price: (raw.price as string | undefined) ?? null,
            raw_location: (raw.location as string | undefined) ?? null,
            raw_data: raw as Prisma.InputJsonValue,
            content_hash: hash,
            last_seen_at: now,
            status: PropertyStatus.ACTIVE,
          },
        });

        if (existing) totalUpdated++;
        else totalCreated++;
      }

      await this.prisma.scraperExecutionTrace.create({
        data: {
          scraper_id: scraper.id,
          crawl_run_id: crawlRunId,
          steps: crawlResult.steps as Prisma.InputJsonValue,
          success: crawlResult.success,
          error_summary: crawlResult.errorSummary ?? null,
        },
      });

      const finishedAt = new Date();
      const runFailed = !crawlResult.success;

      await this.prisma.crawlRun.update({
        where: { id: crawlRunId },
        data: {
          status: runFailed ? CrawlRunStatus.FAILED : CrawlRunStatus.SUCCESS,
          finished_at: finishedAt,
          duration_ms: finishedAt.getTime() - startedAt.getTime(),
          total_found: crawlResult.items.length,
          total_created: totalCreated,
          total_updated: totalUpdated,
          error_message: crawlResult.errorSummary ?? null,
        },
      });

      if (runFailed) {
        this.notificationsService.create({
          type: NotificationType.LARGE_CRAWL_FAILURE,
          severity: NotificationSeverity.CRITICAL,
          title: 'Crawl run failed',
          message: crawlResult.errorSummary ?? 'Crawl failed',
          source_agency_id: run.source_agency_id,
          scraper_id: scraper.id,
          crawl_run_id: crawlRunId,
        });

        await this.handleScraperFailure({
          scraper,
          crawlRunId,
          sourceAgencyId: run.source_agency_id,
          zeroListingsPage0: crawlResult.zeroListingsPage0 ?? false,
          networkError: crawlResult.networkError ?? false,
          errorMessage: crawlResult.errorSummary ?? 'Crawl failed',
        });
      } else {
        await this.prisma.scraper.update({
          where: { id: scraper.id },
          data: {
            consecutive_failures: 0,
            last_success_at: finishedAt,
          },
        });
      }

      await this.prisma.jobLog.update({
        where: { id: logId },
        data: {
          status: runFailed ? JobStatus.FAILED : JobStatus.COMPLETED,
          finished_at: finishedAt,
          duration_ms: finishedAt.getTime() - startedAt.getTime(),
          result: {
            status: runFailed ? CrawlRunStatus.FAILED : CrawlRunStatus.SUCCESS,
            total_found: crawlResult.items.length,
            total_created: totalCreated,
            total_updated: totalUpdated,
          },
          error_message: runFailed ? crawlResult.errorSummary : null,
        },
      });

      if (!runFailed) {
        try {
          await this.propertyNormalizationService.normalizeForCrawlRun(crawlRunId);
        } catch (normalizationError) {
          const normalizationMessage =
            normalizationError instanceof Error
              ? normalizationError.message
              : String(normalizationError);
          this.logger.error(
            `Normalization failed for crawl ${crawlRunId}: ${normalizationMessage}`,
          );
        }
      }

      return;
    } catch (error) {
      const finishedAt = new Date();
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      const currentRun = await this.prisma.crawlRun.findUnique({
        where: { id: crawlRunId },
        include: {
          scraper: true,
        },
      });

      if (currentRun?.status === CrawlRunStatus.RUNNING) {
        await this.prisma.crawlRun.update({
          where: { id: crawlRunId },
          data: {
            status: CrawlRunStatus.FAILED,
            finished_at: finishedAt,
            duration_ms: finishedAt.getTime() - startedAt.getTime(),
            error_message: message,
          },
        });

        this.notificationsService.create({
          type: NotificationType.LARGE_CRAWL_FAILURE,
          severity: NotificationSeverity.CRITICAL,
          title: 'Crawl run failed',
          message,
          source_agency_id: currentRun.source_agency_id,
          scraper_id: currentRun.scraper_id ?? undefined,
          crawl_run_id: crawlRunId,
        });
      }

      if (currentRun?.scraper) {
        await this.handleScraperFailure({
          scraper: currentRun.scraper,
          crawlRunId,
          sourceAgencyId: currentRun.source_agency_id,
          zeroListingsPage0: false,
          networkError: false,
          errorMessage: message,
        });
      }

      await this.prisma.jobLog.update({
        where: { id: logId },
        data: {
          status: JobStatus.FAILED,
          finished_at: finishedAt,
          duration_ms: finishedAt.getTime() - startedAt.getTime(),
          error_message: message,
          stack_trace: stack ?? null,
        },
      });

      throw error;
    }
  }

  private async markJobActive(
    job: Job<CrawlJobData>,
    crawlRunId: string,
    jobLogId: string | undefined,
    attempt: number,
    startedAt: Date,
  ): Promise<string> {
    if (jobLogId) {
      await this.prisma.jobLog.update({
        where: { id: jobLogId },
        data: {
          status: JobStatus.ACTIVE,
          attempt,
          job_id: job.id ?? null,
          started_at: startedAt,
          finished_at: null,
          duration_ms: null,
          error_message: null,
          stack_trace: null,
        },
      });
      return jobLogId;
    }

    const jobLog = await this.prisma.jobLog.create({
      data: {
        queue_name: CRAWL_QUEUE,
        job_id: job.id ?? null,
        job_name: job.name ?? 'crawl',
        status: JobStatus.ACTIVE,
        attempt,
        max_attempts: job.opts.attempts ?? null,
        crawl_run_id: crawlRunId,
        payload: job.data as object,
        started_at: startedAt,
      },
    });

    return jobLog.id;
  }

  private async handleScraperFailure(params: {
    scraper: { id: string; self_healing_enabled: boolean; consecutive_failures: number };
    crawlRunId: string;
    sourceAgencyId: string;
    zeroListingsPage0: boolean;
    networkError: boolean;
    errorMessage: string;
  }): Promise<void> {
    const nextFailures = params.scraper.consecutive_failures + 1;
    const shouldMarkBroken =
      params.zeroListingsPage0 ||
      params.networkError ||
      nextFailures >= 3;

    await this.prisma.scraper.update({
      where: { id: params.scraper.id },
      data: {
        consecutive_failures: nextFailures,
        last_failure_at: new Date(),
        ...(shouldMarkBroken ? { status: ScraperStatus.BROKEN } : {}),
      },
    });

    if (!shouldMarkBroken) return;

    if (params.networkError) {
      this.notificationsService.create({
        type: NotificationType.WEBSITE_UNAVAILABLE,
        severity: NotificationSeverity.CRITICAL,
        title: 'Website unavailable',
        message: params.errorMessage,
        source_agency_id: params.sourceAgencyId,
        scraper_id: params.scraper.id,
        crawl_run_id: params.crawlRunId,
      });
    } else {
      this.notificationsService.create({
        type: NotificationType.BROKEN_SCRAPER,
        severity: NotificationSeverity.WARNING,
        title: 'Scraper marked as broken',
        message: params.errorMessage,
        source_agency_id: params.sourceAgencyId,
        scraper_id: params.scraper.id,
        crawl_run_id: params.crawlRunId,
      });
    }

    if (params.scraper.self_healing_enabled) {
      const selfHealPrompt = `Self-heal triggered after crawl failure: ${params.errorMessage}`;
      const retried = await this.scraperGenerationService.retryLatestForScraper(
        params.scraper.id,
        params.errorMessage,
        selfHealPrompt,
      );

      if (!retried) {
        await this.scraperGenerationService.trigger(
          params.sourceAgencyId,
          params.scraper.id,
          GenerationTrigger.SELF_HEAL,
          selfHealPrompt,
        );
      }
    }
  }
}
