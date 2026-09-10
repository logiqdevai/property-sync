import { Injectable, Logger } from '@nestjs/common';
import {
  ContentLanguage,
  CostOperationType,
  IntegrationType,
} from 'generated/prisma';
import { AiService } from '@/integrations/ai/services/ai.service';
import { AiDefaults } from '@/integrations/ai/utils/ai.config';
import { CostLogsService } from '@/modules/cost-logs/cost-logs.service';
import {
  AI_TITLE_MULTI_PROPERTY_CHUNK_SIZE,
  AI_TITLE_MULTI_PROPERTY_SYSTEM_PROMPT,
  AI_TITLE_SYSTEM_PROMPT,
  AiTitlePropertyFacts,
  buildAiTitleMultiPropertyUserPrompt,
  buildAiTitleUserPrompt,
  ensureTitlesIncludeSquareMeters,
  titleIncludesSquareMeters,
} from '../constants/ai-title-prompt';

@Injectable()
export class AiTitleFamilyService {
  private readonly logger = new Logger(AiTitleFamilyService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly costLogsService: CostLogsService,
  ) {}

  async generateTitles(input: {
    sourceLanguage: ContentLanguage;
    targetLanguages: ContentLanguage[];
    writingLanguage: ContentLanguage;
    title: string;
    description?: string | null;
    facts: AiTitlePropertyFacts;
    instructions?: string | null;
    model?: string | null;
    apiKey?: string;
    userId?: string | null;
    userPropertyId?: string | null;
  }): Promise<Partial<Record<ContentLanguage, string>>> {
    if (!input.targetLanguages.length) return {};

    const prompt = buildAiTitleUserPrompt({
      sourceLanguage: input.sourceLanguage,
      targetLanguages: input.targetLanguages,
      writingLanguage: input.writingLanguage,
      title: input.title,
      description: input.description,
      facts: input.facts,
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

    await this.costLogsService.record({
      userId: input.userId,
      operationType: CostOperationType.TITLE_GENERATION,
      provider: IntegrationType.OPENAI,
      model: input.model || AiDefaults.model,
      inputQuantity: result.usage.inputTokens,
      outputQuantity: result.usage.outputTokens,
      inputCost: result.usage.inputCost,
      outputCost: result.usage.outputCost,
      totalCost: result.usage.totalCost,
      userPropertyId: input.userPropertyId,
    });

    const titles = this.parseTitlesResponse(
      result.response,
      input.targetLanguages,
    );
    return this.applySquareMetersGuard(
      titles,
      input.facts,
      input.writingLanguage,
    );
  }

  async generateTitlesForProperties(input: {
    sourceLanguage: ContentLanguage;
    targetLanguages: ContentLanguage[];
    writingLanguage: ContentLanguage;
    items: Array<{
      userPropertyId: string;
      title: string;
      description: string | null;
      facts: AiTitlePropertyFacts;
    }>;
    instructions?: string | null;
    model?: string | null;
    apiKey?: string;
    chunkSize?: number;
    userId?: string | null;
  }): Promise<Map<string, Partial<Record<ContentLanguage, string>>>> {
    const out = new Map<string, Partial<Record<ContentLanguage, string>>>();
    if (!input.targetLanguages.length || !input.items.length) return out;

    const factsByPropertyId = new Map(
      input.items.map((item) => [item.userPropertyId, item.facts]),
    );

    const chunkSize = Math.max(
      1,
      input.chunkSize ?? AI_TITLE_MULTI_PROPERTY_CHUNK_SIZE,
    );

    for (let i = 0; i < input.items.length; i += chunkSize) {
      const chunk = input.items.slice(i, i + chunkSize);
      const prompt = buildAiTitleMultiPropertyUserPrompt({
        sourceLanguage: input.sourceLanguage,
        targetLanguages: input.targetLanguages,
        writingLanguage: input.writingLanguage,
        items: chunk,
        familyInstructions: input.instructions,
      });

      const maxTokens = Math.min(8000, 400 + chunk.length * 350);
      this.logger.log(
        `[generateTitlesForProperties] chunk=${i / chunkSize + 1} size=${chunk.length} langs=${input.targetLanguages.join(',')} writing=${input.writingLanguage} maxTokens=${maxTokens} model=${input.model || AiDefaults.model} hasApiKey=${Boolean(input.apiKey)}`,
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

      await this.costLogsService.record({
        userId: input.userId,
        operationType: CostOperationType.TITLE_GENERATION,
        provider: IntegrationType.OPENAI,
        model: input.model || AiDefaults.model,
        inputQuantity: result.usage.inputTokens,
        outputQuantity: result.usage.outputTokens,
        inputCost: result.usage.inputCost,
        outputCost: result.usage.outputCost,
        totalCost: result.usage.totalCost,
        userPropertyId:
          chunk.length === 1 ? chunk[0].userPropertyId : undefined,
        metadata: {
          user_property_ids: chunk.map((item) => item.userPropertyId),
        },
      });

      const parsed = this.parseMultiPropertyTitlesResponse(
        result.response,
        input.targetLanguages,
        chunk.map((item) => item.userPropertyId),
      );
      this.logger.log(
        `[generateTitlesForProperties] parsed properties=${parsed.size} expected=${chunk.length}`,
      );
      for (const [propertyId, titles] of parsed) {
        const facts = factsByPropertyId.get(propertyId) ?? {};
        out.set(
          propertyId,
          this.applySquareMetersGuard(titles, facts, input.writingLanguage),
        );
      }
    }

    return out;
  }

  applySquareMetersGuard(
    titles: Partial<Record<ContentLanguage, string>>,
    facts: AiTitlePropertyFacts,
    writingLanguage: ContentLanguage,
  ): Partial<Record<ContentLanguage, string>> {
    const missing = Object.entries(titles).filter(
      ([, title]) =>
        Boolean(title) &&
        !titleIncludesSquareMeters(title!, facts.square_meters),
    );
    if (missing.length) {
      this.logger.warn(
        `[applySquareMetersGuard] injecting square_meters into langs=[${missing.map(([lang]) => lang).join(',')}] size=${facts.square_meters ?? 'n/a'}`,
      );
    }
    return ensureTitlesIncludeSquareMeters(titles, facts, writingLanguage);
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

    // Properties are matched by POSITION (the P<n> tag the prompt assigned,
    // e.g. "P1" -> expectedPropertyIds[0]), never by asking the model to
    // echo the real UUID back verbatim -- confirmed in production that a
    // model can silently drop/alter a character of a 36-char UUID when
    // copying it (one specific property id consistently came back missing
    // its last character, e.g. "...434a" -> "...434"), which made every
    // title for that property silently vanish since nothing matched by
    // exact string equality. A short "P<n>" tag is far less likely to get
    // mangled, and position-based lookup means it doesn't matter even if it
    // does.
    for (const [key, value] of Object.entries(properties)) {
      const match = key.match(/^P?(\d+)$/i);
      if (!match) continue;
      const index = Number(match[1]) - 1;
      const propertyId = expectedPropertyIds[index];
      if (!propertyId) continue;
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
    for (let i = 0; i < targetLanguages.length; i++) {
      const lang = targetLanguages[i];
      const numericKey = String(i + 1);
      const value = titles[numericKey] ?? titles[lang];
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
