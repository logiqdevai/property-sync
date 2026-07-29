import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { Prisma } from 'generated/prisma';
import { CostLogQueryType, UserCostLogQueryType } from './dto/cost-log-query.schema';
import { PaginatedResult, RecordCostLogParams } from './interfaces/cost-log.interface';

type CostLogListResult = PaginatedResult<any> & {
  total_cost: string | null;
  by_operation: Record<string, string>;
  quantity_by_operation: Record<
    string,
    { input_quantity: number; output_quantity: number; unit_count: number }
  >;
};

@Injectable()
export class CostLogsService {
  private readonly logger = new Logger(CostLogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Cost logging must never break the calling operation -- swallow and warn on failure.
  async record(params: RecordCostLogParams): Promise<void> {
    try {
      await this.prisma.costLog.create({
        data: {
          user_id: params.userId ?? null,
          operation_type: params.operationType,
          provider: params.provider,
          model: params.model ?? null,
          input_quantity: params.inputQuantity ?? null,
          output_quantity: params.outputQuantity ?? null,
          unit_count: params.unitCount ?? null,
          input_cost: params.inputCost ?? null,
          output_cost: params.outputCost ?? null,
          total_cost: params.totalCost,
          crawl_run_id: params.crawlRunId ?? null,
          user_property_id: params.userPropertyId ?? null,
          user_tracked_agency_id: params.userTrackedAgencyId ?? null,
          ai_batch_run_id: params.aiBatchRunId ?? null,
          metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record cost log (operation=${params.operationType} provider=${params.provider}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async findAll(query: CostLogQueryType): Promise<CostLogListResult> {
    const where: Prisma.CostLogWhereInput = {
      ...(query.user_id && { user_id: query.user_id }),
      ...(query.operation_type && { operation_type: query.operation_type }),
      ...(query.provider && { provider: query.provider }),
      ...(query.date_from || query.date_to
        ? {
            created_at: {
              ...(query.date_from && { gte: query.date_from }),
              ...(query.date_to && { lte: query.date_to }),
            },
          }
        : {}),
    };

    return this.list(where, query, { includeUser: true });
  }

  async findAllForUser(
    userId: string,
    query: UserCostLogQueryType,
  ): Promise<CostLogListResult> {
    const where: Prisma.CostLogWhereInput = {
      user_id: userId,
      ...(query.operation_type && { operation_type: query.operation_type }),
      ...(query.provider && { provider: query.provider }),
      ...(query.date_from || query.date_to
        ? {
            created_at: {
              ...(query.date_from && { gte: query.date_from }),
              ...(query.date_to && { lte: query.date_to }),
            },
          }
        : {}),
    };

    return this.list(where, query, { includeUser: false });
  }

  private async list(
    where: Prisma.CostLogWhereInput,
    query: { page?: number; limit?: number },
    options: { includeUser: boolean },
  ): Promise<CostLogListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total, aggregate, byOperation, quantityByOperation] = await Promise.all([
      this.prisma.costLog.findMany({
        where,
        include: {
          ...(options.includeUser && { user: { select: { email: true } } }),
          crawl_run: { select: { id: true, source_agency_id: true } },
          user_property: { select: { id: true, title: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.costLog.count({ where }),
      this.prisma.costLog.aggregate({
        where,
        _sum: { total_cost: true },
      }),
      this.prisma.costLog.groupBy({
        by: ['operation_type'],
        where,
        _sum: { total_cost: true },
      }),
      this.prisma.costLog.groupBy({
        by: ['operation_type'],
        where,
        _sum: { input_quantity: true, output_quantity: true, unit_count: true },
      }),
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
      total_cost: aggregate._sum.total_cost?.toString() ?? null,
      by_operation: Object.fromEntries(
        byOperation.map((row) => [
          row.operation_type,
          row._sum.total_cost?.toString() ?? '0',
        ]),
      ),
      quantity_by_operation: Object.fromEntries(
        quantityByOperation.map((row) => [
          row.operation_type,
          {
            input_quantity: row._sum.input_quantity ?? 0,
            output_quantity: row._sum.output_quantity ?? 0,
            unit_count: row._sum.unit_count ?? 0,
          },
        ]),
      ),
    };
  }
}
