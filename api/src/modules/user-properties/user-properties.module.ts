import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { EstateWebModule } from '@/integrations/estateweb/estateweb.module';
import { CmsSyncModule } from '@/modules/cms-sync/cms-sync.module';
import { UserPropertiesController } from './user-properties.controller';
import { AdminUserPropertiesController } from './admin-user-properties.controller';
import { UserPropertiesService } from './user-properties.service';

@Module({
  imports: [PrismaModule, CmsSyncModule, EstateWebModule],
  controllers: [UserPropertiesController, AdminUserPropertiesController],
  providers: [UserPropertiesService],
  exports: [UserPropertiesService],
})
export class UserPropertiesModule {}
