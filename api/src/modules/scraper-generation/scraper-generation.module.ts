import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { UserIntegrationsModule } from '@/modules/user-integrations/user-integrations.module';
import { ComputerUseModule } from '@/integrations/computer-use/computer-use.module';
import { GENERATION_QUEUE } from '@/core/queues/queues.constants';
import { GenerationProcessor } from '@/background/generation.processor';
import { ScraperGenerationController } from './scraper-generation.controller';
import { ScraperGenerationService } from './scraper-generation.service';

@Module({
  imports: [
    PrismaModule,
    UserIntegrationsModule,
    ComputerUseModule,
    BullModule.registerQueue({ name: GENERATION_QUEUE }),
  ],
  controllers: [ScraperGenerationController],
  providers: [ScraperGenerationService, GenerationProcessor],
  exports: [ScraperGenerationService],
})
export class ScraperGenerationModule {}
