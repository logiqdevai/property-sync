import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { CmsSyncModule } from '@/modules/cms-sync/cms-sync.module';
import { UserPropertiesController } from './user-properties.controller';
import { UserPropertiesService } from './user-properties.service';

@Module({
  imports: [PrismaModule, CmsSyncModule],
  controllers: [UserPropertiesController],
  providers: [UserPropertiesService],
  exports: [UserPropertiesService],
})
export class UserPropertiesModule {}
