import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { NotificationSeverity, NotificationType, Prisma } from 'generated/prisma';

// CrawlRunsService.enqueue() refuses to start a new crawl for an agency while
// any past CrawlRun has metadata.normalization_status === 'running' (see
// PropertyNormalizationService.finalizeNormalizationChunks / setNormalizationStatus,
// which is meant to flip this to 'completed'/'failed' once the last chunk is
// accounted for). If that finalize step never runs -- an uncaught error, a
// worker crash mid-batch -- the flag is left at 'running' forever, silently
// blocking every future scheduled crawl for that agency with no error surfaced
// anywhere. This watchdog force-fails any run stuck like that past a generous
// timeout so the agency can crawl again.
const STALE_THRESHOLD_MS = 2 * 60 * 60_000; // 2 hours

@Injectable()
export class NormalizationWatchdogCron {
  private readonly logger = new Logger(NormalizationWatchdogCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async failStuckNormalizations(): Promise<void> {
    const staleBefore = new Date(Date.now() - STALE_THRESHOLD_MS);

    const stuckRuns = await this.prisma.crawlRun.findMany({
      where: {
        updated_at: { lt: staleBefore },
        metadata: { path: ['normalization_status'], equals: 'running' },
      },
      select: {
        id: true,
        source_agency_id: true,
        scraper_id: true,
        metadata: true,
      },
    });

    for (const run of stuckRuns) {
      const errorMessage = `Watchdog: normalization stuck in "running" past ${Math.round(
        STALE_THRESHOLD_MS / 60_000,
      )} minutes -- likely a crash mid-batch that never flipped the status; this was silently blocking new crawls for the agency`;

      const metadata =
        run.metadata && typeof run.metadata === 'object'
          ? (run.metadata as Record<string, unknown>)
          : {};

      await this.prisma.crawlRun.update({
        where: { id: run.id },
        data: {
          metadata: {
            ...metadata,
            normalization_status: 'failed',
          } as Prisma.InputJsonValue,
        },
      });

      await this.notificationsService.create({
        type: NotificationType.LARGE_CRAWL_FAILURE,
        severity: NotificationSeverity.WARNING,
        title: 'Normalization stuck and auto-failed by watchdog',
        message: errorMessage,
        source_agency_id: run.source_agency_id,
        scraper_id: run.scraper_id ?? undefined,
        crawl_run_id: run.id,
      });

      this.logger.warn(
        `watchdog failed stuck normalization for crawl run ${run.id}`,
      );
    }
  }
}
