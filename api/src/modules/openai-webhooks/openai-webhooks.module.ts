import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { AiBatchModule } from '@/integrations/ai-batch/ai-batch.module';
import { PropertiesModule } from '@/modules/properties/properties.module';
import { ContentPublishingModule } from '@/modules/content-publishing/content-publishing.module';
import { CmsSyncModule } from '@/modules/cms-sync/cms-sync.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { OpenAiWebhooksController } from './openai-webhooks.controller';
import { OpenAiWebhooksService } from './openai-webhooks.service';

@Module({
  imports: [
    PrismaModule,
    AiBatchModule,
    PropertiesModule,
    ContentPublishingModule,
    forwardRef(() => CmsSyncModule),
    NotificationsModule,
  ],
  controllers: [OpenAiWebhooksController],
  providers: [OpenAiWebhooksService],
})
export class OpenAiWebhooksModule {}
