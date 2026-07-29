import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { Prisma } from 'generated/prisma';
import { CostLogQueryType } from './dto/cost-log-query.schema';
import { PaginatedResult, RecordCostLogParams } from './interfaces/cost-log.interface';

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

  async findAll(
    query: CostLogQueryType,
  ): Promise<
    PaginatedResult<any> & {
      total_cost: string | null;
      by_operation: Record<string, string>;
    }
  > {
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

    const [items, total, aggregate, byOperation] = await Promise.all([
      this.prisma.costLog.findMany({
        where,
        include: {
          user: { select: { email: true } },
          crawl_run: { select: { id: true, source_agency_id: true } },
          user_property: { select: { id: true, title: true } },
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
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
      total_cost: aggregate._sum.total_cost?.toString() ?? null,
      by_operation: Object.fromEntries(
        byOperation.map((row) => [
          row.operation_type,
          row._sum.total_cost?.toString() ?? '0',
        ]),
      ),
    };
  }
}
