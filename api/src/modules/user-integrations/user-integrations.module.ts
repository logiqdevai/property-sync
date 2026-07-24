import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { DewatermarkModule } from '@/integrations/dewatermark/dewatermark.module';
import { UserIntegrationsController } from './user-integrations.controller';
import { UserIntegrationsService } from './user-integrations.service';

@Module({
  imports: [PrismaModule, DewatermarkModule],
  controllers: [UserIntegrationsController],
  providers: [UserIntegrationsService],
  exports: [UserIntegrationsService],
})
export class UserIntegrationsModule {}
