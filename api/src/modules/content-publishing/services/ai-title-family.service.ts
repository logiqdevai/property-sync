import { Injectable, Logger } from '@nestjs/common';
import { ContentLanguage } from 'generated/prisma';
import { AiService } from '@/integrations/ai/services/ai.service';
import { AiDefaults } from '@/integrations/ai/utils/ai.config';
import {
  AI_TITLE_SYSTEM_PROMPT,
  buildAiTitleUserPrompt,
} from '../constants/ai-title-prompt';

@Injectable()
export class AiTitleFamilyService {
  private readonly logger = new Logger(AiTitleFamilyService.name);

  constructor(private readonly aiService: AiService) {}

  async generateTitles(input: {
    sourceLanguage: ContentLanguage;
    targetLanguages: ContentLanguage[];
    title: string;
    description?: string | null;
    instructions?: string | null;
    model?: string | null;
    apiKey?: string;
  }): Promise<Partial<Record<ContentLanguage, string>>> {
    if (!input.targetLanguages.length) return {};

    const prompt = buildAiTitleUserPrompt({
      sourceLanguage: input.sourceLanguage,
      targetLanguages: input.targetLanguages,
      title: input.title,
      description: input.description,
      familyInstructions: input.instructions,
    });

    const result = await this.aiService.generateText({
      provider: 'openai',
      model: input.model || AiDefaults.model,
      apiKey: input.apiKey,
      system: AI_TITLE_SYSTEM_PROMPT,
      prompt,
      temperature: 0.4,
      maxTokens: 1200,
    });

    return this.parseTitlesResponse(result.response, input.targetLanguages);
  }

  parseTitlesResponse(
    raw: string,
    targetLanguages: ContentLanguage[],
  ): Partial<Record<ContentLanguage, string>> {
    const jsonText = this.extractJson(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      this.logger.error(`Failed to parse AI title JSON: ${raw}`);
      throw error;
    }

    const titles =
      parsed &&
      typeof parsed === 'object' &&
      'titles' in parsed &&
      parsed.titles &&
      typeof parsed.titles === 'object'
        ? (parsed.titles as Record<string, unknown>)
        : (parsed as Record<string, unknown>);

    const out: Partial<Record<ContentLanguage, string>> = {};
    for (const lang of targetLanguages) {
      const value = titles[lang];
      if (typeof value === 'string' && value.trim()) {
        out[lang] = value.trim();
      }
    }
    return out;
  }

  private extractJson(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) return trimmed;
    const match = trimmed.match(/\{[\s\S]*\}/);
    return match?.[0] ?? trimmed;
  }
}
