import { Module } from '@nestjs/common';
import { DiagnosticsModule } from '@/integrations/diagnostics/diagnostics.module';
import { PlatformConfigModule } from '@/modules/platform-config/platform-config.module';
import { CrawlerDebugService } from './services/crawler-debug.service';
import { CrawlerService } from './services/crawler.service';
import { DetailEnrichmentService } from './services/detail-enrichment.service';
import { FieldExtractionService } from './services/field-extraction.service';
import { StealthBrowserModule } from './stealth-browser.module';

@Module({
  imports: [StealthBrowserModule, DiagnosticsModule, PlatformConfigModule],
  providers: [
    FieldExtractionService,
    CrawlerDebugService,
    CrawlerService,
    DetailEnrichmentService,
  ],
  exports: [
    StealthBrowserModule,
    CrawlerService,
    DetailEnrichmentService,
  ],
})
export class CrawlerModule {}
