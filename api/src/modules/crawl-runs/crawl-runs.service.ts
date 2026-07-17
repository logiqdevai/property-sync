import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CRAWL_QUEUE } from '@/core/queues/queues.constants';
import { CrawlRunStatus, Prisma } from 'generated/prisma';
import { CrawlRunQueryType } from './dto/crawl-run-query.schema';
import { PaginatedResult } from './interfaces/crawl-run.interface';

interface CrawlJobData {
  crawlRunId: string;
}

@Injectable()
export class CrawlRunsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CRAWL_QUEUE) private readonly crawlQueue: Queue<CrawlJobData>,
  ) {}

  async enqueue(
    sourceAgencyId: string,
    scraperId?: string,
    userTrackedAgencyId?: string,
  ) {
    const run = await this.prisma.crawlRun.create({
      data: {
        source_agency_id: sourceAgencyId,
        scraper_id: scraperId ?? null,
        user_tracked_agency_id: userTrackedAgencyId ?? null,
        status: CrawlRunStatus.QUEUED,
      },
    });

    await this.crawlQueue.add('crawl', { crawlRunId: run.id });

    return run;
  }

  async findAll(
    query: CrawlRunQueryType,
  ): Promise<PaginatedResult<any> & { total_cost: string | null }> {
    const where: Prisma.CrawlRunWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.agency_id && { source_agency_id: query.agency_id }),
      ...(query.scraper_id && { scraper_id: query.scraper_id }),
      ...(query.user_tracked_agency_id && {
        user_tracked_agency_id: query.user_tracked_agency_id,
      }),
      ...(query.date_from || query.date_to
        ? {
            created_at: {
              ...(query.date_from && { gte: query.date_from }),
              ...(query.date_to && { lte: query.date_to }),
            },
          }
        : {}),
    };

    if (query.user_id) {
      const trackedAgencies = await this.prisma.userTrackedAgency.findMany({
        where: { user_id: query.user_id },
        select: { id: true },
      });
      where.user_tracked_agency_id = {
        in: trackedAgencies.map((tracked) => tracked.id),
      };
    }

    const [items, total, aggregate] = await Promise.all([
      this.prisma.crawlRun.findMany({
        where,
        include: {
          source_agency: { select: { name: true } },
          scraper: { select: { name: true } },
          user_tracked_agency: {
            select: { user: { select: { email: true } } },
          },
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.crawlRun.count({ where }),
      this.prisma.crawlRun.aggregate({
        where,
        _sum: { ai_total_cost: true },
      }),
    ]);

    return {
      data: items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        total_pages: Math.ceil(total / query.limit),
        has_next: query.page < Math.ceil(total / query.limit),
        has_prev: query.page > 1,
      },
      total_cost: aggregate._sum.ai_total_cost?.toString() ?? null,
    };
  }

  async findOne(id: string) {
    const run = await this.prisma.crawlRun.findUnique({
      where: { id },
      include: {
        source_agency: { select: { name: true } },
        scraper: { select: { name: true } },
        user_tracked_agency: {
          select: {
            user: { select: { email: true } },
          },
        },
        execution_traces: {
          orderBy: { created_at: 'asc' },
        },
        job_logs: {
          orderBy: { created_at: 'asc' },
        },
        diagnostics_package: {
          select: { id: true, mode: true },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('Crawl run not found');
    }

    return run;
  }

  async rerun(id: string) {
    const run = await this.prisma.crawlRun.findUnique({ where: { id } });

    if (!run) {
      throw new NotFoundException('Crawl run not found');
    }

    return this.enqueue(
      run.source_agency_id,
      run.scraper_id ?? undefined,
      run.user_tracked_agency_id ?? undefined,
    );
  }

  async hasActiveRunForAgency(sourceAgencyId: string): Promise<boolean> {
    const active = await this.prisma.crawlRun.findFirst({
      where: {
        source_agency_id: sourceAgencyId,
        status: { in: [CrawlRunStatus.QUEUED, CrawlRunStatus.RUNNING] },
      },
      select: { id: true },
    });

    return active !== null;
  }

  // Call after writing/updating a CmsSyncRun tied to this crawl (i.e. from the
  // EstateWeb sync service) so CrawlRun.total_created/updated/removed/failed stay
  // in sync with the sum of every user's CMS push outcome for this run.
  async recalculateCmsSyncTotals(crawlRunId: string): Promise<void> {
    const aggregate = await this.prisma.cmsSyncRun.aggregate({
      where: { crawl_run_id: crawlRunId },
      _sum: {
        total_created: true,
        total_updated: true,
        total_removed: true,
        total_failed: true,
      },
    });

    await this.prisma.crawlRun.update({
      where: { id: crawlRunId },
      data: {
        total_created: aggregate._sum.total_created ?? 0,
        total_updated: aggregate._sum.total_updated ?? 0,
        total_removed: aggregate._sum.total_removed ?? 0,
        total_failed: aggregate._sum.total_failed ?? 0,
      },
    });
  }
}
