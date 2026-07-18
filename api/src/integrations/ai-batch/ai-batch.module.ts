import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AI_BATCH_COMPLETE_QUEUE } from '@/core/queues/queues.constants';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { PlatformConfigModule } from '@/modules/platform-config/platform-config.module';
import { AiBatchClientService } from './services/ai-batch-client.service';
import { PropertyAiBatchService } from './services/property-ai-batch.service';

@Module({
  imports: [
    PrismaModule,
    PlatformConfigModule,
    BullModule.registerQueue({ name: AI_BATCH_COMPLETE_QUEUE }),
  ],
  providers: [AiBatchClientService, PropertyAiBatchService],
  exports: [AiBatchClientService, PropertyAiBatchService],
})
export class AiBatchModule {}
