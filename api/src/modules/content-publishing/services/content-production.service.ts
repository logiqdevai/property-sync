import { Injectable, Logger } from '@nestjs/common';
import {
  AiBatchRunKind,
  AiBatchRunStatus,
  ContentLanguage,
  ContentType,
  CostOperationType,
  DescriptionProductionStrategy,
  IntegrationType,
  JobStatus,
  ListingType,
  PropertyType,
  TitleProductionStrategy,
  TranslationProvider,
} from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CostLogsService } from '@/modules/cost-logs/cost-logs.service';
import { PlatformConfigService } from '@/modules/platform-config/platform-config.service';
import { ContentPublishingConfigWithRelations } from '../interfaces/content-publishing.interface';
import {
  AiTitlePropertyFacts,
} from '../constants/ai-title-prompt';
import { GoogleTranslationService } from './google-translation.service';
import { AzureTranslationService } from './azure-translation.service';
import { AiTitleFamilyService } from './ai-title-family.service';
import { AiTitleBatchService } from './ai-title-batch.service';

type PropertyContentRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  canonical_property_id: string;
  district: string | null;
  city: string | null;
  listing_type: ListingType;
  square_meters: { toString(): string } | null;
  property_type: PropertyType;
};

function toAiTitleFacts(property: PropertyContentRow): AiTitlePropertyFacts {
  return {
    district: property.district,
    city: property.city,
    listing_type: property.listing_type,
    square_meters: property.square_meters?.toString() ?? null,
    property_type: property.property_type,
  };
}

export type ProducePropertyFailure = {
  user_property_id: string;
  error: string;
};

export type ProduceForPropertiesResult = {
  readyIds: string[];
  pendingBatchIds: string[];
  failed: ProducePropertyFailure[];
  translationsWritten: number;
  titlesWritten: number;
};

@Injectable()
export class ContentProductionService {
  private readonly logger = new Logger(ContentProductionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleTranslationService: GoogleTranslationService,
    private readonly azureTranslationService: AzureTranslationService,
    private readonly aiTitleFamilyService: AiTitleFamilyService,
    private readonly aiTitleBatchService: AiTitleBatchService,
    private readonly costLogsService: CostLogsService,
    private readonly platformConfigService: PlatformConfigService,
  ) {}

  async markStale(userPropertyId: string): Promise<void> {
    const result = await this.prisma.propertyLocalizedContent.updateMany({
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
      forceBatchAi?: boolean;
      crawlRunId?: string | null;
      changeTypesByPropertyId?: Record<string, string>;
      runTranslations?: boolean;
      runAiTitles?: boolean;
      markStaleFirst?: boolean;
    },
  ): Promise<ProduceForPropertiesResult> {
    const uniqueIds = [...new Set(userPropertyIds.filter(Boolean))];
    const empty: ProduceForPropertiesResult = {
      readyIds: [],
      pendingBatchIds: [],
      failed: [],
      translationsWritten: 0,
      titlesWritten: 0,
    };
    if (!uniqueIds.length) {
      this.logger.warn('[produceForUserProperties] no ids provided');
      return empty;
    }

    const forceSyncAi = options?.forceSyncAi ?? false;
    const forceBatchAi = options?.forceBatchAi ?? false;
    const runTranslations = options?.runTranslations ?? true;
    const runAiTitles = options?.runAiTitles ?? true;
    const pendingBatchIds = new Set<string>();
    const readyIds = new Set<string>();
    const failedMap = new Map<string, string>();
    let translationsWritten = 0;
    let titlesWritten = 0;


    if (options?.markStaleFirst) {
      await this.prisma.propertyLocalizedContent.updateMany({
        where: { user_property_id: { in: uniqueIds } },
        data: { is_stale: true },
      });
    }

    const properties = await this.prisma.userProperty.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        user_id: true,
        title: true,
        description: true,
        canonical_property_id: true,
        district: true,
        city: true,
        listing_type: true,
        square_meters: true,
        property_type: true,
      },
    });

    const propertyById = new Map(properties.map((p) => [p.id, p]));
    for (const id of uniqueIds) {
      if (!propertyById.has(id)) {
        failedMap.set(id, 'Property not found in database');
        this.logger.warn(
          `[produceForUserProperties] missing property id=${id}`,
        );
      }
    }

    const groups = await this.groupByTrackerConfig(properties);

    for (const group of groups) {
      if (!group.config) {
        for (const property of group.properties) {
          const error =
            group.resolveReason ||
            'No content publishing config for this property agency';
          failedMap.set(property.id, error);
          this.logger.warn(
            `[produceForUserProperties] skip/fail property=${property.id}: ${error}`,
          );
        }
        continue;
      }

      if (!group.config.is_enabled) {
        for (const property of group.properties) {
          const error = 'Content publishing config is disabled';
          failedMap.set(property.id, error);
          this.logger.warn(
            `[produceForUserProperties] skip/fail property=${property.id}: ${error}`,
          );
        }
        continue;
      }

      const titlesByProperty = new Map<string, number>();
      const translationsByProperty = new Map<string, number>();

      if (runTranslations) {
        const translationProvider =
          await this.platformConfigService.getTranslationProvider();
        for (const property of group.properties) {
          const written = await this.produceTranslations(
            property,
            group.contentLanguage,
            group.config,
            group.userId,
            translationProvider,
          );
          translationsWritten += written;
          translationsByProperty.set(property.id, written);
        }
      }

      if (!runAiTitles) {
        for (const property of group.properties) {
          readyIds.add(property.id);
        }
        continue;
      }

      if (!group.config.ai_titles_enabled) {
        for (const property of group.properties) {
          readyIds.add(property.id);
        }
        continue;
      }

      const families = group.config.ai_title_families.filter((f) => f.is_enabled);

      if (!families.length) {
        for (const property of group.properties) {
          const error =
            'AI titles enabled but no enabled AI title families configured';
          failedMap.set(property.id, error);
          this.logger.warn(
            `[produceForUserProperties] fail property=${property.id}: ${error}`,
          );
        }
        continue;
      }

      const linkedAiOutputs = group.config.outputs.filter(
        (o) => o.title_strategy === TitleProductionStrategy.AI,
      );
      const coveredLanguages = new Set(
        families.flatMap((family) =>
          group.config!.outputs
            .filter(
              (o) =>
                o.title_strategy === TitleProductionStrategy.AI &&
                o.ai_title_family_id === family.id,
            )
            .map((o) => o.language),
        ),
      );
      const uncoveredAiOutputs = linkedAiOutputs.filter(
        (o) => !coveredLanguages.has(o.language),
      );
      if (!linkedAiOutputs.length) {
        for (const property of group.properties) {
          const error =
            'AI titles enabled but no output slots use title_strategy=AI';
          failedMap.set(property.id, error);
          this.logger.warn(
            `[produceForUserProperties] fail property=${property.id}: ${error}`,
          );
        }
        continue;
      }
      if (uncoveredAiOutputs.length) {
        this.logger.warn(
          `[produceForUserProperties] AI output slots missing family link: ${uncoveredAiOutputs.map((o) => o.language).join(',')}`,
        );
      }
      if (coveredLanguages.size === 0) {
        for (const property of group.properties) {
          const error =
            'AI title output slots are not linked to any enabled AI title family (ai_title_family_id)';
          failedMap.set(property.id, error);
          this.logger.warn(
            `[produceForUserProperties] fail property=${property.id}: ${error}`,
          );
        }
        continue;
      }

      const pendingForGroup = new Set<string>();
      const aiFailedForGroup = new Map<string, string>();
      const aiNeededAny = new Map<string, boolean>();

      for (const family of families) {
        const targetLanguages = group.config.outputs
          .filter(
            (o) =>
              o.title_strategy === TitleProductionStrategy.AI &&
              o.ai_title_family_id === family.id,
          )
          .map((o) => o.language);


        if (!targetLanguages.length) {
          this.logger.warn(
            `[produceForUserProperties] family="${family.name}" has no AI title output slots linked; skipping family`,
          );
          continue;
        }

        const writingLanguage =
          family.writing_language ?? group.contentLanguage;

        const needingWork: PropertyContentRow[] = [];
        for (const property of group.properties) {
          const needs = await this.needsAiWork(property.id, targetLanguages);
          aiNeededAny.set(
            property.id,
            (aiNeededAny.get(property.id) ?? false) || needs,
          );
          if (needs) needingWork.push(property);
        }

        if (!needingWork.length) {
          continue;
        }

        const useBatch = forceBatchAi
          ? true
          : forceSyncAi
            ? false
            : (family.use_batch ?? group.config.use_ai_batch);


        if (useBatch) {
          const apiKey = await this.resolveOpenAiApiKey(group.userId);
          if (!apiKey) {
            this.logger.warn(
              `[produceForUserProperties] no OpenAI key for user=${group.userId}; falling back to sync for family="${family.name}"`,
            );
          } else {
            const changeTypes: Record<string, string> = {};
            for (const property of needingWork) {
              changeTypes[property.id] =
                options?.changeTypesByPropertyId?.[property.id] ?? 'UPDATE';
            }
            await this.aiTitleBatchService.submitFamilyBatch({
              configId: group.config.id,
              familyId: family.id,
              familyName: family.name,
              instructions: family.instructions,
              model: family.model,
              sourceLanguage: group.contentLanguage,
              writingLanguage,
              targetLanguages,
              apiKey,
              userId: group.userId,
              crawlRunId: options?.crawlRunId ?? null,
              changeTypesByPropertyId: changeTypes,
              items: needingWork.map((property) => ({
                userPropertyId: property.id,
                title: property.title,
                description: property.description,
                facts: toAiTitleFacts(property),
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
          const generated =
            await this.aiTitleFamilyService.generateTitlesForProperties({
              sourceLanguage: group.contentLanguage,
              writingLanguage,
              targetLanguages,
              instructions: family.instructions,
              model: family.model,
              apiKey: apiKey ?? undefined,
              userId: group.userId,
              items: needingWork.map((property) => ({
                userPropertyId: property.id,
                title: property.title,
                description: property.description,
                facts: toAiTitleFacts(property),
              })),
            });


          for (const property of needingWork) {
            const titles = generated.get(property.id) ?? {};
            const langs = Object.entries(titles).filter(
              ([, text]) => Boolean(text?.trim()),
            );

            if (!langs.length) {
              aiFailedForGroup.set(
                property.id,
                `AI returned no titles for family "${family.name}"`,
              );
              continue;
            }

            for (const [language, text] of langs) {
              await this.upsertLocalized({
                userPropertyId: property.id,
                contentType: ContentType.TITLE,
                language: language as ContentLanguage,
                production: 'AI',
                text: text!,
              });
              titlesWritten += 1;
              titlesByProperty.set(
                property.id,
                (titlesByProperty.get(property.id) ?? 0) + 1,
              );
            }
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `[produceForUserProperties] AI title generation failed family="${family.name}": ${message}`,
            error instanceof Error ? error.stack : undefined,
          );
          for (const property of needingWork) {
            aiFailedForGroup.set(
              property.id,
              `AI title generation failed for family "${family.name}": ${message}`,
            );
          }
        }
      }

      for (const property of group.properties) {
        if (pendingForGroup.has(property.id)) {
          pendingBatchIds.add(property.id);
          continue;
        }

        const aiError = aiFailedForGroup.get(property.id);
        if (aiError) {
          failedMap.set(property.id, aiError);
          this.logger.warn(
            `[produceForUserProperties] property=${property.id} status=failed error=${aiError}`,
          );
          continue;
        }

        const neededAi = aiNeededAny.get(property.id) ?? false;
        const writtenTitles = titlesByProperty.get(property.id) ?? 0;
        if (neededAi && writtenTitles === 0) {
          const error =
            'AI titles were required but none were written (check OpenAI key, family→output links, and model response)';
          failedMap.set(property.id, error);
          this.logger.warn(
            `[produceForUserProperties] property=${property.id} status=failed error=${error}`,
          );
          continue;
        }

        readyIds.add(property.id);
      }
    }

    for (const id of pendingBatchIds) {
      readyIds.delete(id);
      failedMap.delete(id);
    }
    for (const id of failedMap.keys()) {
      readyIds.delete(id);
    }

    const result: ProduceForPropertiesResult = {
      readyIds: [...readyIds],
      pendingBatchIds: [...pendingBatchIds],
      failed: [...failedMap.entries()].map(([user_property_id, error]) => ({
        user_property_id,
        error,
      })),
      translationsWritten,
      titlesWritten,
    };

    if (result.failed.length) {
      this.logger.warn(
        `[produceForUserProperties] failures=${JSON.stringify(result.failed)}`,
      );
    }

    return result;
  }

  async getReadyPropertyIdsAfterTitleBatch(batchId: string): Promise<{
    crawlRunId: string | null;
    readyIds: string[];
    changeTypesByPropertyId: Record<string, string>;
  }> {
    const run = await this.prisma.aiBatchRun.findUnique({
      where: { openai_batch_id: batchId },
    });
    if (!run || run.kind !== AiBatchRunKind.TITLE_FAMILY) {
      this.logger.warn(
        `[getReadyPropertyIdsAfterTitleBatch] run missing or wrong kind batchId=${batchId}`,
      );
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

    await this.healStuckTitleBatchesForProperties(
      propertyIds,
      run.crawl_run_id,
    );

    const openRuns = await this.prisma.aiBatchRun.findMany({
      where: {
        kind: AiBatchRunKind.TITLE_FAMILY,
        status: {
          in: [AiBatchRunStatus.SUBMITTED, AiBatchRunStatus.IN_PROGRESS],
        },
        id: { not: run.id },
        ...(run.crawl_run_id ? { crawl_run_id: run.crawl_run_id } : {}),
      },
      select: {
        id: true,
        user_property_ids: true,
        crawl_run_id: true,
        metadata: true,
      },
    });

    const blocked = new Set<string>();
    for (const open of openRuns) {
      if (!run.crawl_run_id && open.crawl_run_id) continue;
      const ids = Array.isArray(open.user_property_ids)
        ? (open.user_property_ids as string[])
        : [];
      const overlap = ids.filter((id) => propertyIds.includes(id));
      if (!overlap.length) continue;

      const openMeta = (open.metadata ?? {}) as {
        target_languages?: ContentLanguage[];
      };
      const targetLanguages = openMeta.target_languages ?? [];
      if (!targetLanguages.length) {
        for (const id of overlap) blocked.add(id);
        continue;
      }

      const titles = await this.prisma.propertyLocalizedContent.findMany({
        where: {
          user_property_id: { in: overlap },
          content_type: ContentType.TITLE,
          language: { in: targetLanguages },
          is_stale: false,
        },
        select: { user_property_id: true, language: true },
      });
      const byProperty = new Map<string, Set<string>>();
      for (const row of titles) {
        const set = byProperty.get(row.user_property_id) ?? new Set();
        set.add(row.language);
        byProperty.set(row.user_property_id, set);
      }

      for (const id of overlap) {
        const langs = byProperty.get(id);
        const covered =
          !!langs && targetLanguages.every((lang) => langs.has(lang));
        if (!covered) blocked.add(id);
      }
    }

    const readyIds = propertyIds.filter((id) => !blocked.has(id));

    return {
      crawlRunId: run.crawl_run_id,
      readyIds,
      changeTypesByPropertyId,
    };
  }

  private async healStuckTitleBatchesForProperties(
    propertyIds: string[],
    crawlRunId: string | null,
  ): Promise<void> {
    if (!propertyIds.length) return;

    const openRuns = await this.prisma.aiBatchRun.findMany({
      where: {
        kind: AiBatchRunKind.TITLE_FAMILY,
        status: {
          in: [AiBatchRunStatus.SUBMITTED, AiBatchRunStatus.IN_PROGRESS],
        },
        ...(crawlRunId ? { crawl_run_id: crawlRunId } : {}),
      },
      select: {
        id: true,
        openai_batch_id: true,
        user_property_ids: true,
        metadata: true,
        crawl_run_id: true,
      },
    });

    for (const open of openRuns) {
      if (!crawlRunId && open.crawl_run_id) continue;
      const ids = Array.isArray(open.user_property_ids)
        ? (open.user_property_ids as string[])
        : [];
      if (!ids.some((id) => propertyIds.includes(id))) continue;

      const meta = (open.metadata ?? {}) as {
        target_languages?: ContentLanguage[];
      };
      const targetLanguages = meta.target_languages ?? [];
      if (!targetLanguages.length || !ids.length) continue;

      const titles = await this.prisma.propertyLocalizedContent.findMany({
        where: {
          user_property_id: { in: ids },
          content_type: ContentType.TITLE,
          language: { in: targetLanguages },
          is_stale: false,
        },
        select: { user_property_id: true, language: true },
      });

      const byProperty = new Map<string, Set<string>>();
      for (const row of titles) {
        const set = byProperty.get(row.user_property_id) ?? new Set();
        set.add(row.language);
        byProperty.set(row.user_property_id, set);
      }

      const allCovered = ids.every((id) => {
        const langs = byProperty.get(id);
        return (
          !!langs && targetLanguages.every((lang) => langs.has(lang))
        );
      });
      if (!allCovered) continue;

      await this.prisma.aiBatchRun.update({
        where: { id: open.id },
        data: {
          status: AiBatchRunStatus.COMPLETED,
          error_message: 'Auto-healed: target titles already present',
        },
      });
      if (open.openai_batch_id) {
        await this.prisma.jobLog.updateMany({
          where: {
            queue_name: 'openai-batch',
            job_id: open.openai_batch_id,
          },
          data: { status: JobStatus.COMPLETED },
        });
      }
      this.logger.warn(
        `[healStuckTitleBatches] marked AiBatchRun ${open.id} COMPLETED (titles present)`,
      );
    }
  }

  private async groupByTrackerConfig(properties: PropertyContentRow[]) {
    type Group = {
      userId: string;
      contentLanguage: ContentLanguage;
      config: ContentPublishingConfigWithRelations | null;
      properties: PropertyContentRow[];
      resolveReason: string;
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
        resolveReason: context?.resolveReason ?? 'Unknown resolve failure',
      });
    }

    return [...groups.values()];
  }

  private async produceTranslations(
    userProperty: { id: string; title: string; description: string | null },
    contentLanguage: ContentLanguage,
    config: ContentPublishingConfigWithRelations,
    userId: string,
    translationProvider: TranslationProvider,
  ): Promise<number> {
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
        userProperty.description
      ) {
        const descriptionLanguage =
          output.description_content_language ?? output.language;
        if (descriptionLanguage !== contentLanguage) {
          jobs.push({
            contentType: ContentType.DESCRIPTION,
            language: descriptionLanguage,
            sourceText: userProperty.description,
          });
        }
      }
    }

    const uniqueJobs = new Map<
      string,
      {
        contentType: ContentType;
        language: ContentLanguage;
        sourceText: string;
      }
    >();
    for (const job of jobs) {
      uniqueJobs.set(`${job.contentType}:${job.language}`, job);
    }
    const dedupedJobs = [...uniqueJobs.values()];


    let written = 0;
    for (const job of dedupedJobs) {
      const existing = await this.prisma.propertyLocalizedContent.findUnique({
        where: {
          user_property_id_content_type_language: {
            user_property_id: userProperty.id,
            content_type: job.contentType,
            language: job.language,
          },
        },
      });
      if (existing && !existing.is_stale && existing.text?.trim()) {
        continue;
      }

      try {
        const costProvider =
          this.platformConfigService.toCostLogProvider(translationProvider);
        const text =
          costProvider === IntegrationType.AZURE
            ? await this.azureTranslationService.translate(
                userId,
                job.sourceText,
                contentLanguage,
                job.language,
              )
            : await this.googleTranslationService.translate(
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
        const totalCost = await this.platformConfigService.getTranslateCost(
          costProvider,
          job.sourceText.length,
        );
        await this.costLogsService.record({
          userId,
          operationType: CostOperationType.TRANSLATION,
          provider: costProvider,
          inputQuantity: job.sourceText.length,
          totalCost,
          userPropertyId: userProperty.id,
          metadata: {
            content_type: job.contentType,
            target_language: job.language,
            translation_provider: costProvider,
          },
        });
        written += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `[produceTranslations] failed property=${userProperty.id} ${job.contentType}/${job.language}: ${message}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return written;
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

    if (!canonical) {
      this.logger.warn(
        `[resolveContext] property=${userProperty.id} canonical property missing`,
      );
      return {
        trackerId: 'none',
        contentLanguage: ContentLanguage.EL,
        config: null as ContentPublishingConfigWithRelations | null,
        resolveReason: 'Canonical property missing',
      };
    }

    const sourceAgencyId =
      canonical.source_links[0]?.source_property.source_agency_id;
    if (!sourceAgencyId) {
      this.logger.warn(
        `[resolveContext] property=${userProperty.id} no source_links/source_agency_id`,
      );
      return {
        trackerId: 'none',
        contentLanguage: ContentLanguage.EL,
        config: null as ContentPublishingConfigWithRelations | null,
        resolveReason:
          'Property has no source agency link; cannot resolve content publishing config',
      };
    }

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

    if (!tracker) {
      this.logger.warn(
        `[resolveContext] property=${userProperty.id} no UserTrackedAgency for sourceAgency=${sourceAgencyId}`,
      );
      return {
        trackerId: 'none',
        contentLanguage: ContentLanguage.EL,
        config: null as ContentPublishingConfigWithRelations | null,
        resolveReason: `No tracked agency for source agency ${sourceAgencyId}`,
      };
    }

    const config = tracker.content_publishing_config;

    return {
      trackerId: tracker.id,
      contentLanguage: tracker.source_agency.content_language,
      config,
      resolveReason: config
        ? 'ok'
        : `No content publishing config on tracker ${tracker.id}`,
    };
  }
}
