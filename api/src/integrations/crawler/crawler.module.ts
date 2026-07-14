import { Module } from '@nestjs/common';
import { CrawlerDebugService } from './services/crawler-debug.service';
import { CrawlerService } from './services/crawler.service';
import { DetailEnrichmentService } from './services/detail-enrichment.service';
import { FieldExtractionService } from './services/field-extraction.service';
import { StealthBrowserService } from './services/stealth-browser.service';

@Module({
  providers: [
    StealthBrowserService,
    FieldExtractionService,
    CrawlerDebugService,
    CrawlerService,
    DetailEnrichmentService,
  ],
  exports: [
    StealthBrowserService,
    CrawlerService,
    DetailEnrichmentService,
  ],
})
export class CrawlerModule {}
