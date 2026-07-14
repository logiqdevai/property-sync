import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { UserIntegrationsController } from './user-integrations.controller';
import { UserIntegrationsService } from './user-integrations.service';

@Module({
  imports: [PrismaModule],
  controllers: [UserIntegrationsController],
  providers: [UserIntegrationsService],
  exports: [UserIntegrationsService],
})
export class UserIntegrationsModule {}
