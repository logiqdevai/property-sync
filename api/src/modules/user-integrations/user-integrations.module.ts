import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { UserIntegrationsService } from './user-integrations.service';

@Module({
  imports: [PrismaModule],
  providers: [UserIntegrationsService],
  exports: [UserIntegrationsService],
})
export class UserIntegrationsModule {}
