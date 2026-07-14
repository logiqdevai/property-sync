import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { CRAWL_QUEUE } from '@/core/queues/queues.constants';
import { CrawlProcessor } from '@/background/crawl.processor';
import { CrawlSchedulerCron } from '@/background/crawl-scheduler.cron';
import { CrawlRunsController } from './crawl-runs.controller';
import { CrawlRunsService } from './crawl-runs.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: CRAWL_QUEUE }),
  ],
  controllers: [CrawlRunsController],
  providers: [CrawlRunsService, CrawlProcessor, CrawlSchedulerCron],
  exports: [CrawlRunsService],
})
export class CrawlRunsModule {}
