import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import {
  CONTENT_PRODUCTION_QUEUE,
  WATERMARK_REMOVAL_QUEUE,
} from '@/core/queues/queues.constants';
import { DewatermarkModule } from '@/integrations/dewatermark/dewatermark.module';
import { EstateWebModule } from '@/integrations/estateweb/estateweb.module';
import { GcsIntegrationModule } from '@/integrations/storage/gcs/gcs.module';
import { CmsSyncModule } from '@/modules/cms-sync/cms-sync.module';
import { ContentPublishingModule } from '@/modules/content-publishing/content-publishing.module';
import { PlatformConfigModule } from '@/modules/platform-config/platform-config.module';
import { CostLogsModule } from '@/modules/cost-logs/cost-logs.module';
import { ContentProductionProcessor } from '@/background/content-production.processor';
import { WatermarkRemovalProcessor } from '@/background/watermark-removal.processor';
import { UserPropertiesController } from './user-properties.controller';
import { AdminUserPropertiesController } from './admin-user-properties.controller';
import { UserPropertiesService } from './user-properties.service';
import { ContentProductionJobService } from './services/content-production-job.service';
import { WatermarkRemovalService } from './services/watermark-removal.service';

@Module({
  imports: [
    PrismaModule,
    CmsSyncModule,
    ContentPublishingModule,
    EstateWebModule,
    DewatermarkModule,
    GcsIntegrationModule,
    PlatformConfigModule,
    CostLogsModule,
    BullModule.registerQueue(
      { name: WATERMARK_REMOVAL_QUEUE },
      { name: CONTENT_PRODUCTION_QUEUE },
    ),
  ],
  controllers: [UserPropertiesController, AdminUserPropertiesController],
  providers: [
    UserPropertiesService,
    WatermarkRemovalService,
    WatermarkRemovalProcessor,
    ContentProductionJobService,
    ContentProductionProcessor,
  ],
  exports: [UserPropertiesService],
})
export class UserPropertiesModule {}
