import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import {
  CRAWL_QUEUE,
  GENERATION_QUEUE,
  CONTENT_PRODUCTION_QUEUE,
  CMS_SYNC_QUEUE,
  SALES_PRICE_UPDATE_QUEUE,
  WATERMARK_REMOVAL_QUEUE,
} from '@/core/queues/queues.constants';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue(
      { name: GENERATION_QUEUE },
      { name: CRAWL_QUEUE },
      { name: WATERMARK_REMOVAL_QUEUE },
      { name: CONTENT_PRODUCTION_QUEUE },
      { name: SALES_PRICE_UPDATE_QUEUE },
      { name: CMS_SYNC_QUEUE },
    ),
  ],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
