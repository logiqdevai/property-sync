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

  async findAll(query: CrawlRunQueryType): Promise<PaginatedResult<any>> {
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

    const [items, total] = await Promise.all([
      this.prisma.crawlRun.findMany({
        where,
        include: {
          source_agency: { select: { name: true } },
          scraper: { select: { name: true } },
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.crawlRun.count({ where }),
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

  async hasActiveRunForTracker(userTrackedAgencyId: string): Promise<boolean> {
    const active = await this.prisma.crawlRun.findFirst({
      where: {
        user_tracked_agency_id: userTrackedAgencyId,
        status: { in: [CrawlRunStatus.QUEUED, CrawlRunStatus.RUNNING] },
      },
      select: { id: true },
    });

    return active !== null;
  }
}
