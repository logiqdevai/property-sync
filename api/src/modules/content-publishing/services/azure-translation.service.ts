import { Injectable, Logger } from '@nestjs/common';
import { ContentLanguage } from 'generated/prisma';
import { AzureTranslateOrchestratorService } from '@/integrations/azure-translate/services/azure-translate-orchestrator.service';
import { CONTENT_LANGUAGE_TO_GOOGLE_CODE } from '../constants/content-language.constants';

@Injectable()
export class AzureTranslationService {
  private readonly logger = new Logger(AzureTranslationService.name);

  constructor(
    private readonly azureTranslateOrchestrator: AzureTranslateOrchestratorService,
  ) {}

  async isConfiguredForUser(userId: string): Promise<boolean> {
    const integration =
      await this.azureTranslateOrchestrator.findActiveForUser(userId);
    return !!integration;
  }

  async translate(
    userId: string,
    text: string,
    source: ContentLanguage,
    target: ContentLanguage,
  ): Promise<string> {
    if (!text?.trim()) return text ?? '';
    if (source === target) return text;

    const configured = await this.isConfiguredForUser(userId);
    if (!configured) {
      this.logger.warn(
        `Azure Translate not configured for user=${userId}; returning original text`,
      );
      return text;
    }

    return this.azureTranslateOrchestrator.translateTextForUser(
      userId,
      text,
      CONTENT_LANGUAGE_TO_GOOGLE_CODE[target],
      CONTENT_LANGUAGE_TO_GOOGLE_CODE[source],
    );
  }
}
