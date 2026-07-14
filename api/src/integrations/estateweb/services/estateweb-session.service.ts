import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { IntegrationType } from 'generated/prisma';
import { EstateWebErrorCode } from '../constants/estateweb-error-codes';
import { EstateWebConfig } from '../config/estateweb.config';
import { EstateWebException } from '../exceptions/estateweb.exception';
import { EstateWebAuthService } from './estateweb-auth.service';
import {
  CachedEstateWebSession,
  EstateWebSession,
} from '../interfaces/estateweb-session.interface';
import {
  isStoredSessionExpired,
  mergeEstateWebConfig,
  readEstateWebConfig,
  sessionToStoredSession,
  storedSessionToSession,
} from '../utils/estateweb-session-config.util';
import { EstateWebNotificationService } from './estateweb-notification.service';

@Injectable()
export class EstateWebSessionService {
  private readonly logger = new Logger(EstateWebSessionService.name);
  private readonly memoryCache = new Map<string, CachedEstateWebSession>();
  private readonly loginLocks = new Map<string, Promise<EstateWebSession>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly estateWebConfig: EstateWebConfig,
    private readonly estateWebAuthService: EstateWebAuthService,
    private readonly estateWebNotificationService: EstateWebNotificationService,
  ) {}

  async getSession(userIntegrationId: string): Promise<EstateWebSession> {
    const cached = this.memoryCache.get(userIntegrationId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.session;
    }

    const inFlight = this.loginLocks.get(userIntegrationId);
    if (inFlight) {
      return inFlight;
    }

    const promise = this.resolveSession(userIntegrationId).finally(() => {
      this.loginLocks.delete(userIntegrationId);
    });

    this.loginLocks.set(userIntegrationId, promise);
    return promise;
  }

  async invalidateSession(userIntegrationId: string): Promise<void> {
    this.memoryCache.delete(userIntegrationId);
    this.loginLocks.delete(userIntegrationId);

    const integration = await this.prisma.userIntegration.findUnique({
      where: { id: userIntegrationId },
      select: { config: true },
    });

    if (!integration) {
      return;
    }

    const estatewebConfig = readEstateWebConfig(integration.config);
    if (!estatewebConfig.session) {
      return;
    }

    await this.prisma.userIntegration.update({
      where: { id: userIntegrationId },
      data: {
        config: mergeEstateWebConfig(integration.config, { session: undefined }),
      },
    });
  }

  async persistSession(
    userIntegrationId: string,
    session: EstateWebSession,
  ): Promise<void> {
    try {
      const ttlMs = this.estateWebConfig.getSessionTtlMs();
      const stored = sessionToStoredSession(session, ttlMs);

      this.memoryCache.set(userIntegrationId, {
        session,
        expiresAt: Date.now() + ttlMs,
      });

      const integration = await this.prisma.userIntegration.findUnique({
        where: { id: userIntegrationId },
        select: { config: true },
      });

      if (!integration) {
        throw new EstateWebException(
          'Integration connection not found',
          EstateWebErrorCode.INTEGRATION_NOT_FOUND,
          HttpStatus.NOT_FOUND,
          { userIntegrationId },
        );
      }

      await this.prisma.userIntegration.update({
        where: { id: userIntegrationId },
        data: {
          config: mergeEstateWebConfig(integration.config, {
            session: stored,
          }),
        },
      });
    } catch (error) {
      this.estateWebNotificationService.captureError(
        {
          userIntegrationId,
          operation: 'persist-session',
          errorCode:
            error instanceof EstateWebException
              ? error.code
              : EstateWebErrorCode.SESSION_PERSIST_FAILED,
        },
        error,
      );
      throw error;
    }
  }

  private async resolveSession(
    userIntegrationId: string,
  ): Promise<EstateWebSession> {
    try {
      const integration = await this.prisma.userIntegration.findFirst({
        where: {
          id: userIntegrationId,
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
        const inactive = await this.prisma.userIntegration.findFirst({
          where: {
            id: userIntegrationId,
            integration_target: {
              integration_type: IntegrationType.ESTATEWEB,
            },
          },
          select: { is_active: true },
        });

        if (inactive && !inactive.is_active) {
          throw new EstateWebException(
            'EstateWeb integration is not active',
            EstateWebErrorCode.INTEGRATION_INACTIVE,
            HttpStatus.BAD_REQUEST,
            { userIntegrationId },
          );
        }

        throw new EstateWebException(
          'EstateWeb integration connection not found',
          EstateWebErrorCode.INTEGRATION_NOT_FOUND,
          HttpStatus.NOT_FOUND,
          { userIntegrationId },
        );
      }

      if (!integration.email || !integration.password) {
        throw new EstateWebException(
          'EstateWeb email and password are required',
          EstateWebErrorCode.MISSING_CREDENTIALS,
          HttpStatus.UNAUTHORIZED,
          { userIntegrationId },
        );
      }

      const ttlMs = this.estateWebConfig.getSessionTtlMs();
      const estatewebConfig = readEstateWebConfig(integration.config);

      if (
        estatewebConfig.session &&
        !isStoredSessionExpired(estatewebConfig.session, ttlMs)
      ) {
        const session = storedSessionToSession(estatewebConfig.session);
        this.memoryCache.set(userIntegrationId, {
          session,
          expiresAt: Date.now() + ttlMs,
        });
        return session;
      }

      const session = await this.estateWebAuthService.login(
        {
          email: integration.email,
          password: integration.password,
          baseUrl:
            integration.integration_target.base_url ??
            this.estateWebConfig.getDefaultBaseUrl(),
        },
        {
          userIntegrationId,
          notifyOnFailure: true,
        },
      );

      await this.persistSession(userIntegrationId, session);
      this.logger.log(
        `EstateWeb session created for integration ${userIntegrationId}`,
      );
      return session;
    } catch (error) {
      if (
        error instanceof EstateWebException &&
        (error.code === EstateWebErrorCode.LOGIN_FAILED ||
          error.code === EstateWebErrorCode.MISSING_CSRF ||
          error.code === EstateWebErrorCode.MISSING_SESSION_COOKIE ||
          error.code === EstateWebErrorCode.LOGIN_REDIRECT_FAILED ||
          error.code === EstateWebErrorCode.REQUEST_TIMEOUT ||
          error.code === EstateWebErrorCode.SESSION_PERSIST_FAILED)
      ) {
        throw error;
      }

      this.estateWebNotificationService.captureError(
        {
          userIntegrationId,
          operation: 'resolve-session',
          errorCode:
            error instanceof EstateWebException
              ? error.code
              : undefined,
        },
        error,
      );
      throw error;
    }
  }
}
