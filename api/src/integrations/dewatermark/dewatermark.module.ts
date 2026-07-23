import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { DewatermarkConfig } from './config/dewatermark.config';
import { DewatermarkClientService } from './services/dewatermark-client.service';
import { DewatermarkImageService } from './services/dewatermark-image.service';
import { DewatermarkIntegrationResolverService } from './services/dewatermark-integration-resolver.service';
import { DewatermarkOrchestratorService } from './services/dewatermark-orchestrator.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    DewatermarkConfig,
    DewatermarkClientService,
    DewatermarkImageService,
    DewatermarkIntegrationResolverService,
    DewatermarkOrchestratorService,
  ],
  exports: [
    DewatermarkConfig,
    DewatermarkClientService,
    DewatermarkImageService,
    DewatermarkIntegrationResolverService,
    DewatermarkOrchestratorService,
  ],
})
export class DewatermarkModule {}
