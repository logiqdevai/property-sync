import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import {
  NotificationSeverity,
  NotificationType,
} from 'generated/prisma';
import { EstateWebErrorCode } from '../constants/estateweb-error-codes';
import { EstateWebException } from '../exceptions/estateweb.exception';
import { EstateWebErrorContext } from '../interfaces/estateweb-notification.interface';
import {
  extractEstateWebErrorCode,
  formatEstateWebError,
} from '../utils/estateweb-error.util';

@Injectable()
export class EstateWebNotificationService {
  private readonly logger = new Logger(EstateWebNotificationService.name);
  private readonly notifiedErrors = new WeakSet<object>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  captureError(context: EstateWebErrorContext, error: unknown): void {
    if (error && typeof error === 'object' && this.notifiedErrors.has(error)) {
      return;
    }

    if (error && typeof error === 'object') {
      this.notifiedErrors.add(error);
    }

    void this.publishError(context, error);
  }

  private async publishError(
    context: EstateWebErrorContext,
    error: unknown,
  ): Promise<void> {
    try {
      const sourceAgencyId =
        context.sourceAgencyId ??
        (await this.resolveSourceAgencyId(context.userIntegrationId));

      const message = this.buildMessage(context, error);
      const errorCode =
        context.errorCode ?? extractEstateWebErrorCode(error);

      this.notificationsService.create({
        type: NotificationType.CMS_SYNC_FAILURE,
        severity: this.resolveSeverity(error, errorCode),
        title: this.buildTitle(context, errorCode),
        message,
        ...(sourceAgencyId ? { source_agency_id: sourceAgencyId } : {}),
      });
    } catch (publishError) {
      const message =
        publishError instanceof Error
          ? publishError.message
          : String(publishError);
      this.logger.error(`Failed to publish EstateWeb notification: ${message}`);
    }
  }

  private buildTitle(
    context: EstateWebErrorContext,
    errorCode?: EstateWebErrorCode,
  ): string {
    if (errorCode) {
      return `EstateWeb ${context.operation} failed (${errorCode})`;
    }
    return `EstateWeb ${context.operation} failed`;
  }

  private buildMessage(
    context: EstateWebErrorContext,
    error: unknown,
  ): string {
    const parts = [formatEstateWebError(error)];

    if (context.userIntegrationId) {
      parts.push(`integration=${context.userIntegrationId}`);
    }

    if (context.method) {
      parts.push(`method=${context.method}`);
    }

    if (context.path) {
      parts.push(`path=${context.path}`);
    }

    if (context.statusCode !== undefined) {
      parts.push(`status=${context.statusCode}`);
    }

    if (context.propertyId !== undefined) {
      parts.push(`propertyId=${context.propertyId}`);
    }

    return parts.join(' | ');
  }

  private resolveSeverity(
    error: unknown,
    errorCode?: EstateWebErrorCode,
  ): NotificationSeverity {
    const code =
      errorCode ??
      (error instanceof EstateWebException ? error.code : undefined);

    if (!code) {
      return NotificationSeverity.CRITICAL;
    }

    switch (code) {
      case EstateWebErrorCode.NOT_FOUND:
      case EstateWebErrorCode.LINK_NOT_FOUND:
      case EstateWebErrorCode.MISSING_TOKEN:
        return NotificationSeverity.INFO;
      case EstateWebErrorCode.UNAUTHORIZED:
      case EstateWebErrorCode.SESSION_EXPIRED:
      case EstateWebErrorCode.MISSING_CREDENTIALS:
      case EstateWebErrorCode.INTEGRATION_INACTIVE:
      case EstateWebErrorCode.VALIDATION_FAILED:
      case EstateWebErrorCode.INVALID_PROPERTY_ID:
      case EstateWebErrorCode.EMPTY_IMAGE:
      case EstateWebErrorCode.API_ERROR:
      case EstateWebErrorCode.RATE_LIMITED:
      case EstateWebErrorCode.MISSING_CSRF:
      case EstateWebErrorCode.MISSING_SESSION_COOKIE:
      case EstateWebErrorCode.LOGIN_REDIRECT_FAILED:
        return NotificationSeverity.WARNING;
      case EstateWebErrorCode.NETWORK_ERROR:
      case EstateWebErrorCode.REQUEST_TIMEOUT:
      case EstateWebErrorCode.SERVER_ERROR:
      case EstateWebErrorCode.INVALID_RESPONSE:
      case EstateWebErrorCode.INVALID_JSON:
      case EstateWebErrorCode.MISSING_PROPERTY_ID:
      case EstateWebErrorCode.LOGIN_FAILED:
      case EstateWebErrorCode.SESSION_PERSIST_FAILED:
      case EstateWebErrorCode.INTEGRATION_NOT_FOUND:
      default:
        return NotificationSeverity.CRITICAL;
    }
  }

  private async resolveSourceAgencyId(
    userIntegrationId?: string,
  ): Promise<string | undefined> {
    if (!userIntegrationId) {
      return undefined;
    }

    const link = await this.prisma.userTrackedAgencyIntegrationLink.findFirst({
      where: { user_integration_id: userIntegrationId },
      select: {
        user_tracked_agency: {
          select: { source_agency_id: true },
        },
      },
    });

    return link?.user_tracked_agency.source_agency_id;
  }
}
