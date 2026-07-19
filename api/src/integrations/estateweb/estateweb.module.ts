import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { EstateWebConfig } from './config/estateweb.config';
import { EstateWebAuthService } from './services/estateweb-auth.service';
import { EstateWebClientService } from './services/estateweb-client.service';
import { EstateWebCmsSyncAdapter } from './services/estateweb-cms-sync-adapter.service';
import { EstateWebIntegrationResolverService } from './services/estateweb-integration-resolver.service';
import { EstateWebNotificationService } from './services/estateweb-notification.service';
import { EstateWebPropertyService } from './services/estateweb-property.service';
import { EstateWebSessionService } from './services/estateweb-session.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [
    EstateWebConfig,
    EstateWebNotificationService,
    EstateWebAuthService,
    EstateWebSessionService,
    EstateWebClientService,
    EstateWebPropertyService,
    EstateWebIntegrationResolverService,
    EstateWebCmsSyncAdapter,
  ],
  exports: [
    EstateWebConfig,
    EstateWebNotificationService,
    EstateWebAuthService,
    EstateWebSessionService,
    EstateWebClientService,
    EstateWebPropertyService,
    EstateWebIntegrationResolverService,
    EstateWebCmsSyncAdapter,
  ],
})
export class EstateWebModule {}
