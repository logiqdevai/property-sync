import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { IntegrationTargetQueryType } from './dto/integration-target-query.schema';
import {
  CreateIntegrationTargetDto,
  CreateUserIntegrationAccountDto,
  UpdateIntegrationTargetDto,
  UpdateIntegrationTargetVisibilityDto,
  UpdateUserIntegrationAccountDto,
} from './dto/integration-target.dto';
import {
  applyCredentialFields,
  validateCredentialsForAuthType,
} from './utils/credential-fields.util';
import { maskUserIntegration } from './utils/mask-credentials.util';

@Injectable()
export class IntegrationTargetsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: IntegrationTargetQueryType) {
    const where = {
      ...(query.integration_type && { integration_type: query.integration_type }),
      ...(query.auth_type && { auth_type: query.auth_type }),
      ...(query.is_visible !== undefined && { is_visible: query.is_visible }),
      ...(query.is_enabled !== undefined && { is_enabled: query.is_enabled }),
    };

    const [items, total] = await Promise.all([
      this.prisma.integrationTarget.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { created_at: 'desc' },
        include: {
          _count: { select: { user_integrations: true } },
        },
      }),
      this.prisma.integrationTarget.count({ where }),
    ]);

    return {
      data: items,
      pagination: this.buildPagination(query.page, query.limit, total),
    };
  }

  async findOne(id: string) {
    const target = await this.prisma.integrationTarget.findUnique({
      where: { id },
      include: {
        user_integrations: {
          orderBy: { created_at: 'desc' },
          include: {
            user: { select: { id: true, email: true } },
          },
        },
        _count: { select: { user_integrations: true } },
      },
    });

    if (!target) {
      throw new NotFoundException('Integration target not found');
    }

    const { user_integrations, _count, ...rest } = target;

    return {
      ...rest,
      user_integrations_count: _count.user_integrations,
      user_integrations: user_integrations.map((integration) => ({
        ...maskUserIntegration(integration),
        user: integration.user,
      })),
    };
  }

  async create(dto: CreateIntegrationTargetDto) {
    return this.prisma.integrationTarget.create({ data: dto });
  }

  async update(id: string, dto: UpdateIntegrationTargetDto) {
    await this.ensureTargetExists(id);

    return this.prisma.integrationTarget.update({
      where: { id },
      data: dto,
    });
  }

  async updateVisibility(id: string, dto: UpdateIntegrationTargetVisibilityDto) {
    await this.ensureTargetExists(id);

    return this.prisma.integrationTarget.update({
      where: { id },
      data: {
        is_visible: dto.is_visible,
        ...(dto.is_enabled !== undefined && { is_enabled: dto.is_enabled }),
      },
    });
  }

  async remove(id: string) {
    await this.ensureTargetExists(id);

    const connectionCount = await this.prisma.userIntegration.count({
      where: { integration_target_id: id },
    });

    if (connectionCount > 0) {
      throw new ConflictException(
        'Integration target has connected accounts — remove them first',
      );
    }

    await this.prisma.integrationTarget.delete({ where: { id } });
    return { deleted: true };
  }

  async createAccount(targetId: string, dto: CreateUserIntegrationAccountDto) {
    const target = await this.ensureTargetExists(targetId);

    const user = await this.prisma.user.findUnique({
      where: { id: dto.user_id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.ensureAllowMultiple(target, dto.user_id);

    validateCredentialsForAuthType(target.auth_type, dto);

    const integration = await this.prisma.userIntegration.create({
      data: {
        integration_target_id: targetId,
        user_id: dto.user_id,
        ...applyCredentialFields(dto),
      },
      include: {
        user: { select: { id: true, email: true } },
      },
    });

    return {
      ...maskUserIntegration(integration),
      user: integration.user,
    };
  }

  async updateAccount(
    targetId: string,
    userIntegrationId: string,
    dto: UpdateUserIntegrationAccountDto,
  ) {
    const target = await this.ensureTargetExists(targetId);
    const integration = await this.ensureAccountOnTarget(
      targetId,
      userIntegrationId,
    );

    const credentialData = applyCredentialFields(dto);
    const updateData: Record<string, unknown> = { ...credentialData };

    if (dto.is_active !== undefined) {
      updateData.is_active = dto.is_active;
    }

    if (Object.keys(credentialData).length > 0) {
      validateCredentialsForAuthType(target.auth_type, {
        api_key_secret:
          (dto.api_key_secret ?? integration.api_key_secret) || undefined,
        email: (dto.email ?? integration.email) || undefined,
        username: (dto.username ?? integration.username) || undefined,
        password: (dto.password ?? integration.password) || undefined,
        config:
          dto.config ??
          (integration.config as Record<string, unknown> | undefined),
      });
    }

    return this.updateAccountRecord(integration.id, updateData);
  }

  private async updateAccountRecord(
    id: string,
    data: Record<string, unknown>,
  ) {
    const integration = await this.prisma.userIntegration.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, email: true } },
      },
    });

    return {
      ...maskUserIntegration(integration),
      user: integration.user,
    };
  }

  private async ensureTargetExists(id: string) {
    const target = await this.prisma.integrationTarget.findUnique({
      where: { id },
    });

    if (!target) {
      throw new NotFoundException('Integration target not found');
    }

    return target;
  }

  private async ensureAccountOnTarget(targetId: string, userIntegrationId: string) {
    const integration = await this.prisma.userIntegration.findFirst({
      where: {
        id: userIntegrationId,
        integration_target_id: targetId,
      },
    });

    if (!integration) {
      throw new NotFoundException('User integration not found for this target');
    }

    return integration;
  }

  private async ensureAllowMultiple(
    target: { id: string; allow_multiple: boolean },
    userId: string,
  ) {
    if (target.allow_multiple) {
      return;
    }

    const existing = await this.prisma.userIntegration.findFirst({
      where: {
        integration_target_id: target.id,
        user_id: userId,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'User already has a connection to this integration target',
      );
    }
  }

  private buildPagination(page: number, limit: number, total: number) {
    const totalPages = Math.ceil(total / limit);
    return {
      page,
      limit,
      total,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1,
    };
  }
}
