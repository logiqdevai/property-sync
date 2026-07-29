import { Injectable, Logger } from '@nestjs/common';
import {
  AiBatchRunKind,
  AiBatchRunStatus,
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

type PropertyContentRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  canonical_property_id: string;
};

export type ProduceForPropertiesResult = {
  readyIds: string[];
  pendingBatchIds: string[];
};

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
    options?: { forceSyncAi?: boolean; crawlRunId?: string | null },
  ): Promise<{ pendingBatch: boolean }> {
    const result = await this.produceForUserProperties([userPropertyId], {
      forceSyncAi: options?.forceSyncAi,
      crawlRunId: options?.crawlRunId,
    });
    return { pendingBatch: result.pendingBatchIds.includes(userPropertyId) };
  }

  async produceForUserProperties(
    userPropertyIds: string[],
    options?: {
      forceSyncAi?: boolean;
      crawlRunId?: string | null;
      changeTypesByPropertyId?: Record<string, string>;
    },
  ): Promise<ProduceForPropertiesResult> {
    const uniqueIds = [...new Set(userPropertyIds.filter(Boolean))];
    if (!uniqueIds.length) {
      return { readyIds: [], pendingBatchIds: [] };
    }

    const forceSyncAi = options?.forceSyncAi ?? false;
    const pendingBatchIds = new Set<string>();
    const processedIds = new Set<string>();

    const properties = await this.prisma.userProperty.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        user_id: true,
        title: true,
        description: true,
        canonical_property_id: true,
      },
    });
    const propertyById = new Map(properties.map((p) => [p.id, p]));

    const groups = await this.groupByTrackerConfig(properties);

    for (const group of groups) {
      if (!group.config?.is_enabled) {
        for (const property of group.properties) {
          processedIds.add(property.id);
        }
        continue;
      }

      await Promise.all(
        group.properties.map((property) =>
          this.produceTranslations(
            property,
            group.contentLanguage,
            group.config!,
          ),
        ),
      );

      if (!group.config.ai_titles_enabled) {
        for (const property of group.properties) {
          processedIds.add(property.id);
        }
        continue;
      }

      const families = group.config.ai_title_families.filter((f) => f.is_enabled);
      const pendingForGroup = new Set<string>();

      for (const family of families) {
        const targetLanguages = group.config.outputs
          .filter(
            (o) =>
              o.title_strategy === TitleProductionStrategy.AI &&
              o.ai_title_family_id === family.id,
          )
          .map((o) => o.language);

        if (!targetLanguages.length) continue;

        const needingWork: PropertyContentRow[] = [];
        for (const property of group.properties) {
          const needs = await this.needsAiWork(property.id, targetLanguages);
          if (needs) needingWork.push(property);
        }
        if (!needingWork.length) continue;

        const useBatch =
          !forceSyncAi && (family.use_batch ?? group.config.use_ai_batch);

        if (useBatch) {
          const apiKey = await this.resolveOpenAiApiKey(group.userId);
          if (!apiKey) {
            this.logger.warn(
              `No OpenAI key for user ${group.userId}; falling back to sync AI titles`,
            );
          } else {
            const changeTypes: Record<string, string> = {};
            for (const property of needingWork) {
              const change =
                options?.changeTypesByPropertyId?.[property.id] ?? 'UPDATE';
              changeTypes[property.id] = change;
            }
            await this.aiTitleBatchService.submitFamilyBatch({
              configId: group.config.id,
              familyId: family.id,
              familyName: family.name,
              instructions: family.instructions,
              model: family.model,
              sourceLanguage: group.contentLanguage,
              targetLanguages,
              apiKey,
              crawlRunId: options?.crawlRunId ?? null,
              changeTypesByPropertyId: changeTypes,
              items: needingWork.map((property) => ({
                userPropertyId: property.id,
                title: property.title,
                description: property.description,
              })),
            });
            for (const property of needingWork) {
              pendingForGroup.add(property.id);
              pendingBatchIds.add(property.id);
            }
            continue;
          }
        }

        try {
          const apiKey = await this.resolveOpenAiApiKey(group.userId);
          const titlesByProperty =
            await this.aiTitleFamilyService.generateTitlesForProperties({
              sourceLanguage: group.contentLanguage,
              targetLanguages,
              instructions: family.instructions,
              model: family.model,
              apiKey: apiKey ?? undefined,
              items: needingWork.map((property) => ({
                userPropertyId: property.id,
                title: property.title,
                description: property.description,
              })),
            });

          for (const property of needingWork) {
            const titles = titlesByProperty.get(property.id) ?? {};
            for (const [language, text] of Object.entries(titles)) {
              if (!text) continue;
              await this.upsertLocalized({
                userPropertyId: property.id,
                contentType: ContentType.TITLE,
                language: language as ContentLanguage,
                production: 'AI',
                text,
              });
            }
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `AI title generation failed for family ${family.name}: ${message}`,
          );
        }
      }

      for (const property of group.properties) {
        processedIds.add(property.id);
        if (pendingForGroup.has(property.id)) {
          pendingBatchIds.add(property.id);
        }
      }
    }

    for (const id of uniqueIds) {
      if (!propertyById.has(id)) continue;
      processedIds.add(id);
    }

    const readyIds = [...processedIds].filter((id) => !pendingBatchIds.has(id));
    return {
      readyIds,
      pendingBatchIds: [...pendingBatchIds],
    };
  }

  async getReadyPropertyIdsAfterTitleBatch(
    batchId: string,
  ): Promise<{
    crawlRunId: string | null;
    readyIds: string[];
    changeTypesByPropertyId: Record<string, string>;
  }> {
    const run = await this.prisma.aiBatchRun.findUnique({
      where: { openai_batch_id: batchId },
    });
    if (!run || run.kind !== AiBatchRunKind.TITLE_FAMILY) {
      return { crawlRunId: null, readyIds: [], changeTypesByPropertyId: {} };
    }

    const propertyIds = Array.isArray(run.user_property_ids)
      ? (run.user_property_ids as string[])
      : [];
    const meta = (run.metadata ?? {}) as {
      change_types_by_property_id?: Record<string, string>;
    };
    const changeTypesByPropertyId = meta.change_types_by_property_id ?? {};

    if (!propertyIds.length) {
      return {
        crawlRunId: run.crawl_run_id,
        readyIds: [],
        changeTypesByPropertyId,
      };
    }

    const openRuns = await this.prisma.aiBatchRun.findMany({
      where: {
        kind: AiBatchRunKind.TITLE_FAMILY,
        status: {
          in: [AiBatchRunStatus.SUBMITTED, AiBatchRunStatus.IN_PROGRESS],
        },
        id: { not: run.id },
        ...(run.crawl_run_id
          ? { crawl_run_id: run.crawl_run_id }
          : {}),
      },
      select: {
        user_property_ids: true,
        crawl_run_id: true,
      },
    });

    const blocked = new Set<string>();
    for (const open of openRuns) {
      if (!run.crawl_run_id && open.crawl_run_id) continue;
      const ids = Array.isArray(open.user_property_ids)
        ? (open.user_property_ids as string[])
        : [];
      for (const id of ids) {
        if (propertyIds.includes(id)) blocked.add(id);
      }
    }

    return {
      crawlRunId: run.crawl_run_id,
      readyIds: propertyIds.filter((id) => !blocked.has(id)),
      changeTypesByPropertyId,
    };
  }

  private async groupByTrackerConfig(properties: PropertyContentRow[]) {
    type Group = {
      userId: string;
      contentLanguage: ContentLanguage;
      config: ContentPublishingConfigWithRelations | null;
      properties: PropertyContentRow[];
    };

    const groups = new Map<string, Group>();

    for (const property of properties) {
      const context = await this.resolveContextForProperty(property);
      const key = context
        ? `${context.trackerId}:${context.config?.id ?? 'none'}`
        : `none:${property.id}`;

      const existing = groups.get(key);
      if (existing) {
        existing.properties.push(property);
        continue;
      }

      groups.set(key, {
        userId: property.user_id,
        contentLanguage: context?.contentLanguage ?? ContentLanguage.EL,
        config: context?.config ?? null,
        properties: [property],
      });
    }

    return [...groups.values()];
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

  private async resolveContextForProperty(userProperty: PropertyContentRow) {
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
      trackerId: tracker.id,
      contentLanguage: tracker.source_agency.content_language,
      config: tracker.content_publishing_config,
    };
  }
}
