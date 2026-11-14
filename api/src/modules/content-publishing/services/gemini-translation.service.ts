import { Injectable, Logger } from '@nestjs/common';
import { ContentLanguage, IntegrationType } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { AiService } from '@/integrations/ai/services/ai.service';
import { AiProviders } from '@/integrations/ai/interfaces/ai.interface';
import { TranslationFailureReporterService } from './translation-failure-reporter.service';

const TARGET_LANGUAGE_NAMES: Record<ContentLanguage, string> = {
  EL: 'Greek',
  EN: 'English',
  DE: 'German',
  FR: 'French',
  IT: 'Italian',
  RU: 'Russian',
};

const GEMINI_TRANSLATE_TIMEOUT_MS = 120_000;

export interface GeminiTranslationResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

export class GeminiTranslationError extends Error {}

function buildSystemPrompt(target: ContentLanguage): string {
  const language = TARGET_LANGUAGE_NAMES[target];
  return [
    `You are a professional real-estate translator. Translate the text the user sends into ${language}.`,
    'The source language is not given: detect it yourself. The text may be in any language, or mix several languages; translate every part into ' +
      `${language}. If the text is already entirely in ${language}, return it unchanged.`,
    'Keep the exact meaning and tone. Keep line breaks, paragraph structure, lists, numbers, prices, measurements, units, phone numbers, emails and URLs exactly as they are.',
    'Write place names, street names and proper nouns the way they are normally written in ' +
      `${language}.`,
    'Reply with the translated text only: no introduction, no notes, no quotation marks, no markdown that was not in the original.',
  ].join('\n');
}

/**
 * Translates with the user's own Gemini key (their GEMINI integration on the Integrations page).
 * Unlike the Google/Azure services this never passes a source language: agencies sometimes
 * publish individual listings in a different language than their configured content language,
 * and forcing the wrong source language makes those translations come back broken.
 */
@Injectable()
export class GeminiTranslationService {
  private readonly logger = new Logger(GeminiTranslationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly failureReporter: TranslationFailureReporterService,
  ) {}

  private async findApiKeyForUser(userId: string): Promise<string | null> {
    const integration = await this.prisma.userIntegration.findFirst({
      where: {
        user_id: userId,
        is_active: true,
        api_key_secret: { not: null },
        integration_target: { integration_type: IntegrationType.GEMINI },
      },
      orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
      select: { api_key_secret: true },
    });
    return integration?.api_key_secret ?? null;
  }

  async translate(
    userId: string,
    text: string,
    target: ContentLanguage,
    model: string,
  ): Promise<GeminiTranslationResult> {
    const apiKey = await this.findApiKeyForUser(userId);
    if (!apiKey) {
      const message =
        'No active Gemini integration; connect a Gemini API key on the Integrations page';
      await this.failureReporter.report({
        userId,
        code: 'GEMINI_TRANSLATE_NOT_CONFIGURED',
        message,
        targetLanguage: target,
      });
      // Throw (instead of returning the source text like Azure does) so the untranslated
      // text is never stored as the translation; the job is retried on the next run.
      throw new GeminiTranslationError(message);
    }

    try {
      const { response, usage } = await this.aiService.generateText({
        provider: AiProviders.gemini,
        model,
        apiKey,
        system: buildSystemPrompt(target),
        prompt: text,
        temperature: 0,
        timeoutMs: GEMINI_TRANSLATE_TIMEOUT_MS,
        // 2.5 Flash/Flash-Lite "think" by default; translation doesn't need it, and thinking
        // tokens are billed but not reported in usage, so cost logs would undercount.
        providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      });

      const translated = response?.trim();
      if (!translated) {
        throw new GeminiTranslationError('Gemini returned an empty translation');
      }

      return {
        text: translated,
        model,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        inputCost: usage?.inputCost ?? 0,
        outputCost: usage?.outputCost ?? 0,
        totalCost: usage?.totalCost ?? 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Gemini translation failed for user=${userId}: ${message}`);
      await this.failureReporter.report({
        userId,
        code: 'GEMINI_TRANSLATE_API_ERROR',
        message,
        targetLanguage: target,
        details: { model },
      });
      throw error;
    }
  }
}
