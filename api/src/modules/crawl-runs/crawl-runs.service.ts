import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CRAWL_QUEUE } from '@/core/queues/queues.constants';
import { CrawlRunStatus, JobStatus, Prisma } from 'generated/prisma';
import { CrawlRunQueryType } from './dto/crawl-run-query.schema';
import { PaginatedResult } from './interfaces/crawl-run.interface';

interface CrawlJobData {
  crawlRunId: string;
}

const STOPPABLE_JOB_STATUSES: JobStatus[] = [
  JobStatus.WAITING,
  JobStatus.ACTIVE,
  JobStatus.DELAYED,
  JobStatus.PAUSED,
];

const ACTIVE_CRAWL_RUN_STATUSES: CrawlRunStatus[] = [
  CrawlRunStatus.QUEUED,
  CrawlRunStatus.RUNNING,
];

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

  async createBackfillRun(sourceAgencyId: string, userTrackedAgencyId: string) {
    const now = new Date();
    return this.prisma.crawlRun.create({
      data: {
        source_agency_id: sourceAgencyId,
        scraper_id: null,
        user_tracked_agency_id: userTrackedAgencyId,
        status: CrawlRunStatus.SUCCESS,
        started_at: now,
        finished_at: now,
        duration_ms: 0,
        total_found: 0,
        total_new_listings: 0,
        total_refreshed_listings: 0,
      },
    });
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
        property_history: {
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            property_id: true,
            event_type: true,
            field: true,
            old_value: true,
            new_value: true,
            crawl_run_id: true,
            created_at: true,
            property: {
              select: {
                id: true,
                title: true,
                user_property_copies: {
                  select: {
                    id: true,
                    title: true,
                    user: { select: { email: true } },
                  },
                },
              },
            },
          },
        },
        cms_sync_runs: {
          orderBy: { created_at: 'asc' },
          select: {
            id: true,
            status: true,
            total_created: true,
            total_updated: true,
            total_removed: true,
            total_failed: true,
            response: true,
            user_integration: {
              select: {
                id: true,
                email: true,
                username: true,
                user: { select: { id: true, email: true } },
              },
            },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('Crawl run not found');
    }

    return this.attachCmsSyncRunHistory(run);
  }

  private async attachCmsSyncRunHistory<
    T extends {
      id: string;
      property_history: Array<{
        property_id: string;
        id: string;
        event_type: string;
        field: string | null;
        old_value: Prisma.JsonValue;
        new_value: Prisma.JsonValue;
        crawl_run_id: string | null;
        created_at: Date;
      }>;
      cms_sync_runs: Array<{
        response: Prisma.JsonValue | null;
        [key: string]: unknown;
      }>;
    },
  >(run: T): Promise<T> {
    const historyByCanonical = new Map<string, T['property_history']>();
    for (const row of run.property_history) {
      const list = historyByCanonical.get(row.property_id) ?? [];
      list.push(row);
      historyByCanonical.set(row.property_id, list);
    }

    const allUserPropertyIds = new Set<string>();
    for (const syncRun of run.cms_sync_runs) {
      const response =
        syncRun.response &&
        typeof syncRun.response === 'object' &&
        !Array.isArray(syncRun.response)
          ? (syncRun.response as {
              operation_results?: Array<Record<string, unknown>>;
            })
          : null;
      for (const op of response?.operation_results ?? []) {
        if (typeof op.user_property_id === 'string') {
          allUserPropertyIds.add(op.user_property_id);
        }
      }
    }

    const userProperties =
      allUserPropertyIds.size === 0
        ? []
        : await this.prisma.userProperty.findMany({
            where: { id: { in: [...allUserPropertyIds] } },
            select: { id: true, canonical_property_id: true },
          });

    const canonicalByUserProperty = new Map(
      userProperties.map((up) => [up.id, up.canonical_property_id]),
    );

    return {
      ...run,
      cms_sync_runs: run.cms_sync_runs.map((syncRun) => {
        const response =
          syncRun.response &&
          typeof syncRun.response === 'object' &&
          !Array.isArray(syncRun.response)
            ? (syncRun.response as {
                operation_results?: Array<Record<string, unknown>>;
                [key: string]: unknown;
              })
            : null;

        if (!response?.operation_results) {
          return syncRun;
        }

        return {
          ...syncRun,
          response: {
            ...response,
            operation_results: response.operation_results.map((op) => {
              const userPropertyId =
                typeof op.user_property_id === 'string'
                  ? op.user_property_id
                  : null;
              const canonicalId = userPropertyId
                ? canonicalByUserProperty.get(userPropertyId)
                : undefined;
              return {
                ...op,
                history: canonicalId
                  ? (historyByCanonical.get(canonicalId) ?? [])
                  : [],
              };
            }),
          },
        };
      }),
    };
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

  async cancel(id: string) {
    const run = await this.prisma.crawlRun.findUnique({ where: { id } });

    if (!run) {
      throw new NotFoundException('Crawl run not found');
    }

    if (!ACTIVE_CRAWL_RUN_STATUSES.includes(run.status)) {
      throw new BadRequestException(
        'Only QUEUED or RUNNING crawl runs can be stopped',
      );
    }

    const jobLogs = await this.prisma.jobLog.findMany({
      where: {
        crawl_run_id: id,
        status: { in: STOPPABLE_JOB_STATUSES },
      },
    });

    for (const jobLog of jobLogs) {
      if (!jobLog.job_id) continue;
      try {
        await this.crawlQueue.remove(jobLog.job_id);
      } catch {}
    }

    const finishedAt = new Date();
    const durationMs = run.started_at
      ? finishedAt.getTime() - run.started_at.getTime()
      : null;

    const cancelled = await this.prisma.crawlRun.updateMany({
      where: {
        id,
        status: { in: ACTIVE_CRAWL_RUN_STATUSES },
      },
      data: {
        status: CrawlRunStatus.CANCELLED,
        finished_at: finishedAt,
        duration_ms: durationMs,
        error_message: 'Cancelled by admin',
      },
    });

    if (cancelled.count === 0) {
      throw new BadRequestException(
        'Only QUEUED or RUNNING crawl runs can be stopped',
      );
    }

    if (jobLogs.length > 0) {
      await this.prisma.jobLog.updateMany({
        where: { id: { in: jobLogs.map((jobLog) => jobLog.id) } },
        data: {
          status: JobStatus.FAILED,
          finished_at: finishedAt,
          error_message: 'Cancelled by admin',
        },
      });

      for (const jobLog of jobLogs) {
        if (!jobLog.started_at) continue;
        await this.prisma.jobLog.update({
          where: { id: jobLog.id },
          data: {
            duration_ms: finishedAt.getTime() - jobLog.started_at.getTime(),
          },
        });
      }
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    const run = await this.prisma.crawlRun.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!run) {
      throw new NotFoundException('Crawl run not found');
    }

    if (ACTIVE_CRAWL_RUN_STATUSES.includes(run.status)) {
      throw new BadRequestException('Cancel the crawl run before deleting it');
    }

    await this.prisma.crawlRun.delete({ where: { id } });
  }

  async removeMany(crawlRunIds: string[]) {
    const uniqueIds = [...new Set(crawlRunIds)];
    const runs = await this.prisma.crawlRun.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, status: true },
    });

    if (runs.length !== uniqueIds.length) {
      throw new NotFoundException('One or more crawl runs not found');
    }

    if (runs.some((run) => ACTIVE_CRAWL_RUN_STATUSES.includes(run.status))) {
      throw new BadRequestException(
        'Cancel active crawl runs before deleting them',
      );
    }

    await this.prisma.crawlRun.deleteMany({
      where: { id: { in: uniqueIds } },
    });

    return { deleted: uniqueIds.length };
  }

  async hasActiveRunForAgency(sourceAgencyId: string): Promise<boolean> {
    const active = await this.prisma.crawlRun.findFirst({
      where: {
        source_agency_id: sourceAgencyId,
        status: { in: ACTIVE_CRAWL_RUN_STATUSES },
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
