import { Injectable, Logger } from '@nestjs/common';
import { ContentLanguage } from 'generated/prisma';
import { AzureTranslateOrchestratorService } from '@/integrations/azure-translate/services/azure-translate-orchestrator.service';
import { AzureTranslateException } from '@/integrations/azure-translate/exceptions/azure-translate.exception';
import { CONTENT_LANGUAGE_TO_GOOGLE_CODE } from '../constants/content-language.constants';
import { TranslationFailureReporterService } from './translation-failure-reporter.service';

@Injectable()
export class AzureTranslationService {
  private readonly logger = new Logger(AzureTranslationService.name);

  constructor(
    private readonly azureTranslateOrchestrator: AzureTranslateOrchestratorService,
    private readonly failureReporter: TranslationFailureReporterService,
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
      await this.failureReporter.report({
        userId,
        code: 'AZURE_TRANSLATE_NOT_CONFIGURED',
        message:
          'No active Azure Translate integration; untranslated text was used instead',
        sourceLanguage: source,
        targetLanguage: target,
      });
      return text;
    }

    try {
      return await this.azureTranslateOrchestrator.translateTextForUser(
        userId,
        text,
        CONTENT_LANGUAGE_TO_GOOGLE_CODE[target],
        CONTENT_LANGUAGE_TO_GOOGLE_CODE[source],
      );
    } catch (error) {
      if (error instanceof AzureTranslateException) {
        await this.failureReporter.report({
          userId,
          code: error.code,
          message: error.message,
          httpStatus: error.getStatus(),
          sourceLanguage: source,
          targetLanguage: target,
          details: error.details,
        });
      }
      throw error;
    }
  }
}
