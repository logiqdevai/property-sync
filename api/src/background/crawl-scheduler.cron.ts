import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { parseExpression } from 'cron-parser';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CrawlRunsService } from '@/modules/crawl-runs/crawl-runs.service';
import { ScraperStatus } from 'generated/prisma';
import type { EnvConfig } from '@/shared/config/env/env.validation';

const MANUAL_ONLY_CRAWL_ENVS: ReadonlySet<EnvConfig['NODE_ENV']> = new Set([
  'local',
  'development',
  'staging',
]);

const DEFAULT_CRAWL_SCHEDULE_TZ = 'Europe/Athens';

// Most agencies share the same default crawl_interval, so without jitter every
// one of them would come due in the same single minute -- e.g. all ~15 agencies
// enqueuing at once at the 03:00 boundary, saturating worker concurrency and
// spiking memory in one burst. Spreading agencies deterministically across this
// window turns that thundering herd into a steady trickle.
const SCHEDULE_JITTER_WINDOW_MINUTES = 10;

// A scheduled slot that hasn't produced a crawl run yet stays due for this long.
// Minute ticks are NOT reliable: the `cron` lib silently drops any tick it can't
// fire within 250ms of its deadline, and the crawls kicked off at the first slot
// of the morning block the event loop for minutes -- so an "is it due in exactly
// this minute" check lost every agency whose jitter slot fell in a dropped
// minute until the next day. Instead we catch up on any recent slot with no run.
const SCHEDULE_CATCH_UP_WINDOW_MS = 6 * 60 * 60_000;

@Injectable()
export class CrawlSchedulerCron {
  private readonly logger = new Logger(CrawlSchedulerCron.name);
  private isTickRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crawlRunsService: CrawlRunsService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async enqueueDueAgencyRuns(): Promise<void> {
    const nodeEnv = this.configService.get<EnvConfig['NODE_ENV']>('NODE_ENV');
    if (nodeEnv && MANUAL_ONLY_CRAWL_ENVS.has(nodeEnv)) {
      return;
    }

    // A slow tick overlapping the next one could see the same slot as still
    // unserved and enqueue it twice.
    if (this.isTickRunning) {
      return;
    }
    this.isTickRunning = true;
    try {
      await this.enqueueDueAgencyRunsTick();
    } finally {
      this.isTickRunning = false;
    }
  }

  private async enqueueDueAgencyRunsTick(): Promise<void> {
    const now = new Date();
    const scheduleTz =
      this.configService.get<string>('CRAWL_SCHEDULE_TZ') ??
      DEFAULT_CRAWL_SCHEDULE_TZ;

    // Scheduling is per-agency, not per-tracker: a crawl scrapes the agency's
    // site once, regardless of how many users track it. Fan-out to individual
    // trackers (track_new/removed/updated_listings) happens downstream in
    // PropertyNormalizationService/UserPropertiesService off the shared result.
    const agencies = await this.prisma.sourceAgency.findMany({
      where: {
        is_visible: true,
        is_enabled: true,
        user_tracked_agencies: { some: { enabled: true } },
      },
      select: { id: true, crawl_interval: true },
    });

    const lastRuns = await this.prisma.crawlRun.groupBy({
      by: ['source_agency_id'],
      where: {
        source_agency_id: { in: agencies.map((a) => a.id) },
        created_at: {
          gte: new Date(now.getTime() - SCHEDULE_CATCH_UP_WINDOW_MS),
        },
      },
      _max: { created_at: true },
    });
    const lastRunAtByAgency = new Map(
      lastRuns.map((r) => [r.source_agency_id, r._max.created_at]),
    );

    for (const agency of agencies) {
      const slot = this.latestScheduledSlot(
        agency.crawl_interval,
        now,
        this.jitterMsForAgency(agency.id),
        scheduleTz,
      );
      if (
        !slot ||
        now.getTime() - slot.getTime() >= SCHEDULE_CATCH_UP_WINDOW_MS
      ) {
        continue;
      }

      // Any run (scheduled or manual) created at/after the slot serves it.
      const lastRunAt = lastRunAtByAgency.get(agency.id);
      if (lastRunAt && lastRunAt.getTime() >= slot.getTime()) {
        continue;
      }

      // Each agency is handled independently -- a thrown error here (DB hiccup,
      // etc.) must not abort the loop. Anything skipped here (error, active or
      // still-normalizing run) is retried on the next tick while the slot is
      // within SCHEDULE_CATCH_UP_WINDOW_MS.
      try {
        const hasActiveRun = await this.crawlRunsService.hasActiveRunForAgency(
          agency.id,
        );
        if (hasActiveRun) {
          continue;
        }

        const scraper = await this.prisma.scraper.findFirst({
          where: {
            source_agency_id: agency.id,
            status: { in: [ScraperStatus.ACTIVE, ScraperStatus.TESTING] },
          },
          orderBy: { updated_at: 'desc' },
          select: { id: true },
        });

        if (!scraper) {
          // Re-checked every tick during catch-up; only warn once per slot.
          if (now.getTime() - slot.getTime() < 60_000) {
            this.logger.warn(
              `agency ${agency.id}: no scraper for agency — skipping`,
            );
          }
          continue;
        }

        await this.crawlRunsService.enqueue(agency.id, scraper.id);
        this.logger.log(
          `scheduled crawl enqueued for agency ${agency.id} (slot ${slot.toISOString()})`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // enqueue() rejects while a previous run is still active/normalizing;
        // that's a wait, not a failure -- the next tick retries.
        if (error instanceof BadRequestException) {
          this.logger.debug(
            `scheduled crawl for agency ${agency.id} deferred: ${message}`,
          );
          continue;
        }
        this.logger.error(
          `failed to enqueue scheduled crawl for agency ${agency.id}: ${message}`,
        );
      }
    }
  }

  // Deterministic per-agency offset within SCHEDULE_JITTER_WINDOW_MINUTES,
  // so the same agency always lands at the same offset (stable across cron
  // ticks) instead of jittering randomly run to run.
  private jitterMsForAgency(agencyId: string): number {
    let hash = 0;
    for (let i = 0; i < agencyId.length; i++) {
      hash = (hash * 31 + agencyId.charCodeAt(i)) >>> 0;
    }
    return (hash % SCHEDULE_JITTER_WINDOW_MINUTES) * 60_000;
  }

  // Most recent jittered slot at or before `now`, in real (un-jittered) time.
  private latestScheduledSlot(
    cronExpression: string,
    now: Date,
    jitterMs: number,
    tz: string,
  ): Date | null {
    try {
      const interval = parseExpression(cronExpression, {
        currentDate: new Date(now.getTime() - jitterMs),
        tz,
      });
      return new Date(interval.prev().toDate().getTime() + jitterMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `invalid crawl_interval "${cronExpression}": ${message}`,
      );
      return null;
    }
  }
}
