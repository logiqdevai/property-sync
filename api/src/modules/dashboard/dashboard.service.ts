import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import {
  CrawlRunStatus,
  GenerationRunStatus,
  JobStatus,
  PropertyHistoryEventType,
  ScraperStatus,
} from 'generated/prisma';
import {
  ActivityFeedItem,
  ActivityFeedType,
  DashboardKpis,
  DashboardResponse,
} from './entities/dashboard.entity';

const ACTIVITY_FETCH_LIMIT = 10;
const ACTIVITY_MERGE_LIMIT = 20;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(): Promise<DashboardResponse> {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);

    const [
      scrapersTotal,
      scrapersActive,
      scrapersBroken,
      agenciesTotal,
      agenciesActive,
      agenciesDisabled,
      agenciesArchived,
      runningCrawls,
      failedCrawls24h,
      lastCrawlAggregate,
      propertiesImportedToday,
      propertiesUpdatedToday,
      propertiesRemovedToday,
      failedPropertiesToday,
      propertiesTotal,
      queueWaiting,
      queueActive,
      queueFailed,
      activeGenerationRuns,
      activeIntegrations,
      totalIntegrations,
      unreadNotifications,
      recentCrawlRuns,
      recentPropertyCreated,
      recentPropertyRemoved,
      recentBrokenScrapers,
      recentGenerationRuns,
    ] = await Promise.all([
      this.prisma.scraper.count(),
      this.prisma.scraper.count({ where: { status: ScraperStatus.ACTIVE } }),
      this.prisma.scraper.count({ where: { status: ScraperStatus.BROKEN } }),
      this.prisma.sourceAgency.count(),
      this.prisma.sourceAgency.count({
        where: { is_visible: true, is_enabled: true },
      }),
      this.prisma.sourceAgency.count({
        where: { is_visible: true, is_enabled: false },
      }),
      this.prisma.sourceAgency.count({ where: { is_visible: false } }),
      this.prisma.crawlRun.count({ where: { status: CrawlRunStatus.RUNNING } }),
      this.prisma.crawlRun.count({
        where: {
          status: CrawlRunStatus.FAILED,
          created_at: { gte: twentyFourHoursAgo },
        },
      }),
      this.prisma.crawlRun.aggregate({
        _max: { finished_at: true },
        where: { finished_at: { not: null } },
      }),
      this.prisma.propertyHistory.count({
        where: {
          event_type: PropertyHistoryEventType.CREATED,
          created_at: { gte: startOfToday },
        },
      }),
      this.prisma.propertyHistory.count({
        where: {
          event_type: PropertyHistoryEventType.UPDATED,
          created_at: { gte: startOfToday },
        },
      }),
      this.prisma.propertyHistory.count({
        where: {
          event_type: PropertyHistoryEventType.REMOVED,
          created_at: { gte: startOfToday },
        },
      }),
      this.prisma.scraperExecutionTrace.count({
        where: {
          success: false,
          created_at: { gte: startOfToday },
        },
      }),
      this.prisma.property.count(),
      this.prisma.jobLog.count({ where: { status: JobStatus.WAITING } }),
      this.prisma.jobLog.count({ where: { status: JobStatus.ACTIVE } }),
      this.prisma.jobLog.count({ where: { status: JobStatus.FAILED } }),
      this.prisma.scraperGenerationRun.count({
        where: {
          status: {
            in: [GenerationRunStatus.QUEUED, GenerationRunStatus.RUNNING],
          },
        },
      }),
      this.prisma.userIntegration.count({ where: { is_active: true } }),
      this.prisma.userIntegration.count(),
      this.prisma.notification.count({ where: { is_read: false } }),
      this.prisma.crawlRun.findMany({
        take: ACTIVITY_FETCH_LIMIT,
        orderBy: { created_at: 'desc' },
        include: {
          source_agency: { select: { id: true, name: true } },
          scraper: { select: { id: true, name: true } },
        },
      }),
      this.prisma.propertyHistory.findMany({
        where: { event_type: PropertyHistoryEventType.CREATED },
        take: ACTIVITY_FETCH_LIMIT,
        orderBy: { created_at: 'desc' },
        include: {
          property: { select: { id: true, title: true } },
        },
      }),
      this.prisma.propertyHistory.findMany({
        where: { event_type: PropertyHistoryEventType.REMOVED },
        take: ACTIVITY_FETCH_LIMIT,
        orderBy: { created_at: 'desc' },
        include: {
          property: { select: { id: true, title: true } },
        },
      }),
      this.prisma.scraper.findMany({
        where: { status: ScraperStatus.BROKEN },
        take: ACTIVITY_FETCH_LIMIT,
        orderBy: { updated_at: 'desc' },
        include: {
          source_agency: { select: { id: true, name: true } },
        },
      }),
      this.prisma.scraperGenerationRun.findMany({
        take: ACTIVITY_FETCH_LIMIT,
        orderBy: { created_at: 'desc' },
        include: {
          source_agency: { select: { id: true, name: true } },
          scraper: { select: { id: true, name: true } },
        },
      }),
    ]);

    const kpis: DashboardKpis = {
      scrapers_total: scrapersTotal,
      scrapers_active: scrapersActive,
      scrapers_broken: scrapersBroken,
      agencies_total: agenciesTotal,
      agencies_active: agenciesActive,
      agencies_disabled: agenciesDisabled,
      agencies_archived: agenciesArchived,
      running_crawls: runningCrawls,
      failed_crawls_24h: failedCrawls24h,
      last_crawl_at: lastCrawlAggregate._max.finished_at,
      properties_imported_today: propertiesImportedToday,
      properties_updated_today: propertiesUpdatedToday,
      properties_removed_today: propertiesRemovedToday,
      failed_properties_today: failedPropertiesToday,
      properties_total: propertiesTotal,
      queue_waiting: queueWaiting,
      queue_active: queueActive,
      queue_failed: queueFailed,
      active_generation_runs: activeGenerationRuns,
      active_integrations: activeIntegrations,
      total_integrations: totalIntegrations,
      unread_notifications: unreadNotifications,
    };

    const activity = this.mergeActivityFeed(
      recentCrawlRuns,
      recentPropertyCreated,
      recentPropertyRemoved,
      recentBrokenScrapers,
      recentGenerationRuns,
    );

    return { kpis, activity };
  }

  private mergeActivityFeed(
    crawlRuns: Awaited<ReturnType<PrismaService['crawlRun']['findMany']>>,
    createdHistory: Awaited<
      ReturnType<PrismaService['propertyHistory']['findMany']>
    >,
    removedHistory: Awaited<
      ReturnType<PrismaService['propertyHistory']['findMany']>
    >,
    brokenScrapers: Awaited<ReturnType<PrismaService['scraper']['findMany']>>,
    generationRuns: Awaited<
      ReturnType<PrismaService['scraperGenerationRun']['findMany']>
    >,
  ): ActivityFeedItem[] {
    const items: ActivityFeedItem[] = [];

    for (const run of crawlRuns) {
      const failed = run.status === CrawlRunStatus.FAILED;
      const type: ActivityFeedType = failed ? 'crawl_failed' : 'crawl';
      const agencyName = (run as any).source_agency?.name ?? 'Unknown agency';
      const scraperName = (run as any).scraper?.name ?? 'Unknown scraper';

      items.push({
        type,
        timestamp: run.created_at,
        summary: failed
          ? `Crawl failed for ${scraperName} (${agencyName})`
          : `Crawl ${run.status.toLowerCase()} for ${scraperName} (${agencyName})`,
        crawl_run_id: run.id,
        scraper_id: run.scraper_id,
        source_agency_id: run.source_agency_id,
      });
    }

    for (const entry of createdHistory) {
      const title = (entry as any).property?.title ?? 'Property';
      items.push({
        type: 'listing_created',
        timestamp: entry.created_at,
        summary: `New listing: ${title}`,
        property_id: entry.property_id,
      });
    }

    for (const entry of removedHistory) {
      const title = (entry as any).property?.title ?? 'Property';
      items.push({
        type: 'listing_removed',
        timestamp: entry.created_at,
        summary: `Listing removed: ${title}`,
        property_id: entry.property_id,
      });
    }

    for (const scraper of brokenScrapers) {
      const agencyName =
        (scraper as any).source_agency?.name ?? 'Unknown agency';
      items.push({
        type: 'scraper_broken',
        timestamp: scraper.updated_at,
        summary: `Scraper broken: ${scraper.name} (${agencyName})`,
        scraper_id: scraper.id,
        source_agency_id: scraper.source_agency_id,
      });
    }

    for (const run of generationRuns) {
      const agencyName = (run as any).source_agency?.name ?? 'Unknown agency';
      const triggerLabel =
        run.trigger === 'SELF_HEAL' ? 'Self-heal' : 'AI generation';
      items.push({
        type: 'generation',
        timestamp: run.created_at,
        summary: `${triggerLabel} run ${run.status.toLowerCase()} for ${agencyName}`,
        generation_run_id: run.id,
        scraper_id: run.scraper_id ?? undefined,
        source_agency_id: run.source_agency_id,
      });
    }

    return items
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, ACTIVITY_MERGE_LIMIT);
  }
}
