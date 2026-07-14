import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { CrawlRunsModule } from '@/modules/crawl-runs/crawl-runs.module';
import { ScrapersController } from './scrapers.controller';
import { ScrapersService } from './scrapers.service';

@Module({
  imports: [PrismaModule, CrawlRunsModule],
  controllers: [ScrapersController],
  providers: [ScrapersService],
  exports: [ScrapersService],
})
export class ScrapersModule {}
