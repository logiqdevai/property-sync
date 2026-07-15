import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { CRAWL_QUEUE } from '@/core/queues/queues.constants';
import { CrawlerModule } from '@/integrations/crawler/crawler.module';
import { CrawlProcessor } from '@/background/crawl.processor';
import { CrawlSchedulerCron } from '@/background/crawl-scheduler.cron';
import { ScraperHealthCron } from '@/background/scraper-health.cron';
import { ScraperGenerationModule } from '@/modules/scraper-generation/scraper-generation.module';
import { PropertiesModule } from '@/modules/properties/properties.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { CrawlRunsController } from './crawl-runs.controller';
import { UsageController } from './usage.controller';
import { CrawlRunsService } from './crawl-runs.service';

@Module({
  imports: [
    PrismaModule,
    CrawlerModule,
    ScraperGenerationModule,
    PropertiesModule,
    NotificationsModule,
    BullModule.registerQueue({ name: CRAWL_QUEUE }),
  ],
  controllers: [CrawlRunsController, UsageController],
  providers: [
    CrawlRunsService,
    CrawlProcessor,
    CrawlSchedulerCron,
    ScraperHealthCron,
  ],
  exports: [CrawlRunsService],
})
export class CrawlRunsModule {}
