import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CrawlRunStatus, ScraperHealth, ScraperStatus } from 'generated/prisma';

@Injectable()
export class ScraperHealthCron {
  private readonly logger = new Logger(ScraperHealthCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async recomputeScraperHealth(): Promise<void> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const scrapers = await this.prisma.scraper.findMany({
      select: { id: true, status: true },
    });

    for (const scraper of scrapers) {
      const runs = await this.prisma.crawlRun.findMany({
        where: {
          scraper_id: scraper.id,
          created_at: { gte: since },
          status: {
            in: [
              CrawlRunStatus.SUCCESS,
              CrawlRunStatus.PARTIAL_SUCCESS,
              CrawlRunStatus.FAILED,
            ],
          },
        },
        select: {
          status: true,
          started_at: true,
          finished_at: true,
        },
      });

      if (runs.length === 0) continue;

      const successCount = runs.filter(
        (run) =>
          run.status === CrawlRunStatus.SUCCESS ||
          run.status === CrawlRunStatus.PARTIAL_SUCCESS,
      ).length;
      const successRate = Number(
        ((successCount / runs.length) * 100).toFixed(2),
      );

      const durations = runs
        .filter((run) => run.started_at && run.finished_at)
        .map((run) => run.finished_at!.getTime() - run.started_at!.getTime());
      const avgRuntimeMs =
        durations.length > 0
          ? Math.round(
              durations.reduce((sum, value) => sum + value, 0) /
                durations.length,
            )
          : null;

      let health: ScraperHealth;
      if (scraper.status === ScraperStatus.BROKEN) {
        health = ScraperHealth.BROKEN;
      } else if (successRate >= 95) {
        health = ScraperHealth.EXCELLENT;
      } else if (successRate >= 80) {
        health = ScraperHealth.GOOD;
      } else if (successRate >= 50) {
        health = ScraperHealth.WARNING;
      } else {
        health = ScraperHealth.CRITICAL;
      }

      await this.prisma.scraper.update({
        where: { id: scraper.id },
        data: {
          success_rate: successRate,
          avg_runtime_ms: avgRuntimeMs,
          health,
        },
      });
    }

    this.logger.log(`Recomputed health for ${scrapers.length} scrapers`);
  }
}
