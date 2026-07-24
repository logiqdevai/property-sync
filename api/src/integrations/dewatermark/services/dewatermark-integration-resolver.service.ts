import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { AuthType, IntegrationType } from 'generated/prisma';
import { DewatermarkConfig } from '../config/dewatermark.config';
import { DewatermarkException } from '../exceptions/dewatermark.exception';
import { ResolvedDewatermarkIntegration } from '../interfaces/dewatermark-integration.interface';

@Injectable()
export class DewatermarkIntegrationResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dewatermarkConfig: DewatermarkConfig,
  ) {}

  async resolveByUserIntegrationId(
    userIntegrationId: string,
    userId?: string,
  ): Promise<ResolvedDewatermarkIntegration> {
    const integration = await this.prisma.userIntegration.findFirst({
      where: {
        id: userIntegrationId,
        ...(userId ? { user_id: userId } : {}),
        integration_target: {
          integration_type: IntegrationType.DEWATERMARK,
        },
      },
      include: {
        integration_target: true,
      },
    });

    if (!integration) {
      throw new DewatermarkException(
        'Dewatermark integration connection not found',
        'DEWATERMARK_NOT_CONFIGURED',
        HttpStatus.NOT_FOUND,
        { userIntegrationId },
      );
    }

    return this.toResolvedIntegration(integration);
  }

  async resolveActiveForUser(
    userId: string,
  ): Promise<ResolvedDewatermarkIntegration> {
    const integrations = await this.prisma.userIntegration.findMany({
      where: {
        user_id: userId,
        is_active: true,
        api_key_secret: { not: null },
        integration_target: {
          integration_type: IntegrationType.DEWATERMARK,
        },
      },
      include: {
        integration_target: true,
      },
      orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
      take: 2,
    });

    if (integrations.length === 0) {
      throw new DewatermarkException(
        'Connect Dewatermark on the Integrations page first',
        'DEWATERMARK_NOT_CONFIGURED',
        HttpStatus.BAD_REQUEST,
        { userId },
      );
    }

    if (integrations.length > 1) {
      throw new DewatermarkException(
        'Multiple active Dewatermark integrations found; only one is allowed per user',
        'DEWATERMARK_BAD_REQUEST',
        HttpStatus.CONFLICT,
        {
          userId,
          userIntegrationIds: integrations.map((item) => item.id),
        },
      );
    }

    return this.toResolvedIntegration(integrations[0]);
  }

  async findActiveForUser(
    userId: string,
  ): Promise<ResolvedDewatermarkIntegration | null> {
    try {
      return await this.resolveActiveForUser(userId);
    } catch (error) {
      if (
        error instanceof DewatermarkException &&
        error.code === 'DEWATERMARK_NOT_CONFIGURED'
      ) {
        return null;
      }
      throw error;
    }
  }

  async testConnection(userIntegrationId: string, userId?: string) {
    const integration = await this.resolveByUserIntegrationId(
      userIntegrationId,
      userId,
    );

    if (!integration.isActive) {
      throw new DewatermarkException(
        'Dewatermark integration is not active',
        'DEWATERMARK_BAD_REQUEST',
        HttpStatus.BAD_REQUEST,
        { userIntegrationId },
      );
    }

    return {
      ok: true,
      userIntegrationId: integration.userIntegrationId,
      baseUrl: integration.baseUrl ?? this.dewatermarkConfig.getBaseUrl(),
      hasApiKey: Boolean(integration.apiKey),
    };
  }

  private toResolvedIntegration(integration: {
    id: string;
    user_id: string;
    api_key_secret: string | null;
    is_active: boolean;
    integration_target: {
      integration_type: IntegrationType;
      auth_type: AuthType;
      base_url: string | null;
      allow_multiple: boolean;
    };
  }): ResolvedDewatermarkIntegration {
    if (
      integration.integration_target.auth_type !== AuthType.API_KEY ||
      !integration.api_key_secret
    ) {
      throw new DewatermarkException(
        'Dewatermark integration requires an API key',
        'DEWATERMARK_UNAUTHORIZED',
        HttpStatus.UNAUTHORIZED,
        { userIntegrationId: integration.id },
      );
    }

    if (integration.integration_target.allow_multiple) {
      throw new DewatermarkException(
        'Dewatermark integration target must disallow multiple connections',
        'DEWATERMARK_BAD_REQUEST',
        HttpStatus.BAD_REQUEST,
        { userIntegrationId: integration.id },
      );
    }

    return {
      userIntegrationId: integration.id,
      userId: integration.user_id,
      apiKey: integration.api_key_secret,
      baseUrl: integration.integration_target.base_url,
      integrationType: integration.integration_target.integration_type,
      isActive: integration.is_active,
    };
  }
}
