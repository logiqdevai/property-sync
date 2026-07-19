import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { NotificationSeverity, NotificationType } from 'generated/prisma';
import { EstateWebException } from '../exceptions/estateweb.exception';
import { EstateWebErrorContext } from '../interfaces/estateweb-notification.interface';
import {
  extractEstateWebNotificationType,
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
      const notificationType =
        context.notificationType ??
        extractEstateWebNotificationType(error) ??
        NotificationType.ESTATEWEB_API_ERROR;

      this.notificationsService.create({
        type: notificationType,
        severity: this.resolveSeverity(notificationType),
        title: this.buildTitle(context, notificationType),
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
    notificationType: NotificationType,
  ): string {
    return `EstateWeb ${context.operation} failed (${notificationType})`;
  }

  private buildMessage(context: EstateWebErrorContext, error: unknown): string {
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
    notificationType: NotificationType,
  ): NotificationSeverity {
    switch (notificationType) {
      case NotificationType.ESTATEWEB_NOT_FOUND:
      case NotificationType.ESTATEWEB_LINK_NOT_FOUND:
      case NotificationType.ESTATEWEB_MISSING_TOKEN:
        return NotificationSeverity.INFO;
      case NotificationType.ESTATEWEB_UNAUTHORIZED:
      case NotificationType.ESTATEWEB_SESSION_EXPIRED:
      case NotificationType.ESTATEWEB_MISSING_CREDENTIALS:
      case NotificationType.ESTATEWEB_INTEGRATION_INACTIVE:
      case NotificationType.ESTATEWEB_VALIDATION_FAILED:
      case NotificationType.ESTATEWEB_INVALID_PROPERTY_ID:
      case NotificationType.ESTATEWEB_EMPTY_IMAGE:
      case NotificationType.ESTATEWEB_API_ERROR:
      case NotificationType.ESTATEWEB_RATE_LIMITED:
      case NotificationType.ESTATEWEB_MISSING_CSRF:
      case NotificationType.ESTATEWEB_MISSING_SESSION_COOKIE:
      case NotificationType.ESTATEWEB_LOGIN_REDIRECT_FAILED:
        return NotificationSeverity.WARNING;
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
