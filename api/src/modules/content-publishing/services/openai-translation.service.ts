import { Injectable, Logger } from '@nestjs/common';
import { ContentLanguage, IntegrationType } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import {
  OPENAI_TRANSLATE_PRICING,
  OpenAiTranslateModel,
} from '@/modules/platform-config/constants/openai-translate.constants';
import { buildAiTranslationSystemPrompt } from '../utils/ai-translation-prompt.util';
import { TranslationFailureReporterService } from './translation-failure-reporter.service';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_TRANSLATE_TIMEOUT_MS = 120_000;

export interface OpenAiTranslationResult {
  text: string;
  model: OpenAiTranslateModel;
  inputTokens: number;
  /** Visible output + reasoning tokens (OpenAI bills both as output). */
  outputTokens: number;
  reasoningTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

export class OpenAiTranslationError extends Error {}

interface OpenAiChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string | null; refusal?: string | null };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message?: string; type?: string; code?: string };
}

/**
 * Translates with the user's own OpenAI key (the same OPENAI integration used for
 * normalization and titles). Like Gemini, it never passes a source language; the model
 * detects it per text (see buildAiTranslationSystemPrompt).
 *
 * Calls the Chat Completions REST API directly with reasoning_effort "none": translation needs
 * no reasoning, and the AI SDK v1 used elsewhere doesn't expose that option.
 */
@Injectable()
export class OpenAiTranslationService {
  private readonly logger = new Logger(OpenAiTranslationService.name);

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
        integration_target: { integration_type: IntegrationType.OPENAI },
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
    model: OpenAiTranslateModel,
  ): Promise<OpenAiTranslationResult> {
    const apiKey = await this.findApiKeyForUser(userId);
    if (!apiKey) {
      const message =
        'No active OpenAI integration; connect an OpenAI API key on the Integrations page';
      await this.failureReporter.report({
        userId,
        code: 'OPENAI_TRANSLATE_NOT_CONFIGURED',
        message,
        targetLanguage: target,
      });
      // Throw so the untranslated text is never stored; the job is retried on the next run.
      throw new OpenAiTranslationError(message);
    }

    try {
      const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          reasoning_effort: 'none',
          messages: [
            { role: 'developer', content: buildAiTranslationSystemPrompt(target) },
            { role: 'user', content: text },
          ],
        }),
        signal: AbortSignal.timeout(OPENAI_TRANSLATE_TIMEOUT_MS),
      });

      const body = (await response
        .json()
        .catch(() => ({}))) as OpenAiChatCompletionResponse;
      if (!response.ok) {
        throw new OpenAiTranslationError(
          `OpenAI API ${response.status}: ${body.error?.message ?? response.statusText}`,
        );
      }

      const choice = body.choices?.[0];
      const translated = choice?.message?.content?.trim();
      if (!translated) {
        const reason =
          choice?.message?.refusal ?? choice?.finish_reason ?? 'empty response';
        throw new OpenAiTranslationError(`OpenAI returned no translation (${reason})`);
      }
      if (choice?.finish_reason === 'length') {
        throw new OpenAiTranslationError('OpenAI translation was cut off (length)');
      }

      const usage = body.usage ?? {};
      const inputTokens = usage.prompt_tokens ?? 0;
      // completion_tokens already includes the reasoning tokens.
      const outputTokens = usage.completion_tokens ?? 0;
      const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? 0;
      const rates = OPENAI_TRANSLATE_PRICING[model];
      const inputCost = inputTokens * rates.input;
      const outputCost = outputTokens * rates.output;

      return {
        text: translated,
        model,
        inputTokens,
        outputTokens,
        reasoningTokens,
        inputCost,
        outputCost,
        totalCost: inputCost + outputCost,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`OpenAI translation failed for user=${userId}: ${message}`);
      await this.failureReporter.report({
        userId,
        code: 'OPENAI_TRANSLATE_API_ERROR',
        message,
        targetLanguage: target,
        details: { model },
      });
      throw error;
    }
  }
}
