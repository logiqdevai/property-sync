import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { ScraperFailureHandlerService } from './scraper-failure-handler.service';
import { PlatformConfigService } from '@/modules/platform-config/platform-config.service';
import {
  CrawlRunStatus,
  JobStatus,
  NotificationSeverity,
  NotificationType,
} from 'generated/prisma';

const STALE_GRACE_MS = 5 * 60_000;

@Injectable()
export class CrawlRunWatchdogCron {
  private readonly logger = new Logger(CrawlRunWatchdogCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly scraperFailureHandler: ScraperFailureHandlerService,
    private readonly platformConfigService: PlatformConfigService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async failStaleRunningRuns(): Promise<void> {
    const { crawl_job_timeout_ms } =
      await this.platformConfigService.getCrawlerConfig();
    const activityStaleBefore = new Date(
      Date.now() - crawl_job_timeout_ms - STALE_GRACE_MS,
    );
    const absoluteStaleBefore = new Date(
      Date.now() - 2 * crawl_job_timeout_ms - STALE_GRACE_MS,
    );

    const staleRuns = await this.prisma.crawlRun.findMany({
      where: {
        status: CrawlRunStatus.RUNNING,
        OR: [
          { updated_at: { lt: activityStaleBefore } },
          { started_at: { lt: absoluteStaleBefore } },
        ],
      },
      include: { scraper: true },
    });

    for (const run of staleRuns) {
      const finishedAt = new Date();
      const errorMessage = `Watchdog: run stuck in RUNNING past ${Math.round(
        (crawl_job_timeout_ms + STALE_GRACE_MS) / 60_000,
      )} minutes with no update -- likely a worker crash/restart mid-job`;

      await this.prisma.crawlRun.update({
        where: { id: run.id },
        data: {
          status: CrawlRunStatus.FAILED,
          finished_at: finishedAt,
          duration_ms: run.started_at
            ? finishedAt.getTime() - run.started_at.getTime()
            : null,
          error_message: errorMessage,
        },
      });

      await this.prisma.jobLog.updateMany({
        where: { crawl_run_id: run.id, status: JobStatus.ACTIVE },
        data: {
          status: JobStatus.FAILED,
          finished_at: finishedAt,
          error_message: errorMessage,
        },
      });

      this.notificationsService.create({
        type: NotificationType.LARGE_CRAWL_FAILURE,
        severity: NotificationSeverity.CRITICAL,
        title: 'Crawl run stuck and auto-failed by watchdog',
        message: errorMessage,
        source_agency_id: run.source_agency_id,
        scraper_id: run.scraper_id ?? undefined,
        crawl_run_id: run.id,
      });

      if (run.scraper) {
        await this.scraperFailureHandler.handle({
          scraper: run.scraper,
          crawlRunId: run.id,
          sourceAgencyId: run.source_agency_id,
          zeroListingsPage0: false,
          networkError: false,
          errorMessage,
        });
      }

      this.logger.warn(`watchdog failed stale crawl run ${run.id}`);
    }
  }
}
