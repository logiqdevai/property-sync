import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { NotificationSeverity, NotificationType } from 'generated/prisma';
import { UpdateNotificationSettingDto } from './dto/update-notification-setting.dto';
import { NotificationSetting } from './entities/notification-setting.entity';
import { SEVERITY_RANK } from './constants/severity-rank.constant';

const DEFAULT_ENABLED = true;
const DEFAULT_MIN_SEVERITY = NotificationSeverity.INFO;

@Injectable()
export class NotificationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<NotificationSetting[]> {
    const rows = await this.prisma.notificationSetting.findMany();
    const rowsByType = new Map(rows.map((row) => [row.type, row]));

    return Object.values(NotificationType).map((type) => {
      const row = rowsByType.get(type);
      return {
        type,
        enabled: row?.enabled ?? DEFAULT_ENABLED,
        min_severity: row?.min_severity ?? DEFAULT_MIN_SEVERITY,
        updated_at: row?.updated_at ?? null,
      };
    });
  }

  async update(
    type: NotificationType,
    dto: UpdateNotificationSettingDto,
  ): Promise<NotificationSetting> {
    const row = await this.prisma.notificationSetting.upsert({
      where: { type },
      create: {
        type,
        enabled: dto.enabled ?? DEFAULT_ENABLED,
        min_severity: dto.min_severity ?? DEFAULT_MIN_SEVERITY,
      },
      update: dto,
    });

    return {
      type: row.type,
      enabled: row.enabled,
      min_severity: row.min_severity,
      updated_at: row.updated_at,
    };
  }

  // Whether a notification of this type/severity should be forwarded to
  // outbound alerting channels (Telegram, etc). The notification record
  // itself is always persisted regardless -- this only gates outbound sends.
  async shouldSend(
    type: NotificationType,
    severity: NotificationSeverity,
  ): Promise<boolean> {
    const row = await this.prisma.notificationSetting.findUnique({
      where: { type },
    });

    if (!row) return true;

    return row.enabled && SEVERITY_RANK[severity] >= SEVERITY_RANK[row.min_severity];
  }
}
