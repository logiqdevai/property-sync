import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { IntegrationTargetsController } from './integration-targets.controller';
import { IntegrationTargetsService } from './integration-targets.service';

@Module({
  imports: [PrismaModule],
  controllers: [IntegrationTargetsController],
  providers: [IntegrationTargetsService],
  exports: [IntegrationTargetsService],
})
export class IntegrationTargetsModule {}
