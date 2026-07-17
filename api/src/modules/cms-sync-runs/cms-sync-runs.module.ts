import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { AdminCmsSyncRunsController } from './admin-cms-sync-runs.controller';
import { CmsSyncRunsController } from './cms-sync-runs.controller';
import { CmsSyncRunsService } from './cms-sync-runs.service';

@Module({
  imports: [PrismaModule],
  controllers: [CmsSyncRunsController, AdminCmsSyncRunsController],
  providers: [CmsSyncRunsService],
  exports: [CmsSyncRunsService],
})
export class CmsSyncRunsModule {}
