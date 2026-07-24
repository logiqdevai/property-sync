import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { DewatermarkConfig } from './config/dewatermark.config';
import { DewatermarkClientService } from './services/dewatermark-client.service';
import { DewatermarkCreditService } from './services/dewatermark-credit.service';
import { DewatermarkImageService } from './services/dewatermark-image.service';
import { DewatermarkIntegrationResolverService } from './services/dewatermark-integration-resolver.service';
import { DewatermarkOrchestratorService } from './services/dewatermark-orchestrator.service';

@Module({
  imports: [PrismaModule],
  providers: [
    DewatermarkConfig,
    DewatermarkClientService,
    DewatermarkCreditService,
    DewatermarkImageService,
    DewatermarkIntegrationResolverService,
    DewatermarkOrchestratorService,
  ],
  exports: [
    DewatermarkConfig,
    DewatermarkClientService,
    DewatermarkCreditService,
    DewatermarkImageService,
    DewatermarkIntegrationResolverService,
    DewatermarkOrchestratorService,
  ],
})
export class DewatermarkModule {}
