import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { CRAWL_QUEUE } from '@/core/queues/queues.constants';
import { CrawlerModule } from '@/integrations/crawler/crawler.module';
import { PlatformConfigModule } from '@/modules/platform-config/platform-config.module';
import { CrawlProcessor } from '@/background/crawl.processor';
import { CrawlSchedulerCron } from '@/background/crawl-scheduler.cron';
import { ScraperHealthCron } from '@/background/scraper-health.cron';
import { CrawlRunWatchdogCron } from '@/background/crawl-run-watchdog.cron';
import { ScraperFailureHandlerService } from '@/background/scraper-failure-handler.service';
import { ScraperGenerationModule } from '@/modules/scraper-generation/scraper-generation.module';
import { PropertiesModule } from '@/modules/properties/properties.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { CrawlRunsController } from './crawl-runs.controller';
import { CrawlRunsService } from './crawl-runs.service';

@Module({
  imports: [
    PrismaModule,
    CrawlerModule,
    PlatformConfigModule,
    ScraperGenerationModule,
    PropertiesModule,
    NotificationsModule,
    BullModule.registerQueue({ name: CRAWL_QUEUE }),
  ],
  controllers: [CrawlRunsController],
  providers: [
    CrawlRunsService,
    CrawlProcessor,
    CrawlSchedulerCron,
    ScraperHealthCron,
    CrawlRunWatchdogCron,
    ScraperFailureHandlerService,
  ],
  exports: [CrawlRunsService],
})
export class CrawlRunsModule {}
