import { Injectable, Logger } from '@nestjs/common';
import { ContentLanguage } from 'generated/prisma';
import { AiService } from '@/integrations/ai/services/ai.service';
import { AiDefaults } from '@/integrations/ai/utils/ai.config';
import {
  AI_TITLE_MULTI_PROPERTY_CHUNK_SIZE,
  AI_TITLE_MULTI_PROPERTY_SYSTEM_PROMPT,
  AI_TITLE_SYSTEM_PROMPT,
  buildAiTitleMultiPropertyUserPrompt,
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

  async generateTitlesForProperties(input: {
    sourceLanguage: ContentLanguage;
    targetLanguages: ContentLanguage[];
    items: Array<{
      userPropertyId: string;
      title: string;
      description: string | null;
    }>;
    instructions?: string | null;
    model?: string | null;
    apiKey?: string;
    chunkSize?: number;
  }): Promise<
    Map<string, Partial<Record<ContentLanguage, string>>>
  > {
    const out = new Map<string, Partial<Record<ContentLanguage, string>>>();
    if (!input.targetLanguages.length || !input.items.length) return out;

    const chunkSize = Math.max(
      1,
      input.chunkSize ?? AI_TITLE_MULTI_PROPERTY_CHUNK_SIZE,
    );

    for (let i = 0; i < input.items.length; i += chunkSize) {
      const chunk = input.items.slice(i, i + chunkSize);
      const prompt = buildAiTitleMultiPropertyUserPrompt({
        sourceLanguage: input.sourceLanguage,
        targetLanguages: input.targetLanguages,
        items: chunk,
        familyInstructions: input.instructions,
      });

      const maxTokens = Math.min(8000, 400 + chunk.length * 350);
      this.logger.log(
        `[generateTitlesForProperties] chunk=${i / chunkSize + 1} size=${chunk.length} langs=${input.targetLanguages.join(',')} maxTokens=${maxTokens} model=${input.model || AiDefaults.model} hasApiKey=${Boolean(input.apiKey)}`,
      );
      const result = await this.aiService.generateText({
        provider: 'openai',
        model: input.model || AiDefaults.model,
        apiKey: input.apiKey,
        system: AI_TITLE_MULTI_PROPERTY_SYSTEM_PROMPT,
        prompt,
        temperature: 0.4,
        maxTokens,
      });

      this.logger.log(
        `[generateTitlesForProperties] chunk response chars=${result.response?.length ?? 0}`,
      );

      const parsed = this.parseMultiPropertyTitlesResponse(
        result.response,
        input.targetLanguages,
        chunk.map((item) => item.userPropertyId),
      );
      this.logger.log(
        `[generateTitlesForProperties] parsed properties=${parsed.size} expected=${chunk.length}`,
      );
      for (const [propertyId, titles] of parsed) {
        out.set(propertyId, titles);
      }
    }

    return out;
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

    return this.pickLanguageTitles(titles, targetLanguages);
  }

  parseMultiPropertyTitlesResponse(
    raw: string,
    targetLanguages: ContentLanguage[],
    expectedPropertyIds: string[],
  ): Map<string, Partial<Record<ContentLanguage, string>>> {
    const jsonText = this.extractJson(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      this.logger.error(`Failed to parse multi-property AI title JSON: ${raw}`);
      throw error;
    }

    const properties =
      parsed &&
      typeof parsed === 'object' &&
      'properties' in parsed &&
      parsed.properties &&
      typeof parsed.properties === 'object'
        ? (parsed.properties as Record<string, unknown>)
        : (parsed as Record<string, unknown>);

    const out = new Map<string, Partial<Record<ContentLanguage, string>>>();
    const expected = new Set(expectedPropertyIds);

    for (const [propertyId, value] of Object.entries(properties)) {
      if (!expected.has(propertyId)) continue;
      if (!value || typeof value !== 'object') continue;
      out.set(
        propertyId,
        this.pickLanguageTitles(
          value as Record<string, unknown>,
          targetLanguages,
        ),
      );
    }

    return out;
  }

  private pickLanguageTitles(
    titles: Record<string, unknown>,
    targetLanguages: ContentLanguage[],
  ): Partial<Record<ContentLanguage, string>> {
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
