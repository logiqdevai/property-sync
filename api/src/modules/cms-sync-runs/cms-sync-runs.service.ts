import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CMS_SYNC_QUEUE } from '@/core/queues/queues.constants';
import { CmsSyncStatus, IntegrationType, Prisma } from 'generated/prisma';
import {
  AdminCmsSyncRunIntegrationsQueryType,
  AdminCmsSyncRunQueryType,
  UserCmsSyncRunQueryType,
} from './dto/cms-sync-run-query.schema';
import { PaginatedResult } from './interfaces/cms-sync-run.interface';

const emptyPage = (page: number, limit: number): PaginatedResult<any> => ({
  data: [],
  pagination: {
    page,
    limit,
    total: 0,
    total_pages: 0,
    has_next: false,
    has_prev: false,
  },
});

const listInclude = {
  crawl_run: {
    select: {
      id: true,
      source_agency_id: true,
      source_agency: { select: { id: true, name: true } },
    },
  },
  user_integration: {
    select: {
      id: true,
      email: true,
      username: true,
      user_id: true,
      user: { select: { id: true, email: true } },
      integration_target: {
        select: {
          id: true,
          integration_type: true,
          base_url: true,
        },
      },
    },
  },
} as const;

@Injectable()
export class CmsSyncRunsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CMS_SYNC_QUEUE) private readonly cmsSyncQueue: Queue,
  ) {}

  async findAllForUser(
    userId: string,
    query: UserCmsSyncRunQueryType,
  ): Promise<PaginatedResult<any>> {
    const integrations = await this.prisma.userIntegration.findMany({
      where: {
        user_id: userId,
        integration_target: { integration_type: IntegrationType.ESTATEWEB },
      },
      select: { id: true },
    });

    const integrationIds = integrations.map((integration) => integration.id);

    if (integrationIds.length === 0) {
      return emptyPage(query.page, query.limit);
    }

    if (query.user_integration_id) {
      const ownsIntegration = integrationIds.includes(
        query.user_integration_id,
      );
      if (!ownsIntegration) {
        return emptyPage(query.page, query.limit);
      }
    }

    const where: Prisma.CmsSyncRunWhereInput = {
      user_integration_id: query.user_integration_id
        ? query.user_integration_id
        : { in: integrationIds },
      ...(query.status && { status: query.status }),
      ...(query.date_from || query.date_to
        ? {
            created_at: {
              ...(query.date_from && { gte: query.date_from }),
              ...(query.date_to && { lte: query.date_to }),
            },
          }
        : {}),
    };

    return this.paginate(where, query.page, query.limit);
  }

  async findAll(
    query: AdminCmsSyncRunQueryType,
  ): Promise<PaginatedResult<any>> {
    const where: Prisma.CmsSyncRunWhereInput = {
      user_integration: {
        integration_target: { integration_type: IntegrationType.ESTATEWEB },
        ...(query.user_id && { user_id: query.user_id }),
      },
      ...(query.user_integration_id && {
        user_integration_id: query.user_integration_id,
      }),
      ...(query.status && { status: query.status }),
      ...(query.date_from || query.date_to
        ? {
            created_at: {
              ...(query.date_from && { gte: query.date_from }),
              ...(query.date_to && { lte: query.date_to }),
            },
          }
        : {}),
    };

    return this.paginate(where, query.page, query.limit);
  }

  async listEstateWebIntegrations(query: AdminCmsSyncRunIntegrationsQueryType) {
    return this.prisma.userIntegration.findMany({
      where: {
        integration_target: { integration_type: IntegrationType.ESTATEWEB },
        ...(query.user_id && { user_id: query.user_id }),
      },
      select: {
        id: true,
        email: true,
        username: true,
        user_id: true,
        user: { select: { email: true } },
      },
      orderBy: { email: 'asc' },
    });
  }

  async findOneById(id: string) {
    const run = await this.prisma.cmsSyncRun.findUnique({
      where: { id },
      include: listInclude,
    });
    if (!run) throw new NotFoundException('CMS sync run not found');
    return this.attachOperationHistory(run);
  }

  async findOneForUser(userId: string, id: string) {
    const run = await this.prisma.cmsSyncRun.findFirst({
      where: {
        id,
        user_integration: {
          user_id: userId,
          integration_target: { integration_type: IntegrationType.ESTATEWEB },
        },
      },
      include: listInclude,
    });
    if (!run) throw new NotFoundException('CMS sync run not found');
    return this.attachOperationHistory(run);
  }

  async delete(id: string) {
    const run = await this.prisma.cmsSyncRun.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!run) throw new NotFoundException('CMS sync run not found');

    await this.prisma.cmsSyncRun.delete({ where: { id } });
    return { deleted: true };
  }

  async removeMany(cmsSyncRunIds: string[]) {
    const uniqueIds = [...new Set(cmsSyncRunIds)];
    const runs = await this.prisma.cmsSyncRun.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });

    if (runs.length !== uniqueIds.length) {
      throw new NotFoundException('One or more CMS sync runs not found');
    }

    await this.prisma.cmsSyncRun.deleteMany({
      where: { id: { in: uniqueIds } },
    });

    return { deleted: uniqueIds.length };
  }

  async retry(id: string) {
    const run = await this.prisma.cmsSyncRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('CMS sync run not found');

    if (
      run.status !== CmsSyncStatus.FAILED &&
      run.status !== CmsSyncStatus.RETRYING
    ) {
      throw new BadRequestException(
        'Only failed or retrying CMS sync runs can be retried',
      );
    }

    const maxAttempts = run.max_attempts ?? 3;
    if (run.attempt >= maxAttempts) {
      throw new BadRequestException('Maximum retry attempts reached');
    }

    await this.resetForRetry(id, maxAttempts);
    await this.enqueueCmsSyncJob(run);

    return this.findOneById(id);
  }

  async rerun(id: string) {
    const run = await this.prisma.cmsSyncRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('CMS sync run not found');

    if (
      run.status === CmsSyncStatus.PENDING ||
      run.status === CmsSyncStatus.RETRYING
    ) {
      throw new BadRequestException(
        'Cannot rerun a CMS sync run that is already in progress',
      );
    }

    const payload = run.payload;
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      !Array.isArray((payload as { operations?: unknown }).operations) ||
      (payload as { operations: unknown[] }).operations.length === 0
    ) {
      throw new BadRequestException(
        'CMS sync run has no stored operations to rerun',
      );
    }

    await this.prisma.cmsSyncRun.update({
      where: { id },
      data: {
        status: CmsSyncStatus.PENDING,
        attempt: 0,
        total_created: 0,
        total_updated: 0,
        total_removed: 0,
        total_linked: 0,
        total_failed: 0,
        response: null,
        error_message: null,
        started_at: new Date(),
        finished_at: null,
      },
    });

    await this.enqueueCmsSyncJob(run);

    return this.findOneById(id);
  }

  private async enqueueCmsSyncJob(run: {
    id: string;
    user_integration_id: string;
    crawl_run_id: string | null;
    payload: Prisma.JsonValue | null;
  }) {
    const payload =
      run.payload && typeof run.payload === 'object' && !Array.isArray(run.payload)
        ? (run.payload as Record<string, unknown>)
        : {};

    await this.cmsSyncQueue.add('cms-sync', {
      cms_sync_run_id: run.id,
      user_tracked_agency_id:
        typeof payload.user_tracked_agency_id === 'string'
          ? payload.user_tracked_agency_id
          : '',
      user_integration_id: run.user_integration_id,
      crawl_run_id: run.crawl_run_id,
    });
  }

  async createBatch(params: {
    crawlRunId: string | null;
    userIntegrationId: string;
    maxAttempts: number;
    payload: Record<string, unknown>;
  }) {
    // Not tied to a crawl (backfill/manual push) -- there's nothing to dedupe against, so
    // just create a fresh row rather than upserting on the (crawl_run_id, user_integration_id)
    // unique, which only meaningfully dedupes when crawl_run_id is a real crawl.
    if (!params.crawlRunId) {
      return this.prisma.cmsSyncRun.create({
        data: {
          crawl_run_id: null,
          user_integration_id: params.userIntegrationId,
          status: CmsSyncStatus.PENDING,
          attempt: 0,
          max_attempts: params.maxAttempts,
          total_created: 0,
          total_updated: 0,
          total_removed: 0,
          total_linked: 0,
          total_failed: 0,
          payload: params.payload as Prisma.InputJsonValue,
          response: null,
          error_message: null,
          started_at: new Date(),
        },
      });
    }

    return this.prisma.cmsSyncRun.upsert({
      where: {
        crawl_run_id_user_integration_id: {
          crawl_run_id: params.crawlRunId,
          user_integration_id: params.userIntegrationId,
        },
      },
      create: {
        crawl_run_id: params.crawlRunId,
        user_integration_id: params.userIntegrationId,
        status: CmsSyncStatus.PENDING,
        attempt: 0,
        max_attempts: params.maxAttempts,
        total_created: 0,
        total_updated: 0,
        total_removed: 0,
        total_linked: 0,
        total_failed: 0,
        payload: params.payload as Prisma.InputJsonValue,
        response: null,
        error_message: null,
        started_at: new Date(),
      },
      update: {
        status: CmsSyncStatus.PENDING,
        attempt: 0,
        max_attempts: params.maxAttempts,
        total_created: 0,
        total_updated: 0,
        total_removed: 0,
        total_linked: 0,
        total_failed: 0,
        payload: params.payload as Prisma.InputJsonValue,
        response: null,
        error_message: null,
        started_at: new Date(),
        finished_at: null,
      },
    });
  }

  async markAttemptStarted(id: string, attempt: number) {
    return this.prisma.cmsSyncRun.update({
      where: { id },
      data: {
        attempt,
        started_at: new Date(),
        finished_at: null,
        updated_at: new Date(),
      },
    });
  }

  async updateBatchResult(
    id: string,
    result: {
      total_created: number;
      total_updated: number;
      total_removed: number;
      total_linked: number;
      total_failed: number;
      response: Record<string, unknown>;
      status: CmsSyncStatus;
      error_message?: string | null;
    },
  ) {
    return this.prisma.cmsSyncRun.update({
      where: { id },
      data: {
        total_created: result.total_created,
        total_updated: result.total_updated,
        total_removed: result.total_removed,
        total_linked: result.total_linked,
        total_failed: result.total_failed,
        response: result.response as Prisma.InputJsonValue,
        status: result.status,
        error_message: result.error_message ?? null,
        finished_at:
          result.status === CmsSyncStatus.SUCCESS ||
          result.status === CmsSyncStatus.FAILED
            ? new Date()
            : null,
        updated_at: new Date(),
      },
    });
  }

  async resetForRetry(id: string, maxAttempts: number) {
    const run = await this.prisma.cmsSyncRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('CMS sync run not found');

    return this.prisma.cmsSyncRun.update({
      where: { id },
      data: {
        status: CmsSyncStatus.RETRYING,
        attempt: { increment: 1 },
        max_attempts: maxAttempts,
        error_message: null,
        started_at: new Date(),
        finished_at: null,
      },
    });
  }

  private async paginate(
    where: Prisma.CmsSyncRunWhereInput,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<any>> {
    const [items, total] = await Promise.all([
      this.prisma.cmsSyncRun.findMany({
        where,
        include: listInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.cmsSyncRun.count({ where }),
    ]);

    return {
      data: items,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
        has_next: page < Math.ceil(total / limit),
        has_prev: page > 1,
      },
    };
  }

  private async attachOperationHistory<
    T extends {
      crawl_run_id: string | null;
      response: Prisma.JsonValue | null;
    },
  >(run: T): Promise<T> {
    const response =
      run.response && typeof run.response === 'object' && !Array.isArray(run.response)
        ? (run.response as {
            operation_results?: Array<Record<string, unknown>>;
            [key: string]: unknown;
          })
        : null;

    const operationResults = Array.isArray(response?.operation_results)
      ? response.operation_results
      : null;

    const crawlRunId = run.crawl_run_id;
    // No crawl to attach property history against (backfill/manual push).
    if (!crawlRunId || !response || !operationResults || operationResults.length === 0) {
      return run;
    }

    const userPropertyIds = [
      ...new Set(
        operationResults
          .map((op) => op.user_property_id)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];

    if (userPropertyIds.length === 0) {
      return run;
    }

    const userProperties = await this.prisma.userProperty.findMany({
      where: { id: { in: userPropertyIds } },
      select: { id: true, canonical_property_id: true },
    });

    const canonicalByUserProperty = new Map(
      userProperties.map((up) => [up.id, up.canonical_property_id]),
    );
    const canonicalIds = [
      ...new Set(userProperties.map((up) => up.canonical_property_id)),
    ];

    const historyRows =
      canonicalIds.length === 0
        ? []
        : await this.prisma.propertyHistory.findMany({
            where: {
              crawl_run_id: crawlRunId,
              property_id: { in: canonicalIds },
            },
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
            },
          });

    const historyByCanonical = new Map<string, typeof historyRows>();
    for (const row of historyRows) {
      const list = historyByCanonical.get(row.property_id) ?? [];
      list.push(row);
      historyByCanonical.set(row.property_id, list);
    }

    return {
      ...run,
      response: {
        ...response,
        operation_results: operationResults.map((op) => {
          const userPropertyId =
            typeof op.user_property_id === 'string' ? op.user_property_id : null;
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
  }
}
