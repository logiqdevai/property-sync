import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { AiService } from '@/integrations/ai/services/ai.service';
import { AiProviders } from '@/integrations/ai/interfaces/ai.interface';
import { calculateAiCost } from '@/integrations/ai/utils/ai-cost';
import { AiBatchClientService } from '@/integrations/ai-batch/services/ai-batch-client.service';
import { PropertyAiBatchService } from '@/integrations/ai-batch/services/property-ai-batch.service';
import { UserIntegrationsService } from '@/modules/user-integrations/user-integrations.service';
import { UserPropertiesService } from '@/modules/user-properties/user-properties.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import {
  PROPERTY_REMOVAL_SPIKE_ABSOLUTE_THRESHOLD,
  PROPERTY_REMOVAL_SPIKE_RATIO_THRESHOLD,
} from '@/modules/notifications/constants/notification.constants';
import {
  DEFAULT_ANTHROPIC_NORMALIZATION_MODEL,
  DEFAULT_OPENAI_NORMALIZATION_MODEL,
  NormalizationUsage,
  buildAnthropicCostReport,
} from '../constants/normalization.constants';
import {
  NORMALIZATION_STATIC_INSTRUCTIONS,
  buildNormalizationDynamicPrompt,
  buildNormalizationInput,
} from '../constants/normalization-prompt';
import { AnthropicNormalizationService } from './anthropic-normalization.service';
import {
  NormalizedAiRow,
  buildFallbackNormalizedRow,
  buildPropertyRecord,
  detectDuplicates,
  diffPropertyChanges,
  matchExistingDuplicateGroup,
} from '../utils/property-normalization.utils';
import {
  AiProvider,
  IntegrationType,
  NotificationSeverity,
  NotificationType,
  Prisma,
  PropertyHistoryEventType,
  PropertyStatus,
} from 'generated/prisma';

type SourcePropertyRow = {
  id: string;
  source_url: string;
  external_id: string | null;
  raw_title: string | null;
  raw_price: string | null;
  raw_location: string | null;
  raw_description: string | null;
  raw_data: unknown;
};

@Injectable()
export class PropertyNormalizationService {
  private readonly logger = new Logger(PropertyNormalizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userIntegrationsService: UserIntegrationsService,
    private readonly anthropicNormalizationService: AnthropicNormalizationService,
    private readonly aiService: AiService,
    private readonly propertyAiBatchService: PropertyAiBatchService,
    private readonly aiBatchClient: AiBatchClientService,
    private readonly userPropertiesService: UserPropertiesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async normalizeForCrawlRun(crawlRunId: string): Promise<void> {
    const crawlRun = await this.prisma.crawlRun.findUnique({
      where: { id: crawlRunId },
      include: { user_tracked_agency: true },
    });

    if (!crawlRun?.started_at) {
      this.logger.warn(`Crawl run ${crawlRunId} has no started_at — skipping normalization`);
      return;
    }

    if (!crawlRun.user_tracked_agency_id || !crawlRun.user_tracked_agency) {
      this.logger.log(`Crawl run ${crawlRunId}: no tracker — skipping normalization`);
      return;
    }

    const tracker = crawlRun.user_tracked_agency;
    const integrationType = tracker.ai_provider as unknown as IntegrationType;

    let resolvedKey: { userIntegrationId: string; apiKey: string };
    try {
      resolvedKey = await this.userIntegrationsService.resolveActiveApiKey(
        tracker.user_id,
        integrationType,
      );
    } catch {
      this.logger.warn(
        `Crawl run ${crawlRunId}: no active ${tracker.ai_provider} key — skipping normalization`,
      );
      return;
    }

    const sourceProperties = await this.prisma.sourceProperty.findMany({
      where: {
        source_agency_id: crawlRun.source_agency_id,
        last_seen_at: { gte: crawlRun.started_at },
      },
    });

    const model =
      tracker.ai_model ??
      (tracker.ai_provider === AiProvider.ANTHROPIC
        ? DEFAULT_ANTHROPIC_NORMALIZATION_MODEL
        : DEFAULT_OPENAI_NORMALIZATION_MODEL);

    await this.prisma.crawlRun.update({
      where: { id: crawlRunId },
      data: {
        metadata: {
          ...(typeof crawlRun.metadata === 'object' && crawlRun.metadata
            ? crawlRun.metadata
            : {}),
          user_integration_id: resolvedKey.userIntegrationId,
          ai_provider: tracker.ai_provider,
          ai_model: model,
        },
      },
    });

    if (sourceProperties.length === 0) {
      const removalStats = await this.detectRemovalsAndReappearances(
        crawlRunId,
        crawlRun.source_agency_id,
        crawlRun.started_at,
        crawlRun.user_tracked_agency_id ?? undefined,
      );
      await this.persistRemovalStats({
        crawlRunId,
        sourceAgencyId: crawlRun.source_agency_id,
        scraperId: crawlRun.scraper_id ?? undefined,
        ...removalStats,
      });
      return;
    }

    const useBatch =
      tracker.use_ai_batching && tracker.ai_provider === AiProvider.OPENAI;

    if (useBatch) {
      await this.propertyAiBatchService.submitForCrawlRun({
        crawlRunId,
        sourceAgencyId: crawlRun.source_agency_id,
        sourceProperties,
        apiKey: resolvedKey.apiKey,
        userIntegrationId: resolvedKey.userIntegrationId,
        model,
      });
      return;
    }

    const syncResult = await this.normalizeSync(
      sourceProperties,
      tracker.ai_provider,
      model,
      resolvedKey.apiKey,
    );

    await this.applyNormalizedResults({
      crawlRunId,
      sourceAgencyId: crawlRun.source_agency_id,
      crawlStartedAt: crawlRun.started_at,
      sourceProperties,
      normalizedBySourceId: syncResult.normalizedBySourceId,
      model,
      provider: tracker.ai_provider,
      anthropicUsage: syncResult.anthropicUsage,
      openAiUsage: syncResult.openAiUsage,
      userTrackedAgencyId: crawlRun.user_tracked_agency_id ?? undefined,
    });
  }

  async applyNormalizedResults(params: {
    crawlRunId: string;
    sourceAgencyId: string;
    crawlStartedAt: Date;
    sourceProperties: SourcePropertyRow[];
    normalizedBySourceId: Map<string, NormalizedAiRow | null>;
    model: string;
    provider: AiProvider;
    anthropicUsage?: NormalizationUsage;
    openAiUsage?: { inputTokens: number; outputTokens: number };
    userTrackedAgencyId?: string;
  }): Promise<void> {
    let createdCount = 0;
    const batchProperties: Array<{
      id: string;
      duplicate_group_id: string | null;
      title: string;
      city: string | null;
      price: Prisma.Decimal | null;
    }> = [];

    const existingProperties = await this.prisma.property.findMany({
      where: {
        source_links: {
          some: {
            source_property: { source_agency_id: params.sourceAgencyId },
          },
        },
      },
      select: {
        id: true,
        title: true,
        city: true,
        price: true,
        duplicate_group_id: true,
      },
    });

    for (const sp of params.sourceProperties) {
      const aiRow =
        params.normalizedBySourceId.get(sp.id) ?? buildFallbackNormalizedRow(sp);
      const record = buildPropertyRecord(aiRow, sp);

      const existingLink = await this.prisma.propertySourceLink.findFirst({
        where: { source_property_id: sp.id },
        include: { property: true },
      });

      if (existingLink?.property) {
        const historyEvents = diffPropertyChanges(
          existingLink.property,
          record,
          params.crawlRunId,
        );

        const wasRemoved = existingLink.property.status === PropertyStatus.REMOVED;
        const updated = await this.prisma.property.update({
          where: { id: existingLink.property.id },
          data: {
            ...record,
            status: PropertyStatus.ACTIVE,
            duplicate_group_id: existingLink.property.duplicate_group_id,
          },
        });

        if (wasRemoved) {
          await this.prisma.propertyHistory.create({
            data: {
              property_id: updated.id,
              event_type: PropertyHistoryEventType.REAPPEARED,
              crawl_run_id: params.crawlRunId,
            },
          });
        }

        if (historyEvents.length > 0) {
          await this.prisma.propertyHistory.createMany({
            data: historyEvents.map((event) => ({
              property_id: event.property_id,
              event_type: event.event_type,
              field: event.field ?? null,
              old_value: event.old_value ?? undefined,
              new_value: event.new_value ?? undefined,
              crawl_run_id: event.crawl_run_id ?? null,
            })),
          });
        }

        batchProperties.push(updated);
        await this.userPropertiesService.syncForProperty(updated.id, {
          userTrackedAgencyId: params.userTrackedAgencyId,
          sourceAgencyId: params.sourceAgencyId,
          changeType: 'updated',
        });
        continue;
      }

      const duplicateGroupId = matchExistingDuplicateGroup(record, existingProperties);
      const created = await this.prisma.property.create({
        data: {
          ...record,
          duplicate_group_id: duplicateGroupId,
          source_links: {
            create: {
              source_property_id: sp.id,
              is_primary_source: true,
              confidence_score: new Prisma.Decimal(1),
            },
          },
          history: {
            create: {
              event_type: PropertyHistoryEventType.CREATED,
              crawl_run_id: params.crawlRunId,
            },
          },
        },
      });

      createdCount++;
      batchProperties.push(created);
      existingProperties.push(created);
      await this.userPropertiesService.syncForProperty(created.id, {
        userTrackedAgencyId: params.userTrackedAgencyId,
        sourceAgencyId: params.sourceAgencyId,
        changeType: 'created',
      });
    }

    detectDuplicates(batchProperties);
    for (const property of batchProperties) {
      await this.prisma.property.update({
        where: { id: property.id },
        data: { duplicate_group_id: property.duplicate_group_id },
      });
    }

    const removalStats = await this.detectRemovalsAndReappearances(
      params.crawlRunId,
      params.sourceAgencyId,
      params.crawlStartedAt,
      params.userTrackedAgencyId,
    );

    await this.persistRemovalStats({
      crawlRunId: params.crawlRunId,
      sourceAgencyId: params.sourceAgencyId,
      scraperId: (
        await this.prisma.crawlRun.findUnique({
          where: { id: params.crawlRunId },
          select: { scraper_id: true },
        })
      )?.scraper_id ?? undefined,
      ...removalStats,
    });

    await this.persistAiCosts({
      crawlRunId: params.crawlRunId,
      model: params.model,
      provider: params.provider,
      createdCount,
      anthropicUsage: params.anthropicUsage,
      openAiUsage: params.openAiUsage,
    });

    const crawlRun = await this.prisma.crawlRun.findUnique({ where: { id: params.crawlRunId } });
    const metadata = (crawlRun?.metadata ?? {}) as Record<string, unknown>;
    if (metadata.ai_batch_id) {
      await this.prisma.crawlRun.update({
        where: { id: params.crawlRunId },
        data: {
          metadata: {
            ...metadata,
            ai_batch_status: 'completed',
          },
        },
      });
    }
  }

  async completeBatchNormalization(crawlRunId: string, batchId: string): Promise<void> {
    const crawlRun = await this.prisma.crawlRun.findUnique({
      where: { id: crawlRunId },
    });

    if (!crawlRun?.started_at) return;

    const metadata = (crawlRun.metadata ?? {}) as Record<string, unknown>;
    const userIntegrationId = metadata.user_integration_id as string | undefined;
    if (!userIntegrationId) {
      this.logger.error(`Batch ${batchId}: missing user_integration_id on crawl run ${crawlRunId}`);
      return;
    }

    const integration = await this.prisma.userIntegration.findUnique({
      where: { id: userIntegrationId },
    });

    if (!integration?.api_key_secret) {
      this.logger.error(`Batch ${batchId}: integration ${userIntegrationId} has no API key`);
      return;
    }

    const client = this.aiBatchClient.createClient(integration.api_key_secret);
    const batch = await this.aiBatchClient.retrieveBatch(client, batchId);

    if (!batch.output_file_id) {
      throw new Error(`Batch ${batchId} has no output file`);
    }

    const output = await this.aiBatchClient.downloadOutputFile(client, batch.output_file_id);
    const sourceProperties = await this.prisma.sourceProperty.findMany({
      where: {
        source_agency_id: crawlRun.source_agency_id,
        last_seen_at: { gte: crawlRun.started_at },
      },
    });

    const normalizedBySourceId = new Map<string, NormalizedAiRow | null>();
    let inputTokens = 0;
    let outputTokens = 0;

    for (const line of output.split('\n').filter(Boolean)) {
      const parsed = this.propertyAiBatchService.parseBatchOutputLine(line);
      if (!parsed) continue;
      normalizedBySourceId.set(parsed.customId, parsed.normalized);
      inputTokens += parsed.usage?.prompt_tokens ?? 0;
      outputTokens += parsed.usage?.completion_tokens ?? 0;
    }

    const model =
      (metadata.ai_model as string) ??
      crawlRun.ai_model ??
      DEFAULT_OPENAI_NORMALIZATION_MODEL;

    await this.applyNormalizedResults({
      crawlRunId,
      sourceAgencyId: crawlRun.source_agency_id,
      crawlStartedAt: crawlRun.started_at,
      sourceProperties,
      normalizedBySourceId,
      model,
      provider: AiProvider.OPENAI,
      openAiUsage: { inputTokens, outputTokens },
      userTrackedAgencyId: crawlRun.user_tracked_agency_id ?? undefined,
    });
  }

  async markBatchFailed(crawlRunId: string, status: string, errorMessage: string): Promise<void> {
    const crawlRun = await this.prisma.crawlRun.findUnique({ where: { id: crawlRunId } });
    const metadata = (crawlRun?.metadata ?? {}) as Record<string, unknown>;

    await this.prisma.crawlRun.update({
      where: { id: crawlRunId },
      data: {
        error_message: errorMessage,
        metadata: {
          ...metadata,
          ai_batch_status: status,
        },
      },
    });
  }

  private async normalizeSync(
    sourceProperties: SourcePropertyRow[],
    provider: AiProvider,
    model: string,
    apiKey: string,
  ): Promise<{
    normalizedBySourceId: Map<string, NormalizedAiRow | null>;
    anthropicUsage?: NormalizationUsage;
    openAiUsage?: { inputTokens: number; outputTokens: number };
  }> {
    const normalizedBySourceId = new Map<string, NormalizedAiRow | null>();

    if (provider === AiProvider.ANTHROPIC) {
      const { results, usage } =
        await this.anthropicNormalizationService.normalizeSourceProperties(
          sourceProperties,
          apiKey,
          model,
        );
      sourceProperties.forEach((sp, index) => {
        normalizedBySourceId.set(sp.id, results[index] ?? null);
      });
      return { normalizedBySourceId, anthropicUsage: usage };
    }

    const providerKey =
      provider === AiProvider.OPENAI ? AiProviders.openai : AiProviders.gemini;

    let inputTokens = 0;
    let outputTokens = 0;

    for (const sp of sourceProperties) {
      try {
        const input = buildNormalizationInput([sp]);
        const response = await this.aiService.generateText({
          provider: providerKey,
          model,
          apiKey,
          system: NORMALIZATION_STATIC_INSTRUCTIONS,
          prompt: buildNormalizationDynamicPrompt(input),
          maxTokens: 8192,
        });

        inputTokens += response.usage?.inputTokens ?? 0;
        outputTokens += response.usage?.outputTokens ?? 0;

        const arrayMatch = response.response.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          const rows = JSON.parse(arrayMatch[0]) as NormalizedAiRow[];
          normalizedBySourceId.set(sp.id, rows[0] ?? null);
        } else {
          normalizedBySourceId.set(sp.id, buildFallbackNormalizedRow(sp));
        }
      } catch {
        normalizedBySourceId.set(sp.id, buildFallbackNormalizedRow(sp));
      }
    }

    return {
      normalizedBySourceId,
      openAiUsage: { inputTokens, outputTokens },
    };
  }

  private async detectRemovalsAndReappearances(
    crawlRunId: string,
    sourceAgencyId: string,
    crawlStartedAt: Date,
    userTrackedAgencyId?: string,
  ): Promise<{ removedCount: number; totalTracked: number }> {
    const agencyProperties = await this.prisma.property.findMany({
      where: {
        source_links: {
          some: {
            source_property: { source_agency_id: sourceAgencyId },
          },
        },
      },
      include: {
        source_links: {
          include: { source_property: { select: { last_seen_at: true } } },
        },
      },
    });

    let removedCount = 0;

    for (const property of agencyProperties) {
      const anySeenThisCrawl = property.source_links.some(
        (link) =>
          link.source_property.last_seen_at &&
          link.source_property.last_seen_at >= crawlStartedAt,
      );

      if (!anySeenThisCrawl && property.status !== PropertyStatus.REMOVED) {
        removedCount++;
        await this.prisma.property.update({
          where: { id: property.id },
          data: { status: PropertyStatus.REMOVED },
        });
        await this.prisma.propertyHistory.create({
          data: {
            property_id: property.id,
            event_type: PropertyHistoryEventType.REMOVED,
            crawl_run_id: crawlRunId,
          },
        });
        await this.userPropertiesService.syncForProperty(property.id, {
          userTrackedAgencyId,
          sourceAgencyId,
          changeType: 'removed',
        });
      }
    }

    return { removedCount, totalTracked: agencyProperties.length };
  }

  private async persistRemovalStats(params: {
    crawlRunId: string;
    sourceAgencyId: string;
    scraperId?: string;
    removedCount: number;
    totalTracked: number;
  }): Promise<void> {
    await this.prisma.crawlRun.update({
      where: { id: params.crawlRunId },
      data: { total_removed: params.removedCount },
    });

    const ratio =
      params.totalTracked > 0 ? params.removedCount / params.totalTracked : 0;
    const isSpike =
      params.removedCount > PROPERTY_REMOVAL_SPIKE_ABSOLUTE_THRESHOLD ||
      ratio > PROPERTY_REMOVAL_SPIKE_RATIO_THRESHOLD;

    if (!isSpike) return;

    this.notificationsService.create({
      type: NotificationType.PROPERTY_REMOVAL_SPIKE,
      severity: NotificationSeverity.WARNING,
      title: 'Property removal spike detected',
      message: `${params.removedCount} of ${params.totalTracked} tracked properties were removed in crawl run ${params.crawlRunId}`,
      source_agency_id: params.sourceAgencyId,
      scraper_id: params.scraperId,
      crawl_run_id: params.crawlRunId,
    });
  }

  private async persistAiCosts(params: {
    crawlRunId: string;
    model: string;
    provider: AiProvider;
    createdCount: number;
    anthropicUsage?: NormalizationUsage;
    openAiUsage?: { inputTokens: number; outputTokens: number };
  }): Promise<void> {
    if (params.provider === AiProvider.ANTHROPIC && params.anthropicUsage) {
      const report = buildAnthropicCostReport(params.anthropicUsage, params.model, {
        aiNormalizedCount: params.createdCount,
      });
      await this.prisma.crawlRun.update({
        where: { id: params.crawlRunId },
        data: {
          ai_model: report.model,
          ai_input_tokens: report.input_tokens,
          ai_output_tokens: report.output_tokens,
          ai_input_cost: report.input_cost,
          ai_output_cost: report.output_cost,
          ai_total_cost: report.total_cost,
          ai_average_cost_per_property: report.average_cost_per_property,
        },
      });
      return;
    }

    if (params.openAiUsage) {
      const cost = calculateAiCost({
        provider: AiProviders.openai,
        model: params.model,
        inputTokens: params.openAiUsage.inputTokens,
        outputTokens: params.openAiUsage.outputTokens,
      });

      await this.prisma.crawlRun.update({
        where: { id: params.crawlRunId },
        data: {
          ai_model: params.model,
          ai_input_tokens: cost.inputTokens,
          ai_output_tokens: cost.outputTokens,
          ai_input_cost: cost.inputCost,
          ai_output_cost: cost.outputCost,
          ai_total_cost: cost.totalCost,
          ai_average_cost_per_property:
            params.createdCount > 0 ? cost.totalCost / params.createdCount : null,
        },
      });
    }
  }
}
