import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { NORMALIZATION_QUEUE } from '@/core/queues/queues.constants';
import { AiService } from '@/integrations/ai/services/ai.service';
import {
  AiProvider,
  AiProviders,
} from '@/integrations/ai/interfaces/ai.interface';
import { AiDefaults } from '@/integrations/ai/utils/ai.config';
import { calculateAiCost } from '@/integrations/ai/utils/ai-cost';
import { AiBatchClientService } from '@/integrations/ai-batch/services/ai-batch-client.service';
import { PropertyAiBatchService } from '@/integrations/ai-batch/services/property-ai-batch.service';
import { UserIntegrationsService } from '@/modules/user-integrations/user-integrations.service';
import {
  SyncForPropertyResult,
  UserPropertiesService,
} from '@/modules/user-properties/user-properties.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { PlatformConfigService } from '@/modules/platform-config/platform-config.service';
import { CostLogsService } from '@/modules/cost-logs/cost-logs.service';
import { CmsSyncOrchestratorService } from '@/modules/cms-sync/services/cms-sync-orchestrator.service';
import {
  NormalizationChunkItemResult,
  NormalizationChunkJobData,
} from '../interfaces/normalization-chunk-job.interface';
import {
  CRAWL_REMOVAL_COVERAGE_MIN_BASELINE,
  CRAWL_REMOVAL_COVERAGE_RATIO_THRESHOLD,
  PROPERTY_REMOVAL_SPIKE_ABSOLUTE_THRESHOLD,
  PROPERTY_REMOVAL_SPIKE_RATIO_THRESHOLD,
} from '@/modules/notifications/constants/notification.constants';
import {
  NORMALIZATION_BATCH_SIZE,
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
  buildNormalizedRowFromExistingProperty,
  buildPropertyRecord,
  detectDuplicates,
  diffPropertyChanges,
  imagesArray,
  matchExistingDuplicateGroup,
  matchNormalizedRowsToIds,
} from '../utils/property-normalization.utils';
import { detectSoldWatermark } from '../utils/sold-watermark-detection.util';
import { ScraperConfig } from '@/integrations/crawler/interfaces/scraper-config.interface';
import {
  AffectedUserProperty,
  PropertySyncChangeType,
  toCmsSyncOperationType,
} from '@/modules/cms-sync/interfaces/cms-sync-batch.interface';
import {
  CostOperationType,
  CrawlRunStatus,
  IntegrationType,
  JobStatus,
  NotificationSeverity,
  NotificationType,
  Prisma,
  PropertyHistoryEventType,
  PropertyStatus,
} from 'generated/prisma';

type SourcePropertyRow = {
  id: string;
  source_url: string;
  property_id: string;
  internal_id: string | null;
  raw_title: string | null;
  raw_price: string | null;
  raw_location: string | null;
  raw_description: string | null;
  raw_property_type: string | null;
  raw_listing_type: string | null;
  raw_sqm: string | null;
  raw_bedrooms: string | null;
  raw_bathrooms: string | null;
  raw_data: unknown;
  content_hash: string | null;
};

type PendingCmsSyncAffected = SyncForPropertyResult[];

const CMS_SYNC_CHANGE_PRIORITY: Record<PropertySyncChangeType, number> = {
  removed: 3,
  sold: 3,
  created: 2,
  updated: 1,
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
    private readonly platformConfigService: PlatformConfigService,
    private readonly costLogsService: CostLogsService,
    private readonly cmsSyncOrchestratorService: CmsSyncOrchestratorService,
    @InjectQueue(NORMALIZATION_QUEUE)
    private readonly normalizationQueue: Queue<NormalizationChunkJobData>,
  ) {}

  async normalizeForCrawlRun(crawlRunId: string): Promise<void> {
    const crawlRun = await this.prisma.crawlRun.findUnique({
      where: { id: crawlRunId },
      include: {
        user_tracked_agency: true,
        scraper: true,
        source_agency: true,
      },
    });

    if (!crawlRun?.started_at) {
      this.logger.warn(
        `Crawl run ${crawlRunId} has no started_at — skipping normalization`,
      );
      return;
    }

    // Agency-scoped crawl runs (the common case — one crawl serves every
    // tracker of that agency) carry no tracker of their own. Normalization
    // still needs *a* user's AI integration to bill/configure the call, so
    // fall back to the agency's earliest enabled tracker. The resulting
    // Property records and history are shared/canonical either way — this
    // only decides whose AI key pays for normalizing them. Revisit once
    // per-agency AI billing (rather than per-tracker) is designed.
    const tracker =
      crawlRun.user_tracked_agency ??
      (await this.resolveDefaultTrackerForAgency(crawlRun.source_agency_id));

    if (!tracker) {
      this.logger.log(
        `Crawl run ${crawlRunId}: no enabled tracker for agency ${crawlRun.source_agency_id} — skipping normalization`,
      );
      return;
    }
    const aiProvider = AiDefaults.provider;
    const model = AiDefaults.model;

    let resolvedKey: { userIntegrationId: string; apiKey: string };
    try {
      resolvedKey = await this.userIntegrationsService.resolveActiveApiKey(
        tracker.user_id,
        aiProvider,
      );
    } catch {
      this.logger.warn(
        `Crawl run ${crawlRunId}: no active ${aiProvider} key — skipping normalization`,
      );
      return;
    }

    const normalizeLimit = crawlRun.scraper?.normalize_limit ?? null;
    const sourceProperties = await this.loadSourcePropertiesForNormalization(
      crawlRun.source_agency_id,
      crawlRun.started_at,
    );

    await this.prisma.crawlRun.update({
      where: { id: crawlRunId },
      data: {
        metadata: {
          ...(typeof crawlRun.metadata === 'object' && crawlRun.metadata
            ? crawlRun.metadata
            : {}),
          user_integration_id: resolvedKey.userIntegrationId,
          ai_provider: aiProvider,
          ai_model: model,
          normalization_status: 'running',
          ...(normalizeLimit !== null && { normalize_limit: normalizeLimit }),
        },
        // Reset so the per-chunk normalization path (below) can safely use
        // `increment` instead of clobbering the total with each chunk's
        // absolute values.
        ai_input_tokens: 0,
        ai_output_tokens: 0,
        ai_input_cost: 0,
        ai_output_cost: 0,
        ai_total_cost: 0,
      },
    });

    try {
      if (sourceProperties.length === 0) {
        await this.finalizeCrawlNormalizationSync({
          crawlRunId,
          sourceAgencyId: crawlRun.source_agency_id,
          crawlStartedAt: crawlRun.started_at,
          userTrackedAgencyId: crawlRun.user_tracked_agency_id ?? undefined,
          scraperId: crawlRun.scraper_id ?? undefined,
          affected: [],
        });
        await this.setNormalizationStatus(crawlRunId, 'completed');
        return;
      }

      const { reused, toNormalize, reusedRowsBySourceId } =
        await this.splitUnchangedSourceProperties(sourceProperties);

      const pendingAffected: SyncForPropertyResult[] = [];

      if (reused.length > 0) {
        this.logger.log(
          `Crawl run ${crawlRunId}: skipping AI normalization for ${reused.length} unchanged listing(s)`,
        );
        const { affected: reusedAffected } = await this.applyNormalizedResults({
          crawlRunId,
          sourceAgencyId: crawlRun.source_agency_id,
          crawlStartedAt: crawlRun.started_at,
          sourceProperties: reused,
          normalizedBySourceId: reusedRowsBySourceId,
          model,
          provider: aiProvider,
          userTrackedAgencyId: crawlRun.user_tracked_agency_id ?? undefined,
          contentHashChanged: false,
        });
        pendingAffected.push(...reusedAffected);
      }

      if (toNormalize.length === 0) {
        await this.finalizeCrawlNormalizationSync({
          crawlRunId,
          sourceAgencyId: crawlRun.source_agency_id,
          crawlStartedAt: crawlRun.started_at,
          userTrackedAgencyId: crawlRun.user_tracked_agency_id ?? undefined,
          scraperId: crawlRun.scraper_id ?? undefined,
          affected: pendingAffected,
        });
        await this.setNormalizationStatus(crawlRunId, 'completed');
        return;
      }

      const limited =
        normalizeLimit !== null &&
        normalizeLimit > 0 &&
        toNormalize.length > normalizeLimit
          ? toNormalize.slice(0, normalizeLimit)
          : toNormalize;

      if (limited.length < toNormalize.length) {
        this.logger.log(
          `Crawl run ${crawlRunId}: normalize limit ${normalizeLimit} — normalizing ${limited.length} of ${toNormalize.length} changed listing(s)`,
        );
      }

      const useBatch =
        crawlRun.source_agency.use_ai_batching &&
        aiProvider === IntegrationType.OPENAI;

      if (useBatch) {
        await this.propertyAiBatchService.submitForCrawlRun({
          crawlRunId,
          sourceAgencyId: crawlRun.source_agency_id,
          sourceProperties: limited,
          apiKey: resolvedKey.apiKey,
          userIntegrationId: resolvedKey.userIntegrationId,
          model,
        });
        if (pendingAffected.length > 0) {
          await this.persistPendingCmsSyncAffected(crawlRunId, pendingAffected);
        }
        return;
      }

      // Fan out to independent, retryable, timeout-protected BullMQ jobs
      // (one per NORMALIZATION_BATCH_SIZE chunk) instead of awaiting a
      // sequential in-process loop — a single stuck AI call can no longer
      // block every other property in the crawl. normalization_status stays
      // 'running' until the last chunk's finalize step flips it, same as the
      // OpenAI-Batch-API path above already behaves.
      await this.enqueueNormalizationChunks({
        crawlRunId,
        sourceAgencyId: crawlRun.source_agency_id,
        crawlStartedAt: crawlRun.started_at,
        trackerUserId: tracker.user_id,
        userTrackedAgencyId: crawlRun.user_tracked_agency_id ?? undefined,
        scraperId: crawlRun.scraper_id ?? undefined,
        provider: aiProvider,
        model,
        toNormalize: limited,
        pendingAffected,
      });
    } catch (error) {
      await this.setNormalizationStatus(crawlRunId, 'failed');
      throw error;
    }
  }

  private async enqueueNormalizationChunks(params: {
    crawlRunId: string;
    sourceAgencyId: string;
    crawlStartedAt: Date;
    trackerUserId: string;
    userTrackedAgencyId?: string;
    scraperId?: string;
    provider: IntegrationType;
    model: string;
    toNormalize: SourcePropertyRow[];
    pendingAffected: SyncForPropertyResult[];
  }): Promise<void> {
    const chunks: SourcePropertyRow[][] = [];
    for (
      let i = 0;
      i < params.toNormalize.length;
      i += NORMALIZATION_BATCH_SIZE
    ) {
      chunks.push(params.toNormalize.slice(i, i + NORMALIZATION_BATCH_SIZE));
    }

    const jobLog = await this.prisma.jobLog.create({
      data: {
        queue_name: NORMALIZATION_QUEUE,
        job_name: 'normalize-crawl-chunk',
        status: JobStatus.WAITING,
        crawl_run_id: params.crawlRunId,
        payload: {
          crawl_run_id: params.crawlRunId,
          source_agency_id: params.sourceAgencyId,
          total_chunks: chunks.length,
        } as object,
        result: {
          total: chunks.length,
          processed: 0,
          chunks: [],
          affected: params.pendingAffected,
          created_count: 0,
          finalized: false,
          logs: [
            `enqueued crawl_run=${params.crawlRunId} chunks=${chunks.length} properties=${params.toNormalize.length}`,
          ],
        } as object,
      },
    });

    try {
      await this.normalizationQueue.addBulk(
        chunks.map((chunk, index) => {
          const jobData: NormalizationChunkJobData = {
            job_log_id: jobLog.id,
            crawl_run_id: params.crawlRunId,
            source_agency_id: params.sourceAgencyId,
            crawl_started_at: params.crawlStartedAt.toISOString(),
            tracker_user_id: params.trackerUserId,
            user_tracked_agency_id: params.userTrackedAgencyId,
            scraper_id: params.scraperId,
            provider: params.provider,
            model: params.model,
            source_property_ids: chunk.map((sp) => sp.id),
            chunk_index: index,
            total_chunks: chunks.length,
          };
          return {
            name: 'normalize-crawl-chunk',
            data: jobData,
            opts: {
              jobId: `${jobLog.id}__${index}`,
              attempts: 3,
              backoff: { type: 'exponential' as const, delay: 5000 },
              removeOnComplete: 100,
              removeOnFail: 200,
            },
          };
        }),
      );
    } catch (error) {
      // Don't leave a WAITING JobLog with no jobs behind it — that's the same
      // "silently wedged forever" shape as the bug this replaces.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Crawl run ${params.crawlRunId}: failed to enqueue normalization chunks: ${message}`,
      );
      await this.prisma.jobLog.update({
        where: { id: jobLog.id },
        data: {
          status: JobStatus.FAILED,
          finished_at: new Date(),
          error_message: message,
        },
      });
      throw error;
    }
  }

  private async splitUnchangedSourceProperties(
    sourceProperties: SourcePropertyRow[],
  ): Promise<{
    reused: SourcePropertyRow[];
    toNormalize: SourcePropertyRow[];
    reusedRowsBySourceId: Map<string, NormalizedAiRow | null>;
  }> {
    const links = await this.prisma.propertySourceLink.findMany({
      where: {
        source_property_id: { in: sourceProperties.map((sp) => sp.id) },
      },
      include: { property: true },
    });
    const linkBySourceId = new Map(
      links.map((link) => [link.source_property_id, link]),
    );

    const reused: SourcePropertyRow[] = [];
    const toNormalize: SourcePropertyRow[] = [];
    const reusedRowsBySourceId = new Map<string, NormalizedAiRow | null>();

    for (const sp of sourceProperties) {
      const link = linkBySourceId.get(sp.id);
      const unchanged =
        sp.content_hash != null &&
        link != null &&
        link.last_normalized_hash === sp.content_hash;

      if (unchanged) {
        reused.push(sp);
        reusedRowsBySourceId.set(
          sp.id,
          buildNormalizedRowFromExistingProperty(link.property),
        );
      } else {
        toNormalize.push(sp);
      }
    }

    return { reused, toNormalize, reusedRowsBySourceId };
  }

  async normalizeForUserProperty(
    userId: string,
    userPropertyId: string,
  ): Promise<{
    user_property_id: string;
    status: 'normalized' | 'failed';
    error?: string;
  }> {
    try {
      const userProperty = await this.prisma.userProperty.findFirst({
        where: { id: userPropertyId, user_id: userId },
        select: {
          id: true,
          canonical_property_id: true,
        },
      });

      if (!userProperty) {
        return {
          user_property_id: userPropertyId,
          status: 'failed',
          error: 'Property not found',
        };
      }

      const link = await this.prisma.propertySourceLink.findFirst({
        where: { property_id: userProperty.canonical_property_id },
        include: {
          source_property: {
            select: {
              id: true,
              source_agency_id: true,
              source_url: true,
              property_id: true,
              internal_id: true,
              raw_title: true,
              raw_price: true,
              raw_location: true,
              raw_description: true,
              raw_property_type: true,
              raw_listing_type: true,
              raw_sqm: true,
              raw_bedrooms: true,
              raw_bathrooms: true,
              raw_data: true,
              content_hash: true,
            },
          },
        },
        orderBy: [{ is_primary_source: 'desc' }, { created_at: 'asc' }],
      });

      if (!link?.source_property) {
        return {
          user_property_id: userPropertyId,
          status: 'failed',
          error: 'No source listing linked to this property',
        };
      }

      const sourceProperty: SourcePropertyRow = link.source_property;
      const aiProvider = AiDefaults.provider;
      const model = AiDefaults.model;

      let apiKey: string;
      try {
        const resolved = await this.userIntegrationsService.resolveActiveApiKey(
          userId,
          aiProvider,
        );
        apiKey = resolved.apiKey;
      } catch {
        return {
          user_property_id: userPropertyId,
          status: 'failed',
          error: `No active ${aiProvider} API key`,
        };
      }

      const syncResult = await this.normalizeSync(
        [sourceProperty],
        aiProvider,
        model,
        apiKey,
      );

      await this.applyNormalizedResults({
        crawlRunId: null,
        sourceAgencyId: link.source_property.source_agency_id,
        crawlStartedAt: new Date(),
        sourceProperties: [sourceProperty],
        normalizedBySourceId: syncResult.normalizedBySourceId,
        model,
        provider: aiProvider,
        anthropicUsage: syncResult.anthropicUsage,
        openAiUsage: syncResult.openAiUsage,
        costUserId: userId,
        costUserPropertyId: userPropertyId,
        contentHashChanged: true,
      });

      return {
        user_property_id: userPropertyId,
        status: 'normalized',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[normalizeForUserProperty] user=${userId} property=${userPropertyId} failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        user_property_id: userPropertyId,
        status: 'failed',
        error: message,
      };
    }
  }

  async applyNormalizedResults(params: {
    crawlRunId: string | null;
    sourceAgencyId: string;
    crawlStartedAt: Date;
    sourceProperties: SourcePropertyRow[];
    normalizedBySourceId: Map<string, NormalizedAiRow | null>;
    model: string;
    provider: IntegrationType;
    anthropicUsage?: NormalizationUsage;
    openAiUsage?: { inputTokens: number; outputTokens: number };
    userTrackedAgencyId?: string;
    isBatch?: boolean;
    costUserId?: string | null;
    costUserPropertyId?: string | null;
    contentHashChanged?: boolean;
    // When true, persistAiCosts increments the crawl run's cost columns
    // instead of overwriting them — used when this is called once per chunk
    // of a fanned-out crawl normalization rather than once for the whole run.
    accumulateAiCost?: boolean;
  }): Promise<{ affected: SyncForPropertyResult[]; createdCount: number }> {
    let createdCount = 0;
    const affected: SyncForPropertyResult[] = [];
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

    for (const loadedSp of params.sourceProperties) {
      // AI sync can take minutes; source rows may be deleted/recreated by a
      // concurrent crawl or admin cleanup before we write property links.
      const sp = await this.resolveLiveSourceProperty(
        loadedSp,
        params.sourceAgencyId,
      );
      if (!sp) {
        this.logger.warn(
          `Skipping normalization for missing source_property ${loadedSp.id} (${loadedSp.source_url})`,
        );
        continue;
      }

      const aiRow =
        params.normalizedBySourceId.get(loadedSp.id) ??
        params.normalizedBySourceId.get(sp.id) ??
        buildFallbackNormalizedRow(sp);
      const record = buildPropertyRecord(aiRow, sp);

      if (record.internal_id && !sp.internal_id) {
        await this.prisma.sourceProperty.update({
          where: { id: sp.id },
          data: { internal_id: record.internal_id },
        });
        sp.internal_id = record.internal_id;
      }

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

        const wasRemoved =
          existingLink.property.status === PropertyStatus.REMOVED;
        const updated = await this.prisma.property.update({
          where: { id: existingLink.property.id },
          data: {
            ...record,
            // `price` is only ever set at creation — a re-crawl that finds a
            // new price must only move `price_web`, so the two fields
            // diverging is how a price change is detected (see
            // diffPropertyChanges).
            price: existingLink.property.price,
            city: record.city ?? existingLink.property.city,
            district: record.district ?? existingLink.property.district,
            estateweb_location_id:
              record.estateweb_location_id ??
              existingLink.property.estateweb_location_id,
            estateweb_type_id:
              record.estateweb_type_id ??
              existingLink.property.estateweb_type_id,
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
              old_value:
                event.old_value === undefined || event.old_value === null
                  ? Prisma.JsonNull
                  : event.old_value,
              new_value:
                event.new_value === undefined || event.new_value === null
                  ? Prisma.JsonNull
                  : event.new_value,
              crawl_run_id: event.crawl_run_id ?? null,
            })),
          });
        }

        await this.prisma.propertySourceLink.update({
          where: { id: existingLink.id },
          data: { last_normalized_hash: sp.content_hash ?? null },
        });

        batchProperties.push(updated);
        const updatedResults = await this.userPropertiesService.syncForProperty(
          updated.id,
          {
            userTrackedAgencyId: params.userTrackedAgencyId,
            sourceAgencyId: params.sourceAgencyId,
            changeType: 'updated',
            contentHashChanged: params.contentHashChanged,
          },
        );
        affected.push(...updatedResults);
        continue;
      }

      const duplicateGroupId = matchExistingDuplicateGroup(
        record,
        existingProperties,
      );
      let created;
      try {
        created = await this.prisma.property.create({
          data: {
            ...record,
            duplicate_group_id: duplicateGroupId,
            source_links: {
              create: {
                source_property_id: sp.id,
                is_primary_source: true,
                confidence_score: new Prisma.Decimal(1),
                last_normalized_hash: sp.content_hash ?? null,
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
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2003'
        ) {
          this.logger.warn(
            `FK failure creating property for source_property ${sp.id} (${sp.source_url}) — row likely deleted mid-normalization`,
          );
          continue;
        }
        if (
          error instanceof Prisma.PrismaClientValidationError ||
          (error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2007')
        ) {
          this.logger.error(
            `Validation failure creating property for source_property ${sp.id} (${sp.source_url}): ${error.message}`,
          );
          continue;
        }
        throw error;
      }

      createdCount++;
      batchProperties.push(created);
      existingProperties.push(created);
      const createdResults = await this.userPropertiesService.syncForProperty(
        created.id,
        {
          userTrackedAgencyId: params.userTrackedAgencyId,
          sourceAgencyId: params.sourceAgencyId,
          changeType: 'created',
        },
      );
      affected.push(...createdResults);
    }

    detectDuplicates(batchProperties);
    for (const property of batchProperties) {
      await this.prisma.property.update({
        where: { id: property.id },
        data: { duplicate_group_id: property.duplicate_group_id },
      });
      await this.prisma.userProperty.updateMany({
        where: { canonical_property_id: property.id },
        data: { duplicate_group_id: property.duplicate_group_id },
      });
    }

    await this.persistAiCosts({
      crawlRunId: params.crawlRunId,
      model: params.model,
      provider: params.provider,
      createdCount,
      anthropicUsage: params.anthropicUsage,
      openAiUsage: params.openAiUsage,
      isBatch: params.isBatch,
      userId: params.costUserId,
      userPropertyId: params.costUserPropertyId,
      accumulate: params.accumulateAiCost,
    });

    if (params.crawlRunId) {
      const crawlRun = await this.prisma.crawlRun.findUnique({
        where: { id: params.crawlRunId },
      });
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
        await this.propertyAiBatchService.markBatchJobCompleted(
          String(metadata.ai_batch_id),
        );
      }
    }

    return { affected, createdCount };
  }

  async completeBatchNormalization(
    crawlRunId: string,
    batchId: string,
  ): Promise<void> {
    const crawlRun = await this.prisma.crawlRun.findUnique({
      where: { id: crawlRunId },
    });

    if (!crawlRun?.started_at) {
      await this.propertyAiBatchService.markBatchJobFailed(
        batchId,
        `Crawl run ${crawlRunId} missing started_at`,
      );
      return;
    }

    const metadata = (crawlRun.metadata ?? {}) as Record<string, unknown>;
    const userIntegrationId = metadata.user_integration_id as
      | string
      | undefined;
    if (!userIntegrationId) {
      const message = `Batch ${batchId}: missing user_integration_id on crawl run ${crawlRunId}`;
      this.logger.error(message);
      await this.markBatchFailed(crawlRunId, 'failed', message);
      return;
    }

    const integration = await this.prisma.userIntegration.findUnique({
      where: { id: userIntegrationId },
    });

    if (!integration?.api_key_secret) {
      const message = `Batch ${batchId}: integration ${userIntegrationId} has no API key`;
      this.logger.error(message);
      await this.markBatchFailed(crawlRunId, 'failed', message);
      return;
    }

    const client = this.aiBatchClient.createClient(integration.api_key_secret);
    const batch = await this.aiBatchClient.retrieveBatch(client, batchId);

    if (!batch.output_file_id) {
      throw new Error(`Batch ${batchId} has no output file`);
    }

    const output = await this.aiBatchClient.downloadOutputFile(
      client,
      batch.output_file_id,
    );

    // batch_chunks[i] holds the ordered source_property_ids that were sent as chunk `i`
    // (custom_id = `chunk-${i}`) — this is what row.index positions are relative to.
    const chunks = Array.isArray(metadata.batch_chunks)
      ? (metadata.batch_chunks as string[][])
      : [];
    const pendingIds = new Set(chunks.flat());

    const allSourceProperties = await this.loadSourcePropertiesForNormalization(
      crawlRun.source_agency_id,
      crawlRun.started_at,
    );
    const sourceProperties = allSourceProperties.filter((sp) =>
      pendingIds.has(sp.id),
    );

    const normalizedBySourceId = new Map<string, NormalizedAiRow | null>();
    let inputTokens = 0;
    let outputTokens = 0;

    for (const line of output.split('\n').filter(Boolean)) {
      const parsed = this.propertyAiBatchService.parseBatchOutputLine(line);
      if (!parsed) continue;
      inputTokens += parsed.usage?.prompt_tokens ?? 0;
      outputTokens += parsed.usage?.completion_tokens ?? 0;

      const chunkIndex = Number(parsed.customId.replace('chunk-', ''));
      const ids = chunks[chunkIndex];
      if (!ids) continue;

      const matched = matchNormalizedRowsToIds(ids, parsed.rows);
      for (const [id, row] of matched) {
        normalizedBySourceId.set(id, row);
      }
    }

    const model =
      (metadata.ai_model as string) ?? crawlRun.ai_model ?? AiDefaults.model;

    const { affected: batchAffected } = await this.applyNormalizedResults({
      crawlRunId,
      sourceAgencyId: crawlRun.source_agency_id,
      crawlStartedAt: crawlRun.started_at,
      sourceProperties,
      normalizedBySourceId,
      model,
      provider: IntegrationType.OPENAI,
      openAiUsage: { inputTokens, outputTokens },
      userTrackedAgencyId: crawlRun.user_tracked_agency_id ?? undefined,
      isBatch: true,
      contentHashChanged: true,
    });

    const pendingAffected = this.loadPendingCmsSyncAffected(metadata);

    await this.finalizeCrawlNormalizationSync({
      crawlRunId,
      sourceAgencyId: crawlRun.source_agency_id,
      crawlStartedAt: crawlRun.started_at,
      userTrackedAgencyId: crawlRun.user_tracked_agency_id ?? undefined,
      scraperId: crawlRun.scraper_id ?? undefined,
      affected: [...pendingAffected, ...batchAffected],
    });

    await this.clearPendingCmsSyncAffected(crawlRunId);
    await this.setNormalizationStatus(crawlRunId, 'completed');
  }

  async markBatchFailed(
    crawlRunId: string,
    status: string,
    errorMessage: string,
  ): Promise<void> {
    const crawlRun = await this.prisma.crawlRun.findUnique({
      where: { id: crawlRunId },
    });
    const metadata = (crawlRun?.metadata ?? {}) as Record<string, unknown>;

    await this.prisma.crawlRun.update({
      where: { id: crawlRunId },
      data: {
        error_message: errorMessage,
        metadata: {
          ...metadata,
          ai_batch_status: status,
          normalization_status: 'failed',
        },
      },
    });

    if (typeof metadata.ai_batch_id === 'string') {
      await this.propertyAiBatchService.markBatchJobFailed(
        metadata.ai_batch_id,
        errorMessage,
      );
    }
  }

  private async finalizeCrawlNormalizationSync(params: {
    crawlRunId: string;
    sourceAgencyId: string;
    crawlStartedAt: Date;
    userTrackedAgencyId?: string;
    scraperId?: string;
    affected: SyncForPropertyResult[];
  }): Promise<void> {
    const removalStats = await this.detectRemovalsAndReappearances({
      crawlRunId: params.crawlRunId,
      sourceAgencyId: params.sourceAgencyId,
      crawlStartedAt: params.crawlStartedAt,
      userTrackedAgencyId: params.userTrackedAgencyId,
      scraperId: params.scraperId,
    });

    const allAffected = this.dedupeAffected([
      ...params.affected,
      ...removalStats.affected,
    ]);

    if (allAffected.length === 0) {
      return;
    }

    await this.syncAfterNormalization({
      crawlRunId: params.crawlRunId,
      scraperId: params.scraperId,
      affected: allAffected,
    });
  }

  // Consolidates what used to be an inline callback duplicated verbatim at
  // both call sites (crawl.processor.ts and ai-batch-complete.processor.ts).
  // Never rethrows — a CMS sync enqueue failure must not fail normalization
  // or block the finalize step that calls this.
  private async syncAfterNormalization(params: {
    crawlRunId: string;
    scraperId?: string;
    affected: SyncForPropertyResult[];
  }): Promise<void> {
    try {
      await this.cmsSyncOrchestratorService.planAndEnqueueCrawlSync(
        params.crawlRunId,
        params.affected.map(
          (a): AffectedUserProperty => ({
            user_property_id: a.user_property_id,
            change_type: toCmsSyncOperationType(a.change_type),
            user_property: undefined,
            content_changed: a.content_changed,
          }),
        ),
      );
    } catch (syncError) {
      const message =
        syncError instanceof Error ? syncError.message : String(syncError);
      this.logger.error(
        `Crawl ${params.crawlRunId}: CMS sync enqueue failed after normalization: ${message}`,
      );
      const crawlRun = await this.prisma.crawlRun.findUnique({
        where: { id: params.crawlRunId },
        select: {
          source_agency_id: true,
          source_agency: { select: { name: true } },
        },
      });
      const agencyName = crawlRun?.source_agency?.name ?? 'Unknown agency';
      this.notificationsService.create({
        type: NotificationType.CMS_SYNC_FAILURE,
        severity: NotificationSeverity.CRITICAL,
        title: `CMS sync enqueue failed — ${agencyName}`,
        message: `Crawl ${params.crawlRunId} for ${agencyName} normalized successfully but CMS sync enqueue failed: ${message}`,
        source_agency_id: crawlRun?.source_agency_id,
        scraper_id: params.scraperId,
        crawl_run_id: params.crawlRunId,
      });
    }
  }

  // Called by NormalizationChunkProcessor exactly once, after the last chunk
  // of a fanned-out crawl-run normalization has been accounted for (success
  // or terminal failure). Mirrors what normalizeForCrawlRun's non-chunked
  // branches do inline: detect removals, sync to CMS, flip
  // normalization_status. Once chunk-processing moved out of the crawl job's
  // own try/catch (crawl.processor.ts), this is the only place left that
  // would see a finalize-time failure — so it has to create the same
  // JobLog+notification pair crawl.processor.ts creates for an
  // enqueue-time failure, or that visibility is lost again.
  async finalizeNormalizationChunks(params: {
    crawlRunId: string;
    sourceAgencyId: string;
    crawlStartedAt: Date;
    userTrackedAgencyId?: string;
    scraperId?: string;
    affected: SyncForPropertyResult[];
    createdCount: number;
  }): Promise<void> {
    try {
      await this.finalizeCrawlNormalizationSync({
        crawlRunId: params.crawlRunId,
        sourceAgencyId: params.sourceAgencyId,
        crawlStartedAt: params.crawlStartedAt,
        userTrackedAgencyId: params.userTrackedAgencyId,
        scraperId: params.scraperId,
        affected: params.affected,
      });

      if (params.createdCount > 0) {
        const crawlRun = await this.prisma.crawlRun.findUnique({
          where: { id: params.crawlRunId },
          select: { ai_total_cost: true },
        });
        if (crawlRun?.ai_total_cost) {
          await this.prisma.crawlRun.update({
            where: { id: params.crawlRunId },
            data: {
              ai_average_cost_per_property:
                crawlRun.ai_total_cost.toNumber() / params.createdCount,
            },
          });
        }
      }

      await this.setNormalizationStatus(params.crawlRunId, 'completed');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Crawl run ${params.crawlRunId}: finalize after chunked normalization failed: ${message}`,
      );

      await this.setNormalizationStatus(params.crawlRunId, 'failed');
      await this.prisma.crawlRun.update({
        where: { id: params.crawlRunId },
        data: { error_message: message },
      });
      await this.prisma.jobLog.create({
        data: {
          queue_name: NORMALIZATION_QUEUE,
          job_name: 'normalize-finalize',
          status: JobStatus.FAILED,
          crawl_run_id: params.crawlRunId,
          finished_at: new Date(),
          error_message: message,
          stack_trace: stack ?? null,
        },
      });

      const crawlRun = await this.prisma.crawlRun.findUnique({
        where: { id: params.crawlRunId },
        select: { source_agency: { select: { name: true } } },
      });
      const agencyName = crawlRun?.source_agency?.name ?? 'Unknown agency';
      this.notificationsService.create({
        type: NotificationType.AI_NORMALIZATION_FAILURE,
        severity: NotificationSeverity.CRITICAL,
        title: 'Property normalization failed',
        message: `Crawl ${params.crawlRunId} for ${agencyName}: failed while finalizing normalization: ${message}`,
        source_agency_id: params.sourceAgencyId,
        scraper_id: params.scraperId,
        crawl_run_id: params.crawlRunId,
      });
    }
  }

  private dedupeAffected(
    affected: SyncForPropertyResult[],
  ): SyncForPropertyResult[] {
    const byUserPropertyId = new Map<string, SyncForPropertyResult>();

    for (const item of affected) {
      const existing = byUserPropertyId.get(item.user_property_id);
      if (
        !existing ||
        CMS_SYNC_CHANGE_PRIORITY[item.change_type] >
          CMS_SYNC_CHANGE_PRIORITY[existing.change_type]
      ) {
        byUserPropertyId.set(item.user_property_id, item);
      }
    }

    return [...byUserPropertyId.values()];
  }

  private loadPendingCmsSyncAffected(
    metadata: Record<string, unknown>,
  ): PendingCmsSyncAffected {
    const raw = metadata.pending_cms_sync_affected;
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw.filter(
      (item): item is SyncForPropertyResult =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as SyncForPropertyResult).user_property_id === 'string' &&
        typeof (item as SyncForPropertyResult).change_type === 'string' &&
        typeof (item as SyncForPropertyResult).user_tracked_agency_id ===
          'string',
    );
  }

  private async persistPendingCmsSyncAffected(
    crawlRunId: string,
    affected: PendingCmsSyncAffected,
  ): Promise<void> {
    const crawlRun = await this.prisma.crawlRun.findUnique({
      where: { id: crawlRunId },
      select: { metadata: true },
    });
    const metadata = (crawlRun?.metadata ?? {}) as Record<string, unknown>;

    await this.prisma.crawlRun.update({
      where: { id: crawlRunId },
      data: {
        metadata: {
          ...metadata,
          pending_cms_sync_affected: affected,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async clearPendingCmsSyncAffected(crawlRunId: string): Promise<void> {
    const crawlRun = await this.prisma.crawlRun.findUnique({
      where: { id: crawlRunId },
      select: { metadata: true },
    });
    const metadata = {
      ...((crawlRun?.metadata ?? {}) as Record<string, unknown>),
    };
    delete metadata.pending_cms_sync_affected;

    await this.prisma.crawlRun.update({
      where: { id: crawlRunId },
      data: { metadata: metadata as unknown as Prisma.InputJsonValue },
    });
  }

  private async resolveDefaultTrackerForAgency(sourceAgencyId: string) {
    return this.prisma.userTrackedAgency.findFirst({
      where: { source_agency_id: sourceAgencyId, enabled: true },
      orderBy: { created_at: 'asc' },
    });
  }

  private async loadSourcePropertiesForNormalization(
    sourceAgencyId: string,
    crawlStartedAt: Date,
  ): Promise<SourcePropertyRow[]> {
    return this.prisma.sourceProperty.findMany({
      where: {
        source_agency_id: sourceAgencyId,
        last_seen_at: { gte: crawlStartedAt },
      },
      orderBy: { last_seen_at: 'asc' },
    });
  }

  private toSourcePropertyRow(row: {
    id: string;
    source_url: string;
    property_id: string;
    internal_id: string | null;
    raw_title: string | null;
    raw_price: string | null;
    raw_location: string | null;
    raw_description: string | null;
    raw_property_type: string | null;
    raw_listing_type: string | null;
    raw_sqm: string | null;
    raw_bedrooms: string | null;
    raw_bathrooms: string | null;
    raw_data: unknown;
    content_hash: string | null;
  }): SourcePropertyRow {
    return {
      id: row.id,
      source_url: row.source_url,
      property_id: row.property_id,
      internal_id: row.internal_id,
      raw_title: row.raw_title,
      raw_price: row.raw_price,
      raw_location: row.raw_location,
      raw_description: row.raw_description,
      raw_property_type: row.raw_property_type,
      raw_listing_type: row.raw_listing_type,
      raw_sqm: row.raw_sqm,
      raw_bedrooms: row.raw_bedrooms,
      raw_bathrooms: row.raw_bathrooms,
      raw_data: row.raw_data,
      content_hash: row.content_hash,
    };
  }

  private async resolveLiveSourceProperty(
    sp: SourcePropertyRow,
    sourceAgencyId: string,
  ): Promise<SourcePropertyRow | null> {
    const byId = await this.prisma.sourceProperty.findUnique({
      where: { id: sp.id },
    });
    if (byId) return this.toSourcePropertyRow(byId);

    const byUrl = await this.prisma.sourceProperty.findUnique({
      where: {
        source_agency_id_source_url: {
          source_agency_id: sourceAgencyId,
          source_url: sp.source_url,
        },
      },
    });
    if (byUrl) {
      this.logger.warn(
        `source_property ${sp.id} missing; remapped to ${byUrl.id} via URL ${sp.source_url}`,
      );
      return this.toSourcePropertyRow(byUrl);
    }

    return null;
  }

  private async setNormalizationStatus(
    crawlRunId: string,
    status: 'running' | 'completed' | 'failed',
  ): Promise<void> {
    const crawlRun = await this.prisma.crawlRun.findUnique({
      where: { id: crawlRunId },
      select: { metadata: true },
    });
    const metadata = {
      ...((crawlRun?.metadata ?? {}) as Record<string, unknown>),
      normalization_status: status,
    };
    await this.prisma.crawlRun.update({
      where: { id: crawlRunId },
      data: { metadata: metadata as Prisma.InputJsonValue },
    });
  }

  private async normalizeSync(
    sourceProperties: SourcePropertyRow[],
    provider: IntegrationType,
    model: string,
    apiKey: string,
  ): Promise<{
    normalizedBySourceId: Map<string, NormalizedAiRow | null>;
    anthropicUsage?: NormalizationUsage;
    openAiUsage?: { inputTokens: number; outputTokens: number };
  }> {
    const normalizedBySourceId = new Map<string, NormalizedAiRow | null>();

    if (provider === IntegrationType.ANTHROPIC) {
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
      provider === IntegrationType.OPENAI
        ? AiProviders.openai
        : AiProviders.gemini;

    let inputTokens = 0;
    let outputTokens = 0;

    for (
      let i = 0;
      i < sourceProperties.length;
      i += NORMALIZATION_BATCH_SIZE
    ) {
      const chunk = sourceProperties.slice(i, i + NORMALIZATION_BATCH_SIZE);
      const ids = chunk.map((sp) => sp.id);

      try {
        const { rows, usage } = await this.normalizeOpenAiChunk(
          chunk,
          providerKey,
          model,
          apiKey,
        );
        inputTokens += usage.inputTokens;
        outputTokens += usage.outputTokens;

        const matched = matchNormalizedRowsToIds(ids, rows);
        for (const sp of chunk) {
          normalizedBySourceId.set(
            sp.id,
            matched.get(sp.id) ?? buildFallbackNormalizedRow(sp),
          );
        }
      } catch (chunkErr) {
        this.logger.warn(
          `OpenAI normalization chunk failed (${chunkErr instanceof Error ? chunkErr.message : chunkErr}), retrying individually`,
        );
        for (const sp of chunk) {
          try {
            const { rows, usage } = await this.normalizeOpenAiChunk(
              [sp],
              providerKey,
              model,
              apiKey,
            );
            inputTokens += usage.inputTokens;
            outputTokens += usage.outputTokens;
            normalizedBySourceId.set(
              sp.id,
              rows[0] ?? buildFallbackNormalizedRow(sp),
            );
          } catch {
            normalizedBySourceId.set(sp.id, buildFallbackNormalizedRow(sp));
          }
        }
      }
    }

    return {
      normalizedBySourceId,
      openAiUsage: { inputTokens, outputTokens },
    };
  }

  private async normalizeOpenAiChunk(
    chunk: SourcePropertyRow[],
    providerKey: AiProvider,
    model: string,
    apiKey: string,
  ): Promise<{
    rows: NormalizedAiRow[];
    usage: { inputTokens: number; outputTokens: number };
  }> {
    const { ai_raw_description_max_chars } =
      await this.platformConfigService.getNormalizationConfig();
    const input = buildNormalizationInput(chunk, {
      aiRawDescriptionMaxChars: ai_raw_description_max_chars,
    });
    const response = await this.aiService.generateText({
      provider: providerKey,
      model,
      apiKey,
      system: NORMALIZATION_STATIC_INSTRUCTIONS,
      prompt: buildNormalizationDynamicPrompt(input),
      maxTokens: 8192,
    });

    const usage = {
      inputTokens: response.usage?.inputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
    };

    const arrayMatch = response.response.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return { rows: JSON.parse(arrayMatch[0]) as NormalizedAiRow[], usage };
      } catch {
        // fall through to object-fallback below
      }
    }

    const objectMatch = response.response.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return { rows: [JSON.parse(objectMatch[0]) as NormalizedAiRow], usage };
      } catch {
        // fall through to empty rows below
      }
    }

    return { rows: [], usage };
  }

  // Per-chunk business logic for the NormalizationChunkProcessor. Happy path
  // only — throws on any failure (key resolution, the AI call itself) so the
  // processor can decide whether to let BullMQ retry the job or, on the
  // terminal attempt, degrade to applyFallbackForChunk instead.
  async processNormalizationChunk(
    data: NormalizationChunkJobData,
  ): Promise<{
    item: NormalizationChunkItemResult;
    affected: SyncForPropertyResult[];
  }> {
    const { apiKey } = await this.userIntegrationsService.resolveActiveApiKey(
      data.tracker_user_id,
      data.provider,
    );

    const rows = await this.prisma.sourceProperty.findMany({
      where: { id: { in: data.source_property_ids } },
    });
    const sourceProperties = rows.map((row) => this.toSourcePropertyRow(row));

    if (sourceProperties.length === 0) {
      return {
        item: this.emptyChunkResult(data.chunk_index, 'normalized'),
        affected: [],
      };
    }

    const providerKey =
      data.provider === IntegrationType.OPENAI
        ? AiProviders.openai
        : AiProviders.gemini;

    const { rows: aiRows, usage } = await this.normalizeOpenAiChunk(
      sourceProperties,
      providerKey,
      data.model,
      apiKey,
    );

    const matched = matchNormalizedRowsToIds(
      sourceProperties.map((sp) => sp.id),
      aiRows,
    );

    let fallbackCount = 0;
    const normalizedBySourceId = new Map<string, NormalizedAiRow | null>();
    for (const sp of sourceProperties) {
      const matchedRow = matched.get(sp.id);
      if (matchedRow) {
        normalizedBySourceId.set(sp.id, matchedRow);
      } else {
        fallbackCount++;
        normalizedBySourceId.set(sp.id, buildFallbackNormalizedRow(sp));
      }
    }

    const { affected, createdCount } = await this.applyNormalizedResults({
      crawlRunId: data.crawl_run_id,
      sourceAgencyId: data.source_agency_id,
      crawlStartedAt: new Date(data.crawl_started_at),
      sourceProperties,
      normalizedBySourceId,
      model: data.model,
      provider: data.provider,
      openAiUsage: usage,
      userTrackedAgencyId: data.user_tracked_agency_id,
      contentHashChanged: true,
      accumulateAiCost: true,
    });

    return {
      item: {
        chunk_index: data.chunk_index,
        status: 'normalized',
        normalized_count: sourceProperties.length - fallbackCount,
        fallback_count: fallbackCount,
        created_count: createdCount,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
      },
      affected,
    };
  }

  // Called only by the processor on a chunk's terminal BullMQ attempt, after
  // processNormalizationChunk has thrown on every retry. Never throws itself
  // — every property in the chunk still gets written via
  // buildFallbackNormalizedRow so nothing is silently dropped, same
  // graceful-degradation guarantee the old sequential loop had, just resolved
  // at the job level instead of a nested per-property retry loop.
  async applyFallbackForChunk(
    data: NormalizationChunkJobData,
    error: unknown,
  ): Promise<{
    item: NormalizationChunkItemResult;
    affected: SyncForPropertyResult[];
  }> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `Crawl ${data.crawl_run_id} chunk ${data.chunk_index}/${data.total_chunks}: normalization failed after retries, falling back to raw scraped data for ${data.source_property_ids.length} propert(y/ies): ${message}`,
    );

    const rows = await this.prisma.sourceProperty.findMany({
      where: { id: { in: data.source_property_ids } },
    });
    const sourceProperties = rows.map((row) => this.toSourcePropertyRow(row));

    if (sourceProperties.length === 0) {
      return {
        item: { ...this.emptyChunkResult(data.chunk_index, 'failed'), error: message },
        affected: [],
      };
    }

    const normalizedBySourceId = new Map<string, NormalizedAiRow | null>(
      sourceProperties.map((sp) => [sp.id, buildFallbackNormalizedRow(sp)]),
    );

    const { affected, createdCount } = await this.applyNormalizedResults({
      crawlRunId: data.crawl_run_id,
      sourceAgencyId: data.source_agency_id,
      crawlStartedAt: new Date(data.crawl_started_at),
      sourceProperties,
      normalizedBySourceId,
      model: data.model,
      provider: data.provider,
      userTrackedAgencyId: data.user_tracked_agency_id,
      contentHashChanged: true,
      accumulateAiCost: true,
    });

    return {
      item: {
        chunk_index: data.chunk_index,
        status: 'failed',
        normalized_count: 0,
        fallback_count: sourceProperties.length,
        created_count: createdCount,
        input_tokens: 0,
        output_tokens: 0,
        error: message,
      },
      affected,
    };
  }

  private emptyChunkResult(
    chunkIndex: number,
    status: NormalizationChunkItemResult['status'],
  ): NormalizationChunkItemResult {
    return {
      chunk_index: chunkIndex,
      status,
      normalized_count: 0,
      fallback_count: 0,
      created_count: 0,
      input_tokens: 0,
      output_tokens: 0,
    };
  }

  private async detectRemovalsAndReappearances(params: {
    crawlRunId: string;
    sourceAgencyId: string;
    crawlStartedAt: Date;
    userTrackedAgencyId?: string;
    scraperId?: string;
  }): Promise<{
    removedCount: number;
    totalTracked: number;
    affected: SyncForPropertyResult[];
  }> {
    const {
      crawlRunId,
      sourceAgencyId,
      crawlStartedAt,
      userTrackedAgencyId,
      scraperId,
    } = params;

    const coverageLookbackStart = new Date(
      crawlStartedAt.getTime() - 30 * 24 * 60 * 60 * 1000,
    );

    const [agencyProperties, crawlRun, recentCoverage] = await Promise.all([
      this.prisma.property.findMany({
        where: {
          source_links: {
            some: {
              source_property: { source_agency_id: sourceAgencyId },
            },
          },
        },
        include: {
          source_links: {
            include: {
              source_property: { select: { last_seen_at: true } },
            },
          },
        },
      }),
      this.prisma.crawlRun.findUnique({
        where: { id: crawlRunId },
        select: { total_found: true },
      }),
      this.prisma.crawlRun.aggregate({
        where: {
          source_agency_id: sourceAgencyId,
          status: CrawlRunStatus.SUCCESS,
          id: { not: crawlRunId },
          total_found: { gt: 0 },
          started_at: {
            gte: coverageLookbackStart,
            lt: crawlStartedAt,
          },
        },
        _max: { total_found: true },
      }),
    ]);

    const totalTracked = agencyProperties.length;
    const candidates = agencyProperties.filter((property) => {
      if (property.status === PropertyStatus.REMOVED) return false;
      return !property.source_links.some(
        (link) =>
          link.source_property.last_seen_at &&
          link.source_property.last_seen_at >= crawlStartedAt,
      );
    });

    if (candidates.length === 0) {
      return { removedCount: 0, totalTracked, affected: [] };
    }

    const foundThisCrawl = crawlRun?.total_found ?? 0;
    const baseline = recentCoverage._max.total_found ?? totalTracked;
    const coverageRatio = baseline > 0 ? foundThisCrawl / baseline : 1;
    const incompleteCoverage =
      baseline >= CRAWL_REMOVAL_COVERAGE_MIN_BASELINE &&
      coverageRatio < CRAWL_REMOVAL_COVERAGE_RATIO_THRESHOLD;

    if (incompleteCoverage) {
      this.logger.warn(
        `Crawl ${crawlRunId}: skipping removal detection — incomplete coverage (${foundThisCrawl}/${baseline}, ratio ${coverageRatio.toFixed(2)})`,
      );
      const agency = await this.prisma.sourceAgency.findUnique({
        where: { id: sourceAgencyId },
        select: { name: true },
      });
      const agencyName = agency?.name ?? 'Unknown agency';
      this.notificationsService.create({
        type: NotificationType.PROPERTY_REMOVAL_SPIKE,
        severity: NotificationSeverity.WARNING,
        title: `Property removal spike detected — ${agencyName} (incomplete crawl)`,
        message: `Crawl found only ${foundThisCrawl} of ~${baseline} listings (30-day high-water mark); skipped marking ${candidates.length} missing properties as removed.`,
        source_agency_id: sourceAgencyId,
        scraper_id: scraperId,
        crawl_run_id: crawlRunId,
      });
      return { removedCount: 0, totalTracked, affected: [] };
    }

    let soldWatermarkCheckEnabled = false;
    if (scraperId) {
      const scraper = await this.prisma.scraper.findUnique({
        where: { id: scraperId },
        select: { active_version: { select: { config: true } } },
      });
      const config = scraper?.active_version?.config as unknown as
        | ScraperConfig
        | undefined;
      soldWatermarkCheckEnabled = config?.sold_watermark_check === true;
    }

    const affected: SyncForPropertyResult[] = [];

    for (const property of candidates) {
      let newStatus: PropertyStatus = PropertyStatus.REMOVED;
      let changeType: PropertySyncChangeType = 'removed';

      if (soldWatermarkCheckEnabled) {
        const primaryImage = imagesArray(property.images)[0];
        if (primaryImage) {
          try {
            if (await detectSoldWatermark(primaryImage)) {
              newStatus = PropertyStatus.SOLD;
              changeType = 'sold';
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            this.logger.warn(
              `Sold-watermark check failed for property ${property.id}, falling back to REMOVED: ${message}`,
            );
          }
        }
      }

      await this.prisma.property.update({
        where: { id: property.id },
        data: { status: newStatus },
      });

      if (newStatus === PropertyStatus.SOLD) {
        await this.prisma.propertyHistory.create({
          data: {
            property_id: property.id,
            event_type: PropertyHistoryEventType.STATUS_CHANGED,
            field: 'status',
            old_value: property.status,
            new_value: newStatus,
            crawl_run_id: crawlRunId,
          },
        });
      } else {
        await this.prisma.propertyHistory.create({
          data: {
            property_id: property.id,
            event_type: PropertyHistoryEventType.REMOVED,
            crawl_run_id: crawlRunId,
          },
        });
      }

      const removalResults = await this.userPropertiesService.syncForProperty(
        property.id,
        {
          userTrackedAgencyId,
          sourceAgencyId,
          changeType,
        },
      );
      affected.push(...removalResults);
    }

    const removedCount = candidates.length;
    const removalRatio = totalTracked > 0 ? removedCount / totalTracked : 0;
    const isSpike =
      removedCount > PROPERTY_REMOVAL_SPIKE_ABSOLUTE_THRESHOLD ||
      removalRatio > PROPERTY_REMOVAL_SPIKE_RATIO_THRESHOLD;

    if (isSpike) {
      const agency = await this.prisma.sourceAgency.findUnique({
        where: { id: sourceAgencyId },
        select: { name: true },
      });
      const agencyName = agency?.name ?? 'Unknown agency';
      this.notificationsService.create({
        type: NotificationType.PROPERTY_REMOVAL_SPIKE,
        severity: NotificationSeverity.WARNING,
        title: `Property removal spike detected — ${agencyName}`,
        message: `${removedCount} of ${totalTracked} tracked properties were removed for ${agencyName} in crawl run ${crawlRunId}`,
        source_agency_id: sourceAgencyId,
        scraper_id: scraperId,
        crawl_run_id: crawlRunId,
      });
    }

    return { removedCount, totalTracked, affected };
  }

  private async resolveUserIdForCrawlRun(
    crawlRunId: string,
  ): Promise<string | null> {
    const crawlRun = await this.prisma.crawlRun.findUnique({
      where: { id: crawlRunId },
      select: {
        user_tracked_agency_id: true,
        user_tracked_agency: { select: { user_id: true } },
      },
    });
    return crawlRun?.user_tracked_agency?.user_id ?? null;
  }

  private async persistAiCosts(params: {
    crawlRunId: string | null;
    model: string;
    provider: IntegrationType;
    createdCount: number;
    anthropicUsage?: NormalizationUsage;
    openAiUsage?: { inputTokens: number; outputTokens: number };
    isBatch?: boolean;
    userId?: string | null;
    userPropertyId?: string | null;
    // When true, increment the crawl run's cost columns instead of
    // overwriting them (this call is one of several chunks contributing to
    // the same run) and skip ai_average_cost_per_property, which isn't
    // additive — the caller computes it once, after every chunk is in.
    accumulate?: boolean;
  }): Promise<void> {
    if (
      params.provider === IntegrationType.ANTHROPIC &&
      params.anthropicUsage
    ) {
      const report = buildAnthropicCostReport(
        params.anthropicUsage,
        params.model,
        {
          aiNormalizedCount: params.createdCount,
        },
      );
      if (params.crawlRunId) {
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
      }

      const userId =
        params.userId ??
        (params.crawlRunId
          ? await this.resolveUserIdForCrawlRun(params.crawlRunId)
          : null);
      await this.costLogsService.record({
        userId,
        operationType: CostOperationType.NORMALIZATION,
        provider: params.provider,
        model: report.model,
        inputQuantity: report.input_tokens,
        outputQuantity: report.output_tokens,
        inputCost: report.input_cost,
        outputCost: report.output_cost,
        totalCost: report.total_cost,
        crawlRunId: params.crawlRunId,
        userPropertyId: params.userPropertyId,
        metadata: { created_count: params.createdCount },
      });
      return;
    }

    if (params.openAiUsage) {
      const cost = calculateAiCost({
        provider: AiProviders.openai,
        model: params.model,
        inputTokens: params.openAiUsage.inputTokens,
        outputTokens: params.openAiUsage.outputTokens,
        isBatch: params.isBatch,
      });

      if (params.crawlRunId) {
        await this.prisma.crawlRun.update({
          where: { id: params.crawlRunId },
          data: params.accumulate
            ? {
                ai_model: params.model,
                ai_input_tokens: { increment: cost.inputTokens },
                ai_output_tokens: { increment: cost.outputTokens },
                ai_input_cost: { increment: cost.inputCost },
                ai_output_cost: { increment: cost.outputCost },
                ai_total_cost: { increment: cost.totalCost },
              }
            : {
                ai_model: params.model,
                ai_input_tokens: cost.inputTokens,
                ai_output_tokens: cost.outputTokens,
                ai_input_cost: cost.inputCost,
                ai_output_cost: cost.outputCost,
                ai_total_cost: cost.totalCost,
                ai_average_cost_per_property:
                  params.createdCount > 0
                    ? cost.totalCost / params.createdCount
                    : null,
              },
        });
      }

      const userId =
        params.userId ??
        (params.crawlRunId
          ? await this.resolveUserIdForCrawlRun(params.crawlRunId)
          : null);
      await this.costLogsService.record({
        userId,
        operationType: CostOperationType.NORMALIZATION,
        provider: params.provider,
        model: params.model,
        inputQuantity: cost.inputTokens,
        outputQuantity: cost.outputTokens,
        inputCost: cost.inputCost,
        outputCost: cost.outputCost,
        totalCost: cost.totalCost,
        crawlRunId: params.crawlRunId,
        userPropertyId: params.userPropertyId,
        metadata: {
          created_count: params.createdCount,
          is_batch: params.isBatch ?? false,
        },
      });
    }
  }
}
