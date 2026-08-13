import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { NotificationSeverity, NotificationType } from 'generated/prisma';
import { EstateWebException } from '../exceptions/estateweb.exception';
import { EstateWebErrorContext } from '../interfaces/estateweb-notification.interface';
import {
  extractEstateWebNotificationType,
  extractUpstreamStatus,
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
      const agency =
        context.sourceAgencyId || context.agencyName
          ? {
              id: context.sourceAgencyId,
              name: context.agencyName,
            }
          : await this.resolveAgency(context.userIntegrationId);

      const notificationType =
        context.notificationType ??
        extractEstateWebNotificationType(error) ??
        NotificationType.ESTATEWEB_API_ERROR;
      const upstreamStatus =
        context.upstreamStatus ?? extractUpstreamStatus(error);

      this.notificationsService.create({
        type: notificationType,
        severity: this.resolveSeverity(notificationType),
        title: this.buildTitle(context.operation, notificationType, upstreamStatus),
        message: this.buildMessage(context, error, agency, upstreamStatus),
        ...(agency?.id ? { source_agency_id: agency.id } : {}),
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
    operation: string,
    notificationType: NotificationType,
    upstreamStatus?: number,
  ): string {
    if (upstreamStatus !== undefined) {
      return `EstateWeb ${operation} failed (HTTP ${upstreamStatus})`;
    }
    return `EstateWeb ${operation} failed (${notificationType})`;
  }

  private buildMessage(
    context: EstateWebErrorContext,
    error: unknown,
    agency: { id?: string; name?: string } | undefined,
    upstreamStatus?: number,
  ): string {
    const parts = [formatEstateWebError(error)];
    const isEstateWebException = error instanceof EstateWebException;

    if (agency?.name) {
      parts.push(`agency=${agency.name}`);
    }

    if (context.userIntegrationId) {
      parts.push(`integration=${context.userIntegrationId}`);
    }

    if (!isEstateWebException) {
      if (context.method) {
        parts.push(`method=${context.method}`);
      }
      if (context.path) {
        parts.push(`path=${context.path}`);
      }
    }

    if (
      upstreamStatus !== undefined &&
      !isEstateWebException
    ) {
      parts.push(`upstreamStatus=${upstreamStatus}`);
    }

    if (context.propertyId !== undefined) {
      parts.push(`estatewebPropertyId=${context.propertyId}`);
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

  private async resolveAgency(
    userIntegrationId?: string,
  ): Promise<{ id?: string; name?: string } | undefined> {
    if (!userIntegrationId) {
      return undefined;
    }

    const link = await this.prisma.userTrackedAgencyIntegrationLink.findFirst({
      where: { user_integration_id: userIntegrationId },
      select: {
        user_tracked_agency: {
          select: {
            source_agency_id: true,
            source_agency: { select: { name: true } },
          },
        },
      },
    });

    const sourceAgencyId = link?.user_tracked_agency.source_agency_id;
    const name = link?.user_tracked_agency.source_agency?.name;
    if (!sourceAgencyId && !name) {
      return undefined;
    }

    return {
      id: sourceAgencyId,
      name,
    };
  }
}
