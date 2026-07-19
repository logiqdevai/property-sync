import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { CMS_SYNC_QUEUE } from '@/core/queues/queues.constants';
import { AdminCmsSyncRunsController } from './admin-cms-sync-runs.controller';
import { CmsSyncRunsController } from './cms-sync-runs.controller';
import { CmsSyncRunsService } from './cms-sync-runs.service';

@Module({
  imports: [PrismaModule, BullModule.registerQueue({ name: CMS_SYNC_QUEUE })],
  controllers: [CmsSyncRunsController, AdminCmsSyncRunsController],
  providers: [CmsSyncRunsService],
  exports: [CmsSyncRunsService],
})
export class CmsSyncRunsModule {}
