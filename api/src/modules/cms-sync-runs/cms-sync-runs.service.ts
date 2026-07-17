import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { IntegrationType, Prisma } from 'generated/prisma';
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
      source_agency: { select: { name: true } },
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
          integration_type: true,
          base_url: true,
        },
      },
    },
  },
} as const;

@Injectable()
export class CmsSyncRunsService {
  constructor(private readonly prisma: PrismaService) {}

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
      const ownsIntegration = integrationIds.includes(query.user_integration_id);
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

  async findAll(query: AdminCmsSyncRunQueryType): Promise<PaginatedResult<any>> {
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
}
