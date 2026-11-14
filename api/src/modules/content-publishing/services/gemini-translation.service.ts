import { Injectable, Logger } from '@nestjs/common';
import { ContentLanguage, IntegrationType } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import {
  GeminiTranslateModel,
  getGeminiTranslateRates,
} from '@/modules/platform-config/constants/gemini-translate.constants';
import { buildAiTranslationSystemPrompt } from '../utils/ai-translation-prompt.util';
import { TranslationFailureReporterService } from './translation-failure-reporter.service';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_TRANSLATE_TIMEOUT_MS = 120_000;

export interface GeminiTranslationResult {
  text: string;
  model: GeminiTranslateModel;
  inputTokens: number;
  /** Visible output + thinking tokens (Google bills both as output). */
  outputTokens: number;
  thinkingTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

export class GeminiTranslationError extends Error {}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  error?: { code?: number; message?: string; status?: string };
}

/**
 * Translates with the user's own Gemini key (their GEMINI integration on the Integrations page).
 * Unlike the Google/Azure services this never passes a source language: agencies sometimes
 * publish individual listings in a different language than their configured content language,
 * and forcing the wrong source language makes those translations come back broken.
 *
 * Calls the Gemini REST API directly (not the Vercel AI SDK v1 used elsewhere): Gemini 3 models
 * control thinking via `thinkingLevel` and bill thinking tokens as output, and the SDK v1 can
 * neither send that option nor report thinking tokens, so cost logs would undercount.
 */
@Injectable()
export class GeminiTranslationService {
  private readonly logger = new Logger(GeminiTranslationService.name);

  constructor(
    private readonly prisma: PrismaService,
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
    model: GeminiTranslateModel,
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
      const response = await fetch(
        `${GEMINI_API_BASE}/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: buildAiTranslationSystemPrompt(target) }],
            },
            contents: [{ role: 'user', parts: [{ text }] }],
            generationConfig: {
              temperature: 0,
              // Translation needs no reasoning; "minimal" is the lowest level both offered
              // models support (thinking can't be fully switched off on Gemini 3).
              thinkingConfig: { thinkingLevel: 'minimal' },
            },
          }),
          signal: AbortSignal.timeout(GEMINI_TRANSLATE_TIMEOUT_MS),
        },
      );

      const body = (await response
        .json()
        .catch(() => ({}))) as GeminiGenerateContentResponse;
      if (!response.ok) {
        throw new GeminiTranslationError(
          `Gemini API ${response.status}: ${body.error?.message ?? response.statusText}`,
        );
      }

      const candidate = body.candidates?.[0];
      const translated = (candidate?.content?.parts ?? [])
        .filter((part) => !part.thought && part.text)
        .map((part) => part.text)
        .join('')
        .trim();
      if (!translated) {
        const reason =
          body.promptFeedback?.blockReason ?? candidate?.finishReason ?? 'empty response';
        throw new GeminiTranslationError(`Gemini returned no translation (${reason})`);
      }

      const usage = body.usageMetadata ?? {};
      const inputTokens = usage.promptTokenCount ?? 0;
      const thinkingTokens = usage.thoughtsTokenCount ?? 0;
      const outputTokens = (usage.candidatesTokenCount ?? 0) + thinkingTokens;
      const rates = getGeminiTranslateRates(model);
      const inputCost = inputTokens * rates.input;
      const outputCost = outputTokens * rates.output;

      return {
        text: translated,
        model,
        inputTokens,
        outputTokens,
        thinkingTokens,
        inputCost,
        outputCost,
        totalCost: inputCost + outputCost,
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
