import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { parseExpression } from 'cron-parser';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CrawlRunsService } from '@/modules/crawl-runs/crawl-runs.service';
import { AgencyStatus } from 'generated/prisma';

@Injectable()
export class CrawlSchedulerCron {
  private readonly logger = new Logger(CrawlSchedulerCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crawlRunsService: CrawlRunsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async enqueueDueTrackerRuns(): Promise<void> {
    const now = new Date();

    const trackers = await this.prisma.userTrackedAgency.findMany({
      where: {
        enabled: true,
        source_agency: { status: AgencyStatus.ACTIVE },
      },
      select: {
        id: true,
        source_agency_id: true,
        crawl_interval: true,
      },
    });

    for (const tracker of trackers) {
      if (!this.isCronDue(tracker.crawl_interval, now)) {
        continue;
      }

      const hasActiveRun = await this.crawlRunsService.hasActiveRunForTracker(
        tracker.id,
      );
      if (hasActiveRun) {
        continue;
      }

      try {
        await this.crawlRunsService.enqueue(
          tracker.source_agency_id,
          undefined,
          tracker.id,
        );
        this.logger.log(
          `scheduled crawl enqueued for tracker ${tracker.id} (agency ${tracker.source_agency_id})`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `failed to enqueue scheduled crawl for tracker ${tracker.id}: ${message}`,
        );
      }
    }
  }

  private isCronDue(cronExpression: string, now: Date): boolean {
    try {
      const interval = parseExpression(cronExpression, {
        currentDate: now,
      });
      const prev = interval.prev().toDate();
      const msSincePrev = now.getTime() - prev.getTime();
      return msSincePrev >= 0 && msSincePrev < 60_000;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `invalid crawl_interval "${cronExpression}": ${message}`,
      );
      return false;
    }
  }
}
