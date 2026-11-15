import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CrawlRunStatus } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import {
  AUTO_UPDATE_RESTORE_SETTLE_MS,
  DESKTOP_CRAWL_TRANSPORT,
  PENDING_RESTORE_LOOKBACK_MS,
} from '@/modules/desktop-crawl/constants/desktop-crawl.constants';
import { DesktopCrawlIngestService } from '@/modules/desktop-crawl/services/desktop-crawl-ingest.service';
import type { DesktopCrawlRunMetadata } from '@/modules/desktop-crawl/interfaces/desktop-crawl.interfaces';

/**
 * Turns `auto_update_to_crm` back on for the trackers a desktop crawl switched off, once that
 * crawl's finalization has run.
 *
 * The push decision is made in the crawl's finalization (`planAndEnqueueCrawlSync`), which reads
 * the flag when it runs; `normalization_status = 'completed'` is written only after it. Restoring
 * earlier would let the finalization push every new/changed listing the user wants to review
 * (mcp-crawl skill §2 step 4). So: normalization finished, and neither the run nor its
 * cms_sync_runs rows have changed for AUTO_UPDATE_RESTORE_SETTLE_MS.
 */
@Injectable()
export class DesktopCrawlAutoUpdateRestoreCron {
  private readonly logger = new Logger(DesktopCrawlAutoUpdateRestoreCron.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestService: DesktopCrawlIngestService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async restoreSettledRuns(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const runs = await this.prisma.crawlRun.findMany({
        where: {
          metadata: { path: ['transport'], equals: DESKTOP_CRAWL_TRANSPORT },
          created_at: {
            gte: new Date(Date.now() - PENDING_RESTORE_LOOKBACK_MS),
          },
        },
        select: {
          id: true,
          status: true,
          updated_at: true,
          metadata: true,
          cms_sync_runs: { select: { updated_at: true } },
        },
      });

      const settledBefore = Date.now() - AUTO_UPDATE_RESTORE_SETTLE_MS;
      for (const run of runs) {
        const metadata = (run.metadata ?? {}) as {
          normalization_status?: string;
          desktop_crawl?: DesktopCrawlRunMetadata;
        };
        const desktop = metadata.desktop_crawl;
        if (
          !desktop ||
          desktop.restore_auto_update_ids.length === 0 ||
          desktop.auto_update_restored_at ||
          desktop.restore_handed_to
        ) {
          continue;
        }

        const normalizationEnded =
          metadata.normalization_status === 'completed' ||
          metadata.normalization_status === 'failed';
        // A run that failed before normalization started has nothing left to finalize.
        const failedBeforeNormalization =
          run.status === CrawlRunStatus.FAILED &&
          !metadata.normalization_status;
        if (!normalizationEnded && !failedBeforeNormalization) continue;

        const lastChange = Math.max(
          run.updated_at.getTime(),
          ...run.cms_sync_runs.map((c) => c.updated_at.getTime()),
        );
        if (lastChange > settledBefore) continue;

        await this.ingestService.restoreNow(run.id);
        this.logger.log(
          `desktop crawl ${run.id}: auto-update restored for ${desktop.restore_auto_update_ids.length} tracker(s)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `auto-update restore pass failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
