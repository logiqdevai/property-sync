import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { CMS_SYNC_QUEUE } from '@/core/queues/queues.constants';
import { CmsSyncProcessor } from '@/background/cms-sync.processor';
import { EstateWebModule } from '@/integrations/estateweb/estateweb.module';
import { CmsSyncRunsModule } from '@/modules/cms-sync-runs/cms-sync-runs.module';
import { CrawlRunsModule } from '@/modules/crawl-runs/crawl-runs.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { CmsSyncAdapterFactory } from './services/cms-sync-adapter.factory';
import { CmsSyncOrchestratorService } from './services/cms-sync-orchestrator.service';
import { CmsSyncBatchService } from './services/cms-sync-batch.service';
import { AdminCmsSyncController } from './admin-cms-sync.controller';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: CMS_SYNC_QUEUE }),
    EstateWebModule,
    CmsSyncRunsModule,
    forwardRef(() => CrawlRunsModule),
    NotificationsModule,
  ],
  controllers: [AdminCmsSyncController],
  providers: [
    CmsSyncAdapterFactory,
    CmsSyncOrchestratorService,
    CmsSyncBatchService,
    CmsSyncProcessor,
  ],
  exports: [CmsSyncOrchestratorService, CmsSyncBatchService],
})
export class CmsSyncModule {}
