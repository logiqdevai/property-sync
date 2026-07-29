import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { AiIntegrationModule } from '@/integrations/ai/ai.module';
import { UserIntegrationsModule } from '@/modules/user-integrations/user-integrations.module';
import { AI_BATCH_COMPLETE_QUEUE } from '@/core/queues/queues.constants';
import { AiBatchModule } from '@/integrations/ai-batch/ai-batch.module';
import { GcsIntegrationModule } from '@/integrations/storage/gcs/gcs.module';
import { PlatformConfigModule } from '@/modules/platform-config/platform-config.module';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { PropertyNormalizationService } from './services/property-normalization.service';
import { AnthropicNormalizationService } from './services/anthropic-normalization.service';
import { AiBatchCompleteProcessor } from '@/background/ai-batch-complete.processor';
import { UserPropertiesModule } from '@/modules/user-properties/user-properties.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { CmsSyncModule } from '@/modules/cms-sync/cms-sync.module';
import { CostLogsModule } from '@/modules/cost-logs/cost-logs.module';

@Module({
  imports: [
    PrismaModule,
    AiIntegrationModule,
    UserIntegrationsModule,
    AiBatchModule,
    UserPropertiesModule,
    NotificationsModule,
    GcsIntegrationModule,
    PlatformConfigModule,
    CmsSyncModule,
    CostLogsModule,
    BullModule.registerQueue({ name: AI_BATCH_COMPLETE_QUEUE }),
  ],
  controllers: [PropertiesController],
  providers: [
    PropertiesService,
    PropertyNormalizationService,
    AnthropicNormalizationService,
    AiBatchCompleteProcessor,
  ],
  exports: [PropertyNormalizationService],
})
export class PropertiesModule {}
