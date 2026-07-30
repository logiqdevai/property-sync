import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { NotificationsIntegrationModule } from '@/integrations/notifications/notifications.module';
import { NotificationSettingsModule } from '@/modules/notification-settings/notification-settings.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [PrismaModule, NotificationsIntegrationModule, NotificationSettingsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
