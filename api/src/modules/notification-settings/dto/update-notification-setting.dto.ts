import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { NotificationSeverity } from 'generated/prisma';

export class UpdateNotificationSettingDto {
  @ApiPropertyOptional({ description: 'Whether this notification type should be sent out' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    enum: NotificationSeverity,
    description: 'Only send when the notification severity is at or above this level',
  })
  @IsOptional()
  @IsEnum(NotificationSeverity)
  min_severity?: NotificationSeverity;
}
