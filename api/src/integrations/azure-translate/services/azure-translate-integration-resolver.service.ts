import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { AuthType, IntegrationType } from 'generated/prisma';
import { AzureTranslateException } from '../exceptions/azure-translate.exception';
import { ResolvedAzureTranslateIntegration } from '../interfaces/azure-translate-integration.interface';

@Injectable()
export class AzureTranslateIntegrationResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveByUserIntegrationId(
    userIntegrationId: string,
    userId?: string,
  ): Promise<ResolvedAzureTranslateIntegration> {
    const integration = await this.prisma.userIntegration.findFirst({
      where: {
        id: userIntegrationId,
        ...(userId ? { user_id: userId } : {}),
        integration_target: {
          integration_type: IntegrationType.AZURE,
        },
      },
      include: {
        integration_target: true,
      },
    });

    if (!integration) {
      throw new AzureTranslateException(
        'Azure Translate integration connection not found',
        'AZURE_TRANSLATE_NOT_CONFIGURED',
        HttpStatus.NOT_FOUND,
        { userIntegrationId },
      );
    }

    return this.toResolvedIntegration(integration);
  }

  async resolveActiveForUser(
    userId: string,
  ): Promise<ResolvedAzureTranslateIntegration> {
    const integrations = await this.prisma.userIntegration.findMany({
      where: {
        user_id: userId,
        is_active: true,
        api_key_secret: { not: null },
        integration_target: {
          integration_type: IntegrationType.AZURE,
        },
      },
      include: {
        integration_target: true,
      },
      orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
      take: 2,
    });

    if (integrations.length === 0) {
      throw new AzureTranslateException(
        'Connect Azure Translate on the Integrations page first',
        'AZURE_TRANSLATE_NOT_CONFIGURED',
        HttpStatus.BAD_REQUEST,
        { userId },
      );
    }

    if (integrations.length > 1) {
      throw new AzureTranslateException(
        'Multiple active Azure Translate integrations found; only one is allowed per user',
        'AZURE_TRANSLATE_BAD_REQUEST',
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
  ): Promise<ResolvedAzureTranslateIntegration | null> {
    try {
      return await this.resolveActiveForUser(userId);
    } catch (error) {
      if (
        error instanceof AzureTranslateException &&
        error.code === 'AZURE_TRANSLATE_NOT_CONFIGURED'
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
      throw new AzureTranslateException(
        'Azure Translate integration is not active',
        'AZURE_TRANSLATE_BAD_REQUEST',
        HttpStatus.BAD_REQUEST,
        { userIntegrationId },
      );
    }

    return {
      ok: true,
      userIntegrationId: integration.userIntegrationId,
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
      allow_multiple: boolean;
    };
  }): ResolvedAzureTranslateIntegration {
    if (
      integration.integration_target.auth_type !== AuthType.API_KEY ||
      !integration.api_key_secret
    ) {
      throw new AzureTranslateException(
        'Azure Translate integration requires an API key',
        'AZURE_TRANSLATE_UNAUTHORIZED',
        HttpStatus.UNAUTHORIZED,
        { userIntegrationId: integration.id },
      );
    }

    return {
      userIntegrationId: integration.id,
      userId: integration.user_id,
      apiKey: integration.api_key_secret,
      integrationType: integration.integration_target.integration_type,
      isActive: integration.is_active,
    };
  }
}
