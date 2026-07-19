import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { AuthType, IntegrationType } from 'generated/prisma';
import { NotificationType } from 'generated/prisma';
import { EstateWebConfig } from '../config/estateweb.config';
import { EstateWebException } from '../exceptions/estateweb.exception';
import { ResolvedEstateWebIntegration } from '../interfaces/estateweb-integration.interface';
import { EstateWebAuthService } from './estateweb-auth.service';
import { EstateWebNotificationService } from './estateweb-notification.service';
import { EstateWebSessionService } from './estateweb-session.service';

@Injectable()
export class EstateWebIntegrationResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly estateWebConfig: EstateWebConfig,
    private readonly estateWebAuthService: EstateWebAuthService,
    private readonly estateWebSessionService: EstateWebSessionService,
    private readonly estateWebNotificationService: EstateWebNotificationService,
  ) {}

  async resolveByUserIntegrationId(
    userIntegrationId: string,
    userId?: string,
  ): Promise<ResolvedEstateWebIntegration> {
    const integration = await this.prisma.userIntegration.findFirst({
      where: {
        id: userIntegrationId,
        ...(userId ? { user_id: userId } : {}),
        integration_target: {
          integration_type: IntegrationType.ESTATEWEB,
        },
      },
      include: {
        integration_target: true,
      },
    });

    if (!integration) {
      throw new EstateWebException(
        'EstateWeb integration connection not found',
        NotificationType.ESTATEWEB_INTEGRATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        { userIntegrationId },
      );
    }

    return this.toResolvedIntegration(integration);
  }

  async resolveDefaultForUser(
    userId: string,
  ): Promise<ResolvedEstateWebIntegration> {
    const integration = await this.prisma.userIntegration.findFirst({
      where: {
        user_id: userId,
        is_default: true,
        is_active: true,
        integration_target: {
          integration_type: IntegrationType.ESTATEWEB,
        },
      },
      include: {
        integration_target: true,
      },
    });

    if (!integration) {
      throw new EstateWebException(
        'Default EstateWeb integration connection not found',
        NotificationType.ESTATEWEB_INTEGRATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        { userId },
      );
    }

    return this.toResolvedIntegration(integration);
  }

  async resolveForTrackedAgency(
    userId: string,
    sourceAgencyId: string,
  ): Promise<ResolvedEstateWebIntegration> {
    const link = await this.prisma.userTrackedAgencyIntegrationLink.findFirst({
      where: {
        user_tracked_agency: {
          user_id: userId,
          source_agency_id: sourceAgencyId,
        },
      },
      include: {
        user_integration: {
          include: {
            integration_target: true,
          },
        },
      },
    });

    if (!link) {
      throw new EstateWebException(
        'No EstateWeb integration linked to this tracked agency',
        NotificationType.ESTATEWEB_LINK_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        { userId, sourceAgencyId },
      );
    }

    return this.toResolvedIntegration(link.user_integration);
  }

  async resolveForUserTrackedAgencyId(
    userTrackedAgencyId: string,
    userId?: string,
  ): Promise<ResolvedEstateWebIntegration> {
    const link = await this.prisma.userTrackedAgencyIntegrationLink.findFirst({
      where: {
        user_tracked_agency_id: userTrackedAgencyId,
        ...(userId
          ? {
              user_tracked_agency: {
                user_id: userId,
              },
            }
          : {}),
      },
      include: {
        user_integration: {
          include: {
            integration_target: true,
          },
        },
      },
    });

    if (!link) {
      throw new EstateWebException(
        'No EstateWeb integration linked to this tracked agency',
        NotificationType.ESTATEWEB_LINK_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        { userTrackedAgencyId },
      );
    }

    return this.toResolvedIntegration(link.user_integration);
  }

  async listUserIntegrations(
    userId: string,
  ): Promise<ResolvedEstateWebIntegration[]> {
    const integrations = await this.prisma.userIntegration.findMany({
      where: {
        user_id: userId,
        integration_target: {
          integration_type: IntegrationType.ESTATEWEB,
        },
      },
      include: {
        integration_target: true,
      },
      orderBy: { created_at: 'asc' },
    });

    return integrations.map((integration) =>
      this.toResolvedIntegration(integration),
    );
  }

  async listLinkedIntegrationsForUser(userId: string) {
    const links = await this.prisma.userTrackedAgencyIntegrationLink.findMany({
      where: {
        user_tracked_agency: {
          user_id: userId,
        },
        user_integration: {
          integration_target: {
            integration_type: IntegrationType.ESTATEWEB,
          },
        },
      },
      include: {
        user_tracked_agency: {
          select: {
            id: true,
            source_agency_id: true,
            enabled: true,
          },
        },
        user_integration: {
          include: {
            integration_target: true,
          },
        },
      },
    });

    return links.map((link) => ({
      linkId: link.id,
      userTrackedAgencyId: link.user_tracked_agency_id,
      sourceAgencyId: link.user_tracked_agency.source_agency_id,
      trackerEnabled: link.user_tracked_agency.enabled,
      integration: this.toResolvedIntegration(link.user_integration),
    }));
  }

  async testConnection(userIntegrationId: string, userId?: string) {
    try {
      const integration = await this.resolveByUserIntegrationId(
        userIntegrationId,
        userId,
      );

      if (!integration.isActive) {
        throw new EstateWebException(
          'EstateWeb integration is not active',
          NotificationType.ESTATEWEB_INTEGRATION_INACTIVE,
          HttpStatus.BAD_REQUEST,
          { userIntegrationId },
        );
      }

      const session = await this.estateWebAuthService.login(
        {
          email: integration.email,
          password: integration.password,
          baseUrl: integration.baseUrl,
        },
        {
          userIntegrationId,
          notifyOnFailure: true,
        },
      );

      await this.estateWebSessionService.persistSession(
        integration.userIntegrationId,
        session,
      );

      return {
        ok: true,
        userIntegrationId: integration.userIntegrationId,
        baseUrl: session.baseUrl,
        hasToken: Boolean(session.token),
        loggedInAt: session.loggedInAt,
      };
    } catch (error) {
      this.estateWebNotificationService.captureError(
        {
          userIntegrationId,
          operation: 'test-connection',
          notificationType:
            error instanceof EstateWebException ? error.code : undefined,
        },
        error,
      );
      throw error;
    }
  }

  private toResolvedIntegration(integration: {
    id: string;
    user_id: string;
    email: string | null;
    password: string | null;
    is_active: boolean;
    integration_target: {
      integration_type: IntegrationType;
      auth_type: AuthType;
      base_url: string | null;
    };
  }): ResolvedEstateWebIntegration {
    if (
      integration.integration_target.auth_type !== AuthType.EMAIL_PASSWORD ||
      !integration.email ||
      !integration.password
    ) {
      throw new EstateWebException(
        'EstateWeb integration requires email and password credentials',
        NotificationType.ESTATEWEB_MISSING_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
        { userIntegrationId: integration.id },
      );
    }

    return {
      userIntegrationId: integration.id,
      userId: integration.user_id,
      email: integration.email,
      password: integration.password,
      baseUrl: this.estateWebConfig.normalizeBaseUrl(
        integration.integration_target.base_url,
      ),
      integrationType: integration.integration_target.integration_type,
      isActive: integration.is_active,
    };
  }
}
