import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { GoogleTranslateModule } from '@/integrations/google-translate/google-translate.module';
import { AiIntegrationModule } from '@/integrations/ai/ai.module';
import { AiBatchModule } from '@/integrations/ai-batch/ai-batch.module';
import { ContentPublishingController } from './content-publishing.controller';
import { ContentPublishingConfigService } from './services/content-publishing-config.service';
import { ContentProductionService } from './services/content-production.service';
import { ContentResolutionService } from './services/content-resolution.service';
import { GoogleTranslationService } from './services/google-translation.service';
import { AiTitleFamilyService } from './services/ai-title-family.service';
import { AiTitleBatchService } from './services/ai-title-batch.service';

@Module({
  imports: [
    PrismaModule,
    GoogleTranslateModule,
    AiIntegrationModule,
    forwardRef(() => AiBatchModule),
  ],
  controllers: [ContentPublishingController],
  providers: [
    ContentPublishingConfigService,
    ContentProductionService,
    ContentResolutionService,
    GoogleTranslationService,
    AiTitleFamilyService,
    AiTitleBatchService,
  ],
  exports: [
    ContentPublishingConfigService,
    ContentProductionService,
    ContentResolutionService,
    AiTitleBatchService,
  ],
})
export class ContentPublishingModule {}
