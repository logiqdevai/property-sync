import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { PropertyNormalizationService } from '@/modules/properties/services/property-normalization.service';
import { NORMALIZATION_QUEUE } from '@/core/queues/queues.constants';
import { NormalizationChunkJobResult } from '@/modules/properties/interfaces/normalization-chunk-job.interface';
import { NotificationSeverity, NotificationType, Prisma } from 'generated/prisma';

// CrawlRunsService.enqueue() refuses to start a new crawl for an agency while
// any past CrawlRun has metadata.normalization_status === 'running' (see
// PropertyNormalizationService.finalizeNormalizationChunks / setNormalizationStatus,
// which is meant to flip this to 'completed'/'failed' once the last chunk is
// accounted for). If that finalize step never runs -- an uncaught error, a
// worker crash mid-batch -- the flag is left at 'running' forever, silently
// blocking every future scheduled crawl for that agency with no error surfaced
// anywhere.
//
// The specific crash shape we've observed in production: NormalizationChunkProcessor's
// recordChunkResult() marks the shared JobLog's `finalized: true` in the SAME
// transaction that records the last chunk, but the actual finalize work (CMS
// sync enqueue + normalization_status flip) only runs afterwards, outside that
// transaction, in recordAndMaybeFinalize(). If the worker process dies in that
// gap (deploy restart, OOM), BullMQ retries the job -- but recordChunkResult's
// `justFinished = isNowComplete && !result.finalized` guard is now permanently
// false, since `finalized` was already persisted as true. So finalize() never
// gets invoked again, by anything, ever: the CMS sync that should have followed
// this normalization silently never happens, on top of the crawl_run being
// wedged. This watchdog now recovers that specific case by re-running finalize
// against the already-recorded chunk results (safe to repeat -- CMS sync run
// creation upserts on (crawl_run_id, user_integration_id) and
// setNormalizationStatus just overwrites), and only force-fails as a last
// resort when the chunk accounting itself never completed.
const STALE_THRESHOLD_MS = 2 * 60 * 60_000; // 2 hours

@Injectable()
export class NormalizationWatchdogCron {
  private readonly logger = new Logger(NormalizationWatchdogCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly propertyNormalizationService: PropertyNormalizationService,
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
        user_tracked_agency_id: true,
        started_at: true,
        metadata: true,
      },
    });

    for (const run of stuckRuns) {
      const recovered = await this.tryRecoverFromFinishedChunks(run);
      if (recovered) {
        this.logger.warn(
          `watchdog recovered stuck normalization for crawl run ${run.id}: all chunks were already accounted for, re-ran the missed finalize step`,
        );
        continue;
      }

      await this.forceFail(run);
    }
  }

  // Looks for the chunked-normalization JobLog this crawl run enqueued and,
  // if it shows every chunk already accounted for (processed >= total), re-runs
  // the finalize step that should have followed it instead of just discarding
  // that work. Returns false (falls through to forceFail) for anything short
  // of that -- e.g. chunks genuinely still outstanding, or no JobLog found.
  private async tryRecoverFromFinishedChunks(run: {
    id: string;
    source_agency_id: string;
    scraper_id: string | null;
    user_tracked_agency_id: string | null;
    started_at: Date | null;
  }): Promise<boolean> {
    if (!run.started_at) return false;

    const jobLog = await this.prisma.jobLog.findFirst({
      where: {
        crawl_run_id: run.id,
        queue_name: NORMALIZATION_QUEUE,
        job_name: 'normalize-crawl-chunk',
      },
      orderBy: { created_at: 'desc' },
    });
    if (!jobLog) return false;

    const result = jobLog.result as unknown as NormalizationChunkJobResult | null;
    if (!result || result.total <= 0 || result.processed < result.total) {
      return false;
    }

    try {
      await this.propertyNormalizationService.finalizeNormalizationChunks({
        crawlRunId: run.id,
        sourceAgencyId: run.source_agency_id,
        crawlStartedAt: run.started_at,
        userTrackedAgencyId: run.user_tracked_agency_id ?? undefined,
        scraperId: run.scraper_id ?? undefined,
        affected: result.affected ?? [],
        createdCount: result.created_count ?? 0,
      });
      return true;
    } catch (error) {
      // finalizeNormalizationChunks already handles its own failure path
      // (sets normalization_status='failed' + notifies) internally -- this
      // catch only guards the watchdog loop itself from an unexpected throw.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `watchdog: recovery finalize threw for crawl run ${run.id}: ${message}`,
      );
      return true;
    }
  }

  private async forceFail(run: {
    id: string;
    source_agency_id: string;
    scraper_id: string | null;
    metadata: Prisma.JsonValue;
  }): Promise<void> {
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
