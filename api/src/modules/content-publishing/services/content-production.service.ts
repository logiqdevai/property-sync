import { Injectable, Logger } from '@nestjs/common';
import {
  ContentLanguage,
  ContentType,
  DescriptionProductionStrategy,
  IntegrationType,
  TitleProductionStrategy,
} from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { ContentPublishingConfigWithRelations } from '../interfaces/content-publishing.interface';
import { GoogleTranslationService } from './google-translation.service';
import { AiTitleFamilyService } from './ai-title-family.service';
import { AiTitleBatchService } from './ai-title-batch.service';

@Injectable()
export class ContentProductionService {
  private readonly logger = new Logger(ContentProductionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleTranslationService: GoogleTranslationService,
    private readonly aiTitleFamilyService: AiTitleFamilyService,
    private readonly aiTitleBatchService: AiTitleBatchService,
  ) {}

  async markStale(userPropertyId: string): Promise<void> {
    await this.prisma.propertyLocalizedContent.updateMany({
      where: { user_property_id: userPropertyId },
      data: { is_stale: true },
    });
  }

  async ensureReady(userPropertyId: string): Promise<void> {
    await this.produceForProperty(userPropertyId, { forceSyncAi: true });
  }

  async produceForProperty(
    userPropertyId: string,
    options?: { forceSyncAi?: boolean },
  ): Promise<{ pendingBatch: boolean }> {
    const context = await this.resolveContext(userPropertyId);
    if (!context?.config?.is_enabled) {
      return { pendingBatch: false };
    }

    const { userProperty, contentLanguage, config } = context;
    let pendingBatch = false;

    await this.produceTranslations(userProperty, contentLanguage, config);
    pendingBatch = await this.produceAiTitles(
      userProperty,
      contentLanguage,
      config,
      options?.forceSyncAi ?? false,
    );

    return { pendingBatch };
  }

  private async produceTranslations(
    userProperty: { id: string; title: string; description: string | null },
    contentLanguage: ContentLanguage,
    config: ContentPublishingConfigWithRelations,
  ): Promise<void> {
    const jobs: Array<{
      contentType: ContentType;
      language: ContentLanguage;
      sourceText: string;
    }> = [];

    for (const output of config.outputs) {
      if (
        output.title_strategy === TitleProductionStrategy.TRANSLATE &&
        output.language !== contentLanguage &&
        userProperty.title
      ) {
        jobs.push({
          contentType: ContentType.TITLE,
          language: output.language,
          sourceText: userProperty.title,
        });
      }
      if (
        output.description_strategy ===
          DescriptionProductionStrategy.TRANSLATE &&
        output.language !== contentLanguage &&
        userProperty.description
      ) {
        jobs.push({
          contentType: ContentType.DESCRIPTION,
          language: output.language,
          sourceText: userProperty.description,
        });
      }
    }

    for (const job of jobs) {
      const existing = await this.prisma.propertyLocalizedContent.findUnique({
        where: {
          user_property_id_content_type_language: {
            user_property_id: userProperty.id,
            content_type: job.contentType,
            language: job.language,
          },
        },
      });
      if (existing && !existing.is_stale) continue;

      try {
        const text = await this.googleTranslationService.translate(
          job.sourceText,
          contentLanguage,
          job.language,
        );
        await this.upsertLocalized({
          userPropertyId: userProperty.id,
          contentType: job.contentType,
          language: job.language,
          production: 'TRANSLATE',
          text,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Translate failed for ${userProperty.id} ${job.contentType}/${job.language}: ${message}`,
        );
      }
    }
  }

  private async produceAiTitles(
    userProperty: {
      id: string;
      user_id: string;
      title: string;
      description: string | null;
    },
    contentLanguage: ContentLanguage,
    config: ContentPublishingConfigWithRelations,
    forceSyncAi: boolean,
  ): Promise<boolean> {
    if (!config.ai_titles_enabled) return false;

    let pendingBatch = false;
    const families = config.ai_title_families.filter((f) => f.is_enabled);

    for (const family of families) {
      const targetLanguages = config.outputs
        .filter(
          (o) =>
            o.title_strategy === TitleProductionStrategy.AI &&
            o.ai_title_family_id === family.id,
        )
        .map((o) => o.language);

      if (!targetLanguages.length) continue;

      const needsWork = await this.needsAiWork(
        userProperty.id,
        targetLanguages,
      );
      if (!needsWork) continue;

      const useBatch =
        !forceSyncAi && (family.use_batch ?? config.use_ai_batch);

      if (useBatch) {
        const apiKey = await this.resolveOpenAiApiKey(userProperty.user_id);
        if (!apiKey) {
          this.logger.warn(
            `No OpenAI key for user ${userProperty.user_id}; falling back to sync AI titles`,
          );
        } else {
          await this.aiTitleBatchService.submitFamilyBatch({
            configId: config.id,
            familyId: family.id,
            familyName: family.name,
            instructions: family.instructions,
            model: family.model,
            sourceLanguage: contentLanguage,
            targetLanguages,
            apiKey,
            items: [
              {
                userPropertyId: userProperty.id,
                title: userProperty.title,
                description: userProperty.description,
              },
            ],
          });
          pendingBatch = true;
          continue;
        }
      }

      try {
        const apiKey = await this.resolveOpenAiApiKey(userProperty.user_id);
        const titles = await this.aiTitleFamilyService.generateTitles({
          sourceLanguage: contentLanguage,
          targetLanguages,
          title: userProperty.title,
          description: userProperty.description,
          instructions: family.instructions,
          model: family.model,
          apiKey: apiKey ?? undefined,
        });
        for (const [language, text] of Object.entries(titles)) {
          if (!text) continue;
          await this.upsertLocalized({
            userPropertyId: userProperty.id,
            contentType: ContentType.TITLE,
            language: language as ContentLanguage,
            production: 'AI',
            text,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `AI title generation failed for ${userProperty.id} family ${family.name}: ${message}`,
        );
      }
    }

    return pendingBatch;
  }

  private async needsAiWork(
    userPropertyId: string,
    languages: ContentLanguage[],
  ): Promise<boolean> {
    const existing = await this.prisma.propertyLocalizedContent.findMany({
      where: {
        user_property_id: userPropertyId,
        content_type: ContentType.TITLE,
        language: { in: languages },
      },
    });
    const byLang = new Map(existing.map((e) => [e.language, e]));
    return languages.some((lang) => {
      const row = byLang.get(lang);
      return !row || row.is_stale || !row.text?.trim();
    });
  }

  private async upsertLocalized(input: {
    userPropertyId: string;
    contentType: ContentType;
    language: ContentLanguage;
    production: string;
    text: string;
  }): Promise<void> {
    await this.prisma.propertyLocalizedContent.upsert({
      where: {
        user_property_id_content_type_language: {
          user_property_id: input.userPropertyId,
          content_type: input.contentType,
          language: input.language,
        },
      },
      create: {
        user_property_id: input.userPropertyId,
        content_type: input.contentType,
        language: input.language,
        production: input.production,
        text: input.text,
        is_stale: false,
      },
      update: {
        production: input.production,
        text: input.text,
        is_stale: false,
      },
    });
  }

  private async resolveOpenAiApiKey(userId: string): Promise<string | null> {
    const integration = await this.prisma.userIntegration.findFirst({
      where: {
        user_id: userId,
        is_active: true,
        integration_target: { integration_type: IntegrationType.OPENAI },
      },
      orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
    });
    return integration?.api_key_secret ?? null;
  }

  private async resolveContext(userPropertyId: string) {
    const userProperty = await this.prisma.userProperty.findUnique({
      where: { id: userPropertyId },
      select: {
        id: true,
        user_id: true,
        title: true,
        description: true,
        canonical_property_id: true,
      },
    });
    if (!userProperty) return null;

    const canonical = await this.prisma.property.findUnique({
      where: { id: userProperty.canonical_property_id },
      include: {
        source_links: {
          orderBy: [{ is_primary_source: 'desc' }, { created_at: 'asc' }],
          include: {
            source_property: {
              select: { source_agency_id: true },
            },
          },
          take: 1,
        },
      },
    });

    const sourceAgencyId =
      canonical?.source_links[0]?.source_property.source_agency_id;
    if (!sourceAgencyId) return null;

    const tracker = await this.prisma.userTrackedAgency.findUnique({
      where: {
        user_id_source_agency_id: {
          user_id: userProperty.user_id,
          source_agency_id: sourceAgencyId,
        },
      },
      include: {
        source_agency: { select: { content_language: true } },
        content_publishing_config: {
          include: {
            outputs: { include: { ai_title_family: true } },
            ai_title_families: true,
          },
        },
      },
    });

    if (!tracker) return null;

    return {
      userProperty,
      contentLanguage: tracker.source_agency.content_language,
      config: tracker.content_publishing_config,
    };
  }
}
