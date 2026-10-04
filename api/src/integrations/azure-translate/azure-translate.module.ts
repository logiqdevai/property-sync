import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { PlatformConfigModule } from '@/modules/platform-config/platform-config.module';
import { AzureTranslateConfig } from './config/azure-translate.config';
import { AzureTranslateClientService } from './services/azure-translate-client.service';
import { AzureTranslateIntegrationResolverService } from './services/azure-translate-integration-resolver.service';
import { AzureTranslateOrchestratorService } from './services/azure-translate-orchestrator.service';
import { AzureTranslateService } from './services/azure-translate.service';

@Module({
  imports: [PrismaModule, PlatformConfigModule],
  providers: [
    AzureTranslateConfig,
    AzureTranslateClientService,
    AzureTranslateService,
    AzureTranslateIntegrationResolverService,
    AzureTranslateOrchestratorService,
  ],
  exports: [
    AzureTranslateConfig,
    AzureTranslateClientService,
    AzureTranslateService,
    AzureTranslateIntegrationResolverService,
    AzureTranslateOrchestratorService,
  ],
})
export class AzureTranslateModule {}
