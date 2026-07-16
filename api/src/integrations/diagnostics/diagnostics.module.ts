import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { StealthBrowserModule } from '@/integrations/crawler/stealth-browser.module';
import { GcsIntegrationModule } from '@/integrations/storage/gcs/gcs.module';
import { DiagnosticsCaptureService } from './services/diagnostics-capture.service';

@Module({
  imports: [StealthBrowserModule, GcsIntegrationModule, PrismaModule],
  providers: [DiagnosticsCaptureService],
  exports: [DiagnosticsCaptureService],
})
export class DiagnosticsModule {}
