import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { AiProvider, IntegrationType } from 'generated/prisma';
import {
  applyCredentialFields,
  validateCredentialsForAuthType,
} from '@/modules/integration-targets/utils/credential-fields.util';
import { maskUserIntegration } from '@/modules/integration-targets/utils/mask-credentials.util';
import {
  CreateUserIntegrationDto,
  UpdateUserIntegrationDto,
} from './dto/user-integration.dto';
import {
  ResolvedApiKey,
  ResolvedSourceAgencyApiKey,
} from './interfaces/user-integration.interface';

@Injectable()
export class UserIntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveActiveApiKey(
    userId: string,
    integrationType: IntegrationType,
  ): Promise<ResolvedApiKey> {
    const userIntegration = await this.prisma.userIntegration.findFirst({
      where: {
        user_id: userId,
        is_active: true,
        api_key_secret: { not: null },
        integration_target: { integration_type: integrationType },
      },
    });

    if (!userIntegration?.api_key_secret) {
      throw new BadRequestException(
        `Connect ${integrationType} on the Integrations page first`,
      );
    }

    return {
      userIntegrationId: userIntegration.id,
      apiKey: userIntegration.api_key_secret,
    };
  }

  async resolveForSourceAgency(
    sourceAgencyId: string,
    aiProvider: AiProvider,
  ): Promise<ResolvedSourceAgencyApiKey | null> {
    const trackers = await this.prisma.userTrackedAgency.findMany({
      where: {
        source_agency_id: sourceAgencyId,
        enabled: true,
        ai_provider: aiProvider,
      },
      orderBy: { created_at: 'asc' },
    });

    const integrationType = aiProvider as unknown as IntegrationType;

    for (const tracker of trackers) {
      const userIntegration = await this.prisma.userIntegration.findFirst({
        where: {
          user_id: tracker.user_id,
          is_active: true,
          api_key_secret: { not: null },
          integration_target: { integration_type: integrationType },
        },
      });

      if (userIntegration?.api_key_secret) {
        return {
          userIntegrationId: userIntegration.id,
          apiKey: userIntegration.api_key_secret,
          userId: tracker.user_id,
        };
      }
    }

    return null;
  }

  async findVisibleTargets(userId: string) {
    const [targets, connections] = await Promise.all([
      this.prisma.integrationTarget.findMany({
        where: { is_visible: true },
        orderBy: { integration_type: 'asc' },
      }),
      this.prisma.userIntegration.findMany({
        where: { user_id: userId },
        select: { integration_target_id: true },
      }),
    ]);

    const connectedTargetIds = new Set(
      connections.map((connection) => connection.integration_target_id),
    );

    return targets.map((target) => ({
      ...target,
      is_connected: connectedTargetIds.has(target.id),
    }));
  }

  async findUserConnections(userId: string) {
    const connections = await this.prisma.userIntegration.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      include: {
        integration_target: {
          select: {
            id: true,
            integration_type: true,
            auth_type: true,
            base_url: true,
            allow_multiple: true,
            is_visible: true,
            is_enabled: true,
          },
        },
      },
    });

    return connections.map((connection) => ({
      ...maskUserIntegration(connection),
      integration_target: connection.integration_target,
    }));
  }

  async createConnection(userId: string, dto: CreateUserIntegrationDto) {
    const target = await this.prisma.integrationTarget.findUnique({
      where: { id: dto.integration_target_id },
    });

    if (!target || !target.is_visible) {
      throw new NotFoundException('Integration target not found');
    }

    if (!target.is_enabled) {
      throw new BadRequestException(
        'This integration is not enabled for changes',
      );
    }

    if (!target.allow_multiple) {
      const existing = await this.prisma.userIntegration.findFirst({
        where: {
          user_id: userId,
          integration_target_id: target.id,
        },
      });

      if (existing) {
        throw new BadRequestException(
          'You already have a connection to this integration target',
        );
      }
    }

    validateCredentialsForAuthType(target.auth_type, dto);

    const connection = await this.prisma.userIntegration.create({
      data: {
        user_id: userId,
        integration_target_id: target.id,
        ...applyCredentialFields(dto),
      },
      include: {
        integration_target: {
          select: {
            id: true,
            integration_type: true,
            auth_type: true,
            base_url: true,
            allow_multiple: true,
            is_visible: true,
            is_enabled: true,
          },
        },
      },
    });

    return {
      ...maskUserIntegration(connection),
      integration_target: connection.integration_target,
    };
  }

  async updateConnection(
    userId: string,
    connectionId: string,
    dto: UpdateUserIntegrationDto,
  ) {
    const connection = await this.findOwnedConnection(userId, connectionId);

    if (!connection.integration_target.is_enabled) {
      throw new BadRequestException(
        'This integration is not enabled for changes',
      );
    }
    const credentialData = applyCredentialFields(dto);

    if (Object.keys(credentialData).length > 0) {
      validateCredentialsForAuthType(connection.integration_target.auth_type, {
        api_key_secret:
          (dto.api_key_secret ?? connection.api_key_secret) || undefined,
        email: (dto.email ?? connection.email) || undefined,
        username: (dto.username ?? connection.username) || undefined,
        password: (dto.password ?? connection.password) || undefined,
        config:
          dto.config ??
          (connection.config as Record<string, unknown> | undefined),
      });
    }

    const updated = await this.prisma.userIntegration.update({
      where: { id: connectionId },
      data: credentialData,
      include: {
        integration_target: {
          select: {
            id: true,
            integration_type: true,
            auth_type: true,
            base_url: true,
            allow_multiple: true,
            is_visible: true,
            is_enabled: true,
          },
        },
      },
    });

    return {
      ...maskUserIntegration(updated),
      integration_target: updated.integration_target,
    };
  }

  async updateConnectionStatus(
    userId: string,
    connectionId: string,
    isActive: boolean,
  ) {
    const connection = await this.findOwnedConnection(userId, connectionId);

    if (!connection.integration_target.is_enabled) {
      throw new BadRequestException(
        'This integration is not enabled for changes',
      );
    }

    const updated = await this.prisma.userIntegration.update({
      where: { id: connectionId },
      data: { is_active: isActive },
      include: {
        integration_target: {
          select: {
            id: true,
            integration_type: true,
            auth_type: true,
            base_url: true,
            allow_multiple: true,
            is_visible: true,
            is_enabled: true,
          },
        },
      },
    });

    return {
      ...maskUserIntegration(updated),
      integration_target: updated.integration_target,
    };
  }

  async deleteConnection(userId: string, connectionId: string) {
    const connection = await this.findOwnedConnection(userId, connectionId);

    if (!connection.integration_target.is_enabled) {
      throw new BadRequestException(
        'This integration is not enabled for changes',
      );
    }

    await this.prisma.userIntegration.delete({ where: { id: connectionId } });
  }

  private async findOwnedConnection(userId: string, connectionId: string) {
    const connection = await this.prisma.userIntegration.findFirst({
      where: {
        id: connectionId,
        user_id: userId,
      },
      include: {
        integration_target: true,
      },
    });

    if (!connection) {
      throw new NotFoundException('Integration connection not found');
    }

    return connection;
  }
}
