import { ApiProperty } from '@nestjs/swagger';
import { NotificationSeverity, NotificationType } from 'generated/prisma';

export class Notification {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ enum: NotificationType })
  type: NotificationType;

  @ApiProperty({ enum: NotificationSeverity })
  severity: NotificationSeverity;

  @ApiProperty()
  title: string;

  @ApiProperty()
  message: string;

  @ApiProperty({ nullable: true })
  source_agency_id: string | null;

  @ApiProperty({ nullable: true })
  scraper_id: string | null;

  @ApiProperty({ nullable: true })
  crawl_run_id: string | null;

  @ApiProperty()
  is_read: boolean;

  @ApiProperty()
  created_at: Date;
}
