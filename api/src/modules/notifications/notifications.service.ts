import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { TelegramService } from '@/integrations/notifications/telegram/services/telegram.service';
import { NotificationSettingsService } from '@/modules/notification-settings/notification-settings.service';
import { NotificationQueryType } from './dto/notification-query.schema';
import {
  CreateNotificationInput,
  PaginatedResult,
} from './interfaces/notification.interface';
import { Notification as NotificationModel, Prisma } from 'generated/prisma';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly notificationSettingsService: NotificationSettingsService,
  ) {}

  create(input: CreateNotificationInput): void {
    setImmediate(async () => {
      try {
        const notification = await this.prisma.notification.create({
          data: input,
        });

        try {
          const shouldSend = await this.notificationSettingsService.shouldSend(
            notification.type,
            notification.severity,
          );

          if (shouldSend) {
            let sourceAgencyName: string | null = null;
            if (notification.source_agency_id) {
              const agency = await this.prisma.sourceAgency.findUnique({
                where: { id: notification.source_agency_id },
                select: { name: true },
              });
              sourceAgencyName = agency?.name ?? null;
            }

            await this.telegramService.sendNotification({
              ...notification,
              source_agency_name: sourceAgencyName,
            });
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to send Telegram notification: ${message}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to create notification: ${message}`);
      }
    });
  }

  async findAll(
    query: NotificationQueryType,
  ): Promise<PaginatedResult<NotificationModel>> {
    const where: Prisma.NotificationWhereInput = {
      ...(query.type && { type: query.type }),
      ...(query.severity && { severity: query.severity }),
      ...(query.is_read !== undefined && { is_read: query.is_read }),
      ...((query.date_from || query.date_to) && {
        created_at: {
          ...(query.date_from && { gte: query.date_from }),
          ...(query.date_to && { lte: query.date_to }),
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        total_pages: Math.ceil(total / query.limit),
        has_next: query.page < Math.ceil(total / query.limit),
        has_prev: query.page > 1,
      },
    };
  }

  async markRead(id: string): Promise<NotificationModel> {
    const existing = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Notification not found');
    }

    if (existing.is_read) {
      return existing;
    }

    return this.prisma.notification.update({
      where: { id },
      data: { is_read: true },
    });
  }

  async markAllRead(): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { is_read: false },
      data: { is_read: true },
    });

    return { updated: result.count };
  }

  async remove(id: string): Promise<{ deleted: number }> {
    const existing = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.delete({ where: { id } });

    return { deleted: 1 };
  }

  async removeMany(ids: string[]): Promise<{ deleted: number }> {
    const result = await this.prisma.notification.deleteMany({
      where: { id: { in: ids } },
    });

    return { deleted: result.count };
  }

  sendTelegramTest(message: string): Promise<{ sent: true }> {
    return this.telegramService.sendTestMessage(message);
  }
}
