import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { UserIntegrationsModule } from '@/modules/user-integrations/user-integrations.module';
import { EstateWebModule } from '@/integrations/estateweb/estateweb.module';
import { CmsSyncModule } from '@/modules/cms-sync/cms-sync.module';
import { UserTrackedAgenciesController } from './user-tracked-agencies.controller';
import { UserTrackedAgenciesService } from './user-tracked-agencies.service';

@Module({
  imports: [PrismaModule, UserIntegrationsModule, CmsSyncModule, EstateWebModule],
  controllers: [UserTrackedAgenciesController],
  providers: [UserTrackedAgenciesService],
})
export class UserTrackedAgenciesModule {}
