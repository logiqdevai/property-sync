import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { UserIntegrationsModule } from '@/modules/user-integrations/user-integrations.module';
import { EstateWebModule } from '@/integrations/estateweb/estateweb.module';
import { CmsSyncModule } from '@/modules/cms-sync/cms-sync.module';
import { ContentPublishingModule } from '@/modules/content-publishing/content-publishing.module';
import { UserTrackedAgenciesController } from './user-tracked-agencies.controller';
import { UserTrackedAgenciesService } from './user-tracked-agencies.service';
import { AdminAgencyTrackersController } from './admin-agency-trackers.controller';
import { AdminAgencyTrackersService } from './admin-agency-trackers.service';

@Module({
  imports: [
    PrismaModule,
    UserIntegrationsModule,
    CmsSyncModule,
    EstateWebModule,
    ContentPublishingModule,
  ],
  controllers: [UserTrackedAgenciesController, AdminAgencyTrackersController],
  providers: [UserTrackedAgenciesService, AdminAgencyTrackersService],
})
export class UserTrackedAgenciesModule {}
