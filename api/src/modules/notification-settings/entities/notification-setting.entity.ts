import { ApiProperty } from '@nestjs/swagger';
import { NotificationSeverity, NotificationType } from 'generated/prisma';

// One entry per NotificationType, always present in the API response even if
// no row exists yet in the DB (see NotificationSettingsService.findAll).
export class NotificationSetting {
  @ApiProperty({ enum: NotificationType })
  type: NotificationType;

  @ApiProperty({ description: 'Whether this notification type is forwarded to alerting channels (e.g. Telegram)' })
  enabled: boolean;

  @ApiProperty({
    enum: NotificationSeverity,
    description: 'Only forward notifications of this severity or higher',
  })
  min_severity: NotificationSeverity;

  @ApiProperty({ nullable: true, description: 'Null if this row has never been customized' })
  updated_at: Date | null;
}
