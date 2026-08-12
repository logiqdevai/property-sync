import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CMS_SYNC_QUEUE } from '@/core/queues/queues.constants';
import { CmsSyncRunsService } from '@/modules/cms-sync-runs/cms-sync-runs.service';
import { EstateWebIntegrationResolverService } from '@/integrations/estateweb/services/estateweb-integration-resolver.service';
import { EstateWebPropertyService } from '@/integrations/estateweb/services/estateweb-property.service';
import { isNotFoundEstateWebError } from '@/integrations/estateweb/utils/estateweb-error.util';
import { ContentProductionService } from '@/modules/content-publishing/services/content-production.service';
import {
  AffectedUserProperty,
  CmsSyncBatch,
  CmsSyncOperationType,
} from '../interfaces/cms-sync-batch.interface';
import { CmsSyncJobData } from '../interfaces/cms-sync-job.interface';
import { CmsSyncBatchService } from './cms-sync-batch.service';
import { IntegrationType, PropertyStatus } from 'generated/prisma';

const DEFAULT_MAX_ATTEMPTS = 3;

interface ProcessTrackerBatchOptions {
  includeUpdatesRegardlessOfAuto?: boolean;
}

interface TrackerGroup {
  tracker: {
    id: string;
    user_id: string;
    source_agency_id: string;
    track_new_listings: boolean;
    track_updated_listings: boolean;
    track_removed_listings: boolean;
    auto_update_to_crm: boolean;
    concurrent_insertions: number;
    insertion_interval_seconds: number;
    max_properties: number | null;
  };
  affected: AffectedUserProperty[];
}

@Injectable()
export class CmsSyncOrchestratorService {
  private readonly logger = new Logger(CmsSyncOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly batchService: CmsSyncBatchService,
    private readonly cmsSyncRunsService: CmsSyncRunsService,
    private readonly estateWebResolver: EstateWebIntegrationResolverService,
    private readonly estateWebPropertyService: EstateWebPropertyService,
    private readonly contentProductionService: ContentProductionService,
    @InjectQueue(CMS_SYNC_QUEUE)
    private readonly cmsSyncQueue: Queue<CmsSyncJobData>,
  ) {}

  async planAndEnqueueCrawlSync(
    crawlRunId: string,
    affected: AffectedUserProperty[],
    options?: { skipContentProduction?: boolean },
  ): Promise<void> {
    if (affected.length === 0) {
      this.logger.log(
        `Crawl ${crawlRunId}: no affected user properties for CMS sync`,
      );
      return;
    }

    this.logger.log(
      `Crawl ${crawlRunId}: planning CMS sync for ${affected.length} affected user properties`,
    );

    const readyAffected = options?.skipContentProduction
      ? affected
      : await this.filterReadyAfterContentProduction(affected, {
          crawlRunId,
          forceSyncAi: false,
        });

    if (readyAffected.length === 0) {
      this.logger.log(
        `Crawl ${crawlRunId}: all properties pending content AI batch; CMS sync deferred`,
      );
      return;
    }

    const byTracker = await this.groupByTracker(readyAffected);

    for (const trackerGroup of byTracker) {
      await this.processTrackerBatch(crawlRunId, trackerGroup);
    }
  }

  async planAndEnqueueTitleBatchReady(
    crawlRunId: string | null,
    readyIds: string[],
    changeTypesByPropertyId: Record<string, string>,
  ): Promise<void> {
    if (!readyIds.length) return;

    const affected: AffectedUserProperty[] = readyIds.map((id) => ({
      user_property_id: id,
      change_type: this.toOperationType(changeTypesByPropertyId[id]),
    }));

    if (crawlRunId) {
      await this.planAndEnqueueCrawlSync(crawlRunId, affected, {
        skipContentProduction: true,
      });
      return;
    }

    const properties = await this.prisma.userProperty.findMany({
      where: { id: { in: readyIds } },
      select: { id: true, user_id: true },
    });
    const byUser = new Map<string, string[]>();
    for (const property of properties) {
      const list = byUser.get(property.user_id) ?? [];
      list.push(property.id);
      byUser.set(property.user_id, list);
    }
    for (const [userId, ids] of byUser) {
      await this.planAndEnqueueManualPropertyUpdate(userId, ids, {
        skipContentProduction: true,
      });
    }
  }

  async planAndEnqueueBackfill(userTrackedAgencyId: string): Promise<void> {
    const tracker = await this.prisma.userTrackedAgency.findUnique({
      where: { id: userTrackedAgencyId },
      include: {
        integration_link: {
          include: {
            user_integration: {
              include: { integration_target: true },
            },
          },
        },
      },
    });

    if (!tracker) {
      throw new Error(`Tracker ${userTrackedAgencyId} not found`);
    }
    if (!tracker.enabled) return;
    if (!tracker.track_new_listings) return;

    const link = tracker.integration_link;
    if (!link) return;

    const integration = link.user_integration;
    if (!integration.is_active) return;
    if (!integration.integration_target.is_enabled) return;
    if (
      integration.integration_target.integration_type !==
      IntegrationType.ESTATEWEB
    )
      return;

    const userProperties = await this.prisma.userProperty.findMany({
      where: {
        user_id: tracker.user_id,
        status: { not: PropertyStatus.REMOVED },
      },
      include: {
        canonical_property: {
          include: {
            source_links: {
              include: {
                source_property: { select: { source_agency_id: true } },
              },
            },
          },
        },
      },
    });

    const filtered = userProperties.filter((up) =>
      up.canonical_property.source_links.some(
        (sl) =>
          sl.source_property.source_agency_id === tracker.source_agency_id,
      ),
    );

    if (filtered.length === 0) {
      this.logger.log(
        `Backfill ${userTrackedAgencyId}: no active user properties for CMS sync`,
      );
      return;
    }

    const affected: AffectedUserProperty[] = filtered.map((up) => ({
      user_property_id: up.id,
      change_type: 'CREATE',
      user_property: up,
    }));

    const readyAffected = await this.filterReadyAfterContentProduction(
      affected,
      {
        crawlRunId: null,
        forceSyncAi: false,
      },
    );

    if (readyAffected.length === 0) {
      this.logger.log(
        `Backfill ${userTrackedAgencyId}: all properties pending content AI batch; CMS sync deferred`,
      );
      return;
    }

    const trackerGroup: TrackerGroup = {
      tracker: {
        id: tracker.id,
        user_id: tracker.user_id,
        source_agency_id: tracker.source_agency_id,
        track_new_listings: tracker.track_new_listings,
        track_updated_listings: tracker.track_updated_listings,
        track_removed_listings: tracker.track_removed_listings,
        auto_update_to_crm: tracker.auto_update_to_crm,
        concurrent_insertions: tracker.concurrent_insertions,
        insertion_interval_seconds: tracker.insertion_interval_seconds,
        max_properties: tracker.max_properties,
      },
      affected: readyAffected,
    };

    await this.processTrackerBatch(null, trackerGroup);

    this.logger.log(
      `Backfill ${userTrackedAgencyId}: enqueued CMS sync for ${readyAffected.length} property(s)`,
    );
  }

  async linkAndBackfill(
    userIntegrationId: string,
    userTrackedAgencyId: string,
    options?: { testConnection?: boolean },
  ): Promise<void> {
    const integration = await this.prisma.userIntegration.findUnique({
      where: { id: userIntegrationId },
      include: { integration_target: true },
    });
    if (!integration?.is_active) {
      throw new Error('Integration not found or inactive');
    }
    if (!integration.integration_target.is_enabled) {
      throw new Error('Integration target is disabled');
    }
    if (
      integration.integration_target.integration_type !==
      IntegrationType.ESTATEWEB
    ) {
      throw new Error('Only EstateWeb integrations support CMS sync');
    }

    const tracker = await this.prisma.userTrackedAgency.findUnique({
      where: { id: userTrackedAgencyId },
    });
    if (!tracker?.enabled) {
      throw new Error('Tracked agency not found or disabled');
    }
    if (tracker.user_id !== integration.user_id) {
      throw new Error(
        'Tracked agency and integration belong to different users',
      );
    }

    await this.prisma.userTrackedAgencyIntegrationLink.upsert({
      where: { user_tracked_agency_id: userTrackedAgencyId },
      create: {
        user_tracked_agency_id: userTrackedAgencyId,
        user_integration_id: userIntegrationId,
      },
      update: { user_integration_id: userIntegrationId },
    });

    if (options?.testConnection !== false) {
      await this.estateWebResolver.testConnection(
        userIntegrationId,
        integration.user_id,
      );
    }

    await this.planAndEnqueueBackfill(userTrackedAgencyId);
  }

  private async groupByTracker(
    affected: AffectedUserProperty[],
  ): Promise<TrackerGroup[]> {
    const userPropertyIds = affected.map((a) => a.user_property_id);
    const rows = await this.prisma.userProperty.findMany({
      where: { id: { in: userPropertyIds } },
      select: {
        id: true,
        user_id: true,
        canonical_property_id: true,
      },
    });

    const userIdByPropertyId = new Map(rows.map((r) => [r.id, r.user_id]));
    const canonicalIdByPropertyId = new Map(
      rows.map((r) => [r.id, r.canonical_property_id]),
    );

    const canonicalIds = [...new Set(canonicalIdByPropertyId.values())];
    const trackers = await this.prisma.userTrackedAgency.findMany({
      where: {
        user_id: { in: [...new Set(userIdByPropertyId.values())] },
        enabled: true,
      },
      include: {
        integration_link: {
          include: {
            user_integration: {
              include: {
                integration_target: true,
              },
            },
          },
        },
      },
    });

    const trackerByUserAgency = new Map(
      trackers.map((t) => [`${t.user_id}:${t.source_agency_id}`, t]),
    );

    const sourceAgencyByCanonicalId = new Map<string, string>();
    const canonicalProperties = await this.prisma.property.findMany({
      where: { id: { in: canonicalIds } },
      include: {
        source_links: {
          include: { source_property: { select: { source_agency_id: true } } },
        },
      },
    });
    for (const canonical of canonicalProperties) {
      const primary = canonical.source_links[0];
      if (primary) {
        sourceAgencyByCanonicalId.set(
          canonical.id,
          primary.source_property.source_agency_id,
        );
      }
    }

    const grouped = new Map<string, TrackerGroup>();

    for (const item of affected) {
      const userId = userIdByPropertyId.get(item.user_property_id);
      const canonicalId = canonicalIdByPropertyId.get(item.user_property_id);
      const sourceAgencyId = canonicalId
        ? sourceAgencyByCanonicalId.get(canonicalId)
        : undefined;

      if (!userId || !sourceAgencyId) continue;

      const tracker = trackerByUserAgency.get(`${userId}:${sourceAgencyId}`);
      if (!tracker) continue;

      const link = tracker.integration_link;
      if (!link) continue;

      const integration = link.user_integration;
      if (!integration.is_active) continue;
      if (!integration.integration_target.is_enabled) continue;
      if (
        integration.integration_target.integration_type !==
        IntegrationType.ESTATEWEB
      )
        continue;

      const group = grouped.get(tracker.id) ?? {
        tracker: {
          id: tracker.id,
          user_id: tracker.user_id,
          source_agency_id: tracker.source_agency_id,
          track_new_listings: tracker.track_new_listings,
          track_updated_listings: tracker.track_updated_listings,
          track_removed_listings: tracker.track_removed_listings,
          auto_update_to_crm: tracker.auto_update_to_crm,
          concurrent_insertions: tracker.concurrent_insertions,
          insertion_interval_seconds: tracker.insertion_interval_seconds,
          max_properties: tracker.max_properties,
        },
        affected: [],
      };

      group.affected.push(item);
      grouped.set(tracker.id, group);
    }

    return [...grouped.values()];
  }

  async planAndEnqueueManualPropertyUpdate(
    userId: string,
    userPropertyIds: string | string[],
    options?: { skipContentProduction?: boolean; forceSyncAi?: boolean },
  ): Promise<{
    queued: number;
    batches_enqueued: number;
    failed: Array<{ user_property_id: string; error: string }>;
  }> {
    const ids = [...new Set(Array.isArray(userPropertyIds) ? userPropertyIds : [userPropertyIds])];
    if (ids.length === 0) {
      throw new Error('No properties selected');
    }

    const userProperties = await this.prisma.userProperty.findMany({
      where: { id: { in: ids }, user_id: userId },
      include: {
        canonical_property: {
          include: {
            source_links: {
              include: {
                source_property: { select: { source_agency_id: true } },
              },
            },
          },
        },
      },
    });

    const foundIds = new Set(userProperties.map((p) => p.id));
    const failed: Array<{ user_property_id: string; error: string }> = [];

    for (const id of ids) {
      if (!foundIds.has(id)) {
        failed.push({ user_property_id: id, error: 'Property not found' });
      }
    }

    let eligibleProperties = userProperties;
    if (!options?.skipContentProduction) {
      const changeTypesByPropertyId = Object.fromEntries(
        userProperties.map((property) => [
          property.id,
          property.integration_property_id ? 'UPDATE' : 'CREATE',
        ]),
      );
      const produced =
        await this.contentProductionService.produceForUserProperties(
          userProperties.map((property) => property.id),
          {
            forceSyncAi: options?.forceSyncAi ?? true,
            changeTypesByPropertyId,
          },
        );
      const readySet = new Set(produced.readyIds);
      for (const id of produced.pendingBatchIds) {
        failed.push({
          user_property_id: id,
          error:
            'Content AI batch pending; CMS sync deferred until batch completes',
        });
      }
      eligibleProperties = userProperties.filter((property) =>
        readySet.has(property.id),
      );
    }

    const byTracker = new Map<
      string,
      {
        tracker: TrackerGroup['tracker'] & {
          integration_link: {
            user_integration_id: string;
            user_integration: {
              is_active: boolean;
              integration_target: {
                is_enabled: boolean;
                integration_type: IntegrationType;
              };
            };
          } | null;
        };
        affected: AffectedUserProperty[];
      }
    >();

    for (const userProperty of eligibleProperties) {
      const sourceAgencyId =
        userProperty.canonical_property.source_links[0]?.source_property
          .source_agency_id;

      if (!sourceAgencyId) {
        failed.push({
          user_property_id: userProperty.id,
          error: 'Property has no source agency',
        });
        continue;
      }

      const operation: CmsSyncOperationType = userProperty.integration_property_id
        ? 'UPDATE'
        : 'CREATE';

      let entry = byTracker.get(sourceAgencyId);
      if (!entry) {
        const tracker = await this.prisma.userTrackedAgency.findUnique({
          where: {
            user_id_source_agency_id: {
              user_id: userId,
              source_agency_id: sourceAgencyId,
            },
          },
          include: {
            integration_link: {
              include: {
                user_integration: {
                  include: { integration_target: true },
                },
              },
            },
          },
        });

        if (!tracker?.enabled) {
          failed.push({
            user_property_id: userProperty.id,
            error: 'Agency is not being tracked',
          });
          continue;
        }

        entry = {
          tracker: {
            id: tracker.id,
            user_id: tracker.user_id,
            source_agency_id: tracker.source_agency_id,
            track_new_listings: true,
            track_updated_listings: true,
            track_removed_listings: tracker.track_removed_listings,
            auto_update_to_crm: tracker.auto_update_to_crm,
            concurrent_insertions: tracker.concurrent_insertions,
            insertion_interval_seconds: tracker.insertion_interval_seconds,
            max_properties: tracker.max_properties,
            integration_link: tracker.integration_link,
          },
          affected: [],
        };
        byTracker.set(sourceAgencyId, entry);
      }

      let resolvedOperation = operation;
      const link = entry.tracker.integration_link;
      if (
        resolvedOperation === 'UPDATE' &&
        userProperty.integration_property_id &&
        link
      ) {
        let belongsToLinkedAccount: boolean;
        try {
          belongsToLinkedAccount = await this.listingBelongsToLinkedIntegration(
            link.user_integration_id,
            userProperty.integration_property_id,
            userProperty.internal_id,
          );
        } catch (error) {
          failed.push({
            user_property_id: userProperty.id,
            error: `Failed to verify EstateWeb listing ownership: ${error instanceof Error ? error.message : String(error)}`,
          });
          continue;
        }

        if (!belongsToLinkedAccount) {
          await this.prisma.userProperty.update({
            where: { id: userProperty.id },
            data: { integration_property_id: null },
          });
          userProperty.integration_property_id = null;
          resolvedOperation = 'CREATE';
        }
      }

      if (
        resolvedOperation === 'CREATE' &&
        userProperty.status === PropertyStatus.REMOVED
      ) {
        failed.push({
          user_property_id: userProperty.id,
          error: 'Cannot push a removed property that is not in the CMS',
        });
        continue;
      }

      entry.affected.push({
        user_property_id: userProperty.id,
        change_type: resolvedOperation,
        user_property: userProperty,
      });
    }

    let queued = 0;
    let batchesEnqueued = 0;

    for (const entry of byTracker.values()) {
      const link = entry.tracker.integration_link;
      if (!link) {
        for (const item of entry.affected) {
          failed.push({
            user_property_id: item.user_property_id,
            error:
              'No EstateWeb CMS linked to this tracked agency. Connect and link an integration first.',
          });
        }
        continue;
      }

      const integration = link.user_integration;
      if (!integration.is_active) {
        for (const item of entry.affected) {
          failed.push({
            user_property_id: item.user_property_id,
            error: 'Linked EstateWeb integration is inactive',
          });
        }
        continue;
      }
      if (!integration.integration_target.is_enabled) {
        for (const item of entry.affected) {
          failed.push({
            user_property_id: item.user_property_id,
            error: 'EstateWeb integration target is disabled',
          });
        }
        continue;
      }
      if (
        integration.integration_target.integration_type !==
        IntegrationType.ESTATEWEB
      ) {
        for (const item of entry.affected) {
          failed.push({
            user_property_id: item.user_property_id,
            error: 'Only EstateWeb CMS push is supported',
          });
        }
        continue;
      }

      const enqueued = await this.processTrackerBatch(
        null,
        {
          tracker: {
            id: entry.tracker.id,
            user_id: entry.tracker.user_id,
            source_agency_id: entry.tracker.source_agency_id,
            track_new_listings: entry.tracker.track_new_listings,
            track_updated_listings: entry.tracker.track_updated_listings,
            track_removed_listings: entry.tracker.track_removed_listings,
            auto_update_to_crm: entry.tracker.auto_update_to_crm,
            concurrent_insertions: entry.tracker.concurrent_insertions,
            insertion_interval_seconds:
              entry.tracker.insertion_interval_seconds,
            max_properties: entry.tracker.max_properties,
          },
          affected: entry.affected,
        },
        {
          includeUpdatesRegardlessOfAuto: true,
        },
      );

      if (!enqueued) {
        for (const item of entry.affected) {
          failed.push({
            user_property_id: item.user_property_id,
            error:
              item.change_type === 'CREATE'
                ? 'Property was not pushed. Max CMS property limit may be reached.'
                : 'Property was not pushed. The sync batch produced no operations.',
          });
        }
        continue;
      }

      queued += entry.affected.length;
      batchesEnqueued += 1;
    }

    if (queued === 0) {
      const firstError = failed[0]?.error ?? 'No properties could be pushed';
      throw new Error(
        failed.length === 1
          ? firstError
          : `None of the ${ids.length} properties could be pushed. ${firstError}`,
      );
    }

    return {
      queued,
      batches_enqueued: batchesEnqueued,
      failed,
    };
  }

  private async processTrackerBatch(
    crawlRunId: string | null,
    trackerGroup: TrackerGroup,
    options?: ProcessTrackerBatchOptions,
  ): Promise<boolean> {
    const tracker = trackerGroup.tracker;
    const logLabel = crawlRunId ? `Crawl ${crawlRunId}` : `Tracker ${tracker.id} (no crawl)`;

    const heldBackUpdates = trackerGroup.affected.filter(
      (a) =>
        a.change_type === 'UPDATE' &&
        tracker.track_updated_listings &&
        !tracker.auto_update_to_crm &&
        !options?.includeUpdatesRegardlessOfAuto,
    );

    if (heldBackUpdates.length > 0) {
      await this.prisma.userProperty.updateMany({
        where: {
          id: { in: heldBackUpdates.map((a) => a.user_property_id) },
        },
        data: { pending_crm_update: true },
      });
    }

    const filtered = trackerGroup.affected.filter((a) =>
      this.isChangeTypeEnabled(a.change_type, tracker, options),
    );

    if (filtered.length === 0) {
      this.logger.log(`${logLabel}: tracker ${tracker.id} has no CMS operations`);
      return false;
    }

    const integration = await this.resolveLinkedIntegration(tracker.id);
    if (!integration) {
      return false;
    }

    const builtBatch = await this.batchService.buildBatch({
      crawl_run_id: crawlRunId,
      user_integration_id: integration.userIntegrationId,
      user_tracked_agency_id: tracker.id,
      source_agency_id: tracker.source_agency_id,
      concurrent_insertions: tracker.concurrent_insertions,
      insertion_interval_seconds: tracker.insertion_interval_seconds,
      max_properties: tracker.max_properties,
      affected: filtered,
    });
    const batch: CmsSyncBatch = builtBatch;

    if (batch.operations.length === 0) {
      return false;
    }

    const cmsSyncRun = await this.cmsSyncRunsService.createBatch({
      crawlRunId,
      userIntegrationId: integration.userIntegrationId,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      payload: this.serializeBatchPayload(batch),
    });

    const jobEnqueued = await this.enqueueCmsSyncJob({
      cmsSyncRunId: cmsSyncRun.id,
      userTrackedAgencyId: tracker.id,
      userIntegrationId: integration.userIntegrationId,
      crawlRunId,
    });

    if (jobEnqueued) {
      this.logger.log(
        `${logLabel}: enqueued CMS sync run ${cmsSyncRun.id} for tracker ${tracker.id} with ${batch.operations.length} operation(s)`,
      );
    } else {
      this.logger.log(
        `${logLabel}: CMS sync run ${cmsSyncRun.id} for tracker ${tracker.id} already queued/active; skipped duplicate enqueue`,
      );
    }

    return true;
  }

  // `createBatch` upserts the same CmsSyncRun row for repeated calls with the same
  // (crawl_run_id, user_integration_id) -- e.g. content becoming CMS-ready in multiple waves for
  // one crawl -- so without this guard each wave would add its own BullMQ job and the worker
  // would reprocess the same operations more than once, double-pushing CREATEs to the CMS (each
  // execution re-reads the row fresh, so a job that's still waiting/active will pick up the
  // latest payload on its own -- adding another job for it only duplicates the work).
  private async enqueueCmsSyncJob(params: {
    cmsSyncRunId: string;
    userTrackedAgencyId: string;
    userIntegrationId: string;
    crawlRunId: string | null;
  }): Promise<boolean> {
    const jobId = `cms-sync:${params.cmsSyncRunId}`;
    const existing = await this.cmsSyncQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'active' || state === 'waiting' || state === 'delayed') {
        return false;
      }
      await existing.remove().catch(() => undefined);
    }

    await this.cmsSyncQueue.add(
      'cms-sync',
      {
        cms_sync_run_id: params.cmsSyncRunId,
        user_tracked_agency_id: params.userTrackedAgencyId,
        user_integration_id: params.userIntegrationId,
        crawl_run_id: params.crawlRunId,
      },
      { jobId, removeOnComplete: true, removeOnFail: true },
    );
    return true;
  }

  private async resolveLinkedIntegration(userTrackedAgencyId: string): Promise<{
    userIntegrationId: string;
    integrationType: IntegrationType;
  } | null> {
    const link = await this.prisma.userTrackedAgencyIntegrationLink.findUnique({
      where: { user_tracked_agency_id: userTrackedAgencyId },
      include: {
        user_integration: {
          include: { integration_target: true },
        },
      },
    });

    if (!link) return null;

    return {
      userIntegrationId: link.user_integration_id,
      integrationType:
        link.user_integration.integration_target.integration_type,
    };
  }

  private isChangeTypeEnabled(
    changeType: CmsSyncOperationType,
    tracker: TrackerGroup['tracker'],
    options?: ProcessTrackerBatchOptions,
  ): boolean {
    switch (changeType) {
      case 'CREATE':
        return tracker.track_new_listings;
      case 'UPDATE':
        if (!tracker.track_updated_listings) return false;
        if (options?.includeUpdatesRegardlessOfAuto) return true;
        return tracker.auto_update_to_crm;
      case 'REMOVE':
        return tracker.track_removed_listings;
    }
  }

  private async listingBelongsToLinkedIntegration(
    userIntegrationId: string,
    integrationPropertyId: string,
    internalId: string | null,
  ): Promise<boolean> {
    try {
      const listing = await this.estateWebPropertyService.getProperty(
        userIntegrationId,
        integrationPropertyId,
      );
      if (!internalId?.trim()) {
        return true;
      }
      const listingCode = listing.code?.trim().toLowerCase() ?? '';
      return listingCode === internalId.trim().toLowerCase();
    } catch (error) {
      if (isNotFoundEstateWebError(error)) {
        return false;
      }
      throw error;
    }
  }

  private serializeBatchPayload(batch: CmsSyncBatch): Record<string, unknown> {
    return {
      user_tracked_agency_id: batch.user_tracked_agency_id,
      user_integration_id: batch.user_integration_id,
      source_agency_id: batch.source_agency_id,
      concurrent_insertions: batch.concurrent_insertions,
      insertion_interval_seconds: batch.insertion_interval_seconds,
      user_property_ids: batch.user_property_ids,
      operations: batch.operations.map((op) => ({
        user_property_id: op.user_property_id,
        operation: op.operation,
        duplicate_group_id: op.duplicate_group_id,
        is_representative: op.is_representative,
        skipped_sibling_ids: op.skipped_sibling_ids,
      })),
    };
  }

  private async filterReadyAfterContentProduction(
    affected: AffectedUserProperty[],
    options: { crawlRunId: string | null; forceSyncAi: boolean },
  ): Promise<AffectedUserProperty[]> {
    const removable = affected.filter((item) => item.change_type === 'REMOVE');
    const contentAffected = affected.filter(
      (item) => item.change_type !== 'REMOVE',
    );

    if (!contentAffected.length) {
      return removable;
    }

    const changeTypesByPropertyId = Object.fromEntries(
      contentAffected.map((item) => [item.user_property_id, item.change_type]),
    );

    const produced =
      await this.contentProductionService.produceForUserProperties(
        contentAffected.map((item) => item.user_property_id),
        {
          crawlRunId: options.crawlRunId,
          forceSyncAi: options.forceSyncAi,
          changeTypesByPropertyId,
        },
      );

    if (produced.pendingBatchIds.length) {
      this.logger.log(
        `Content AI batch pending for ${produced.pendingBatchIds.length} properties; CMS sync deferred for those`,
      );
    }

    const readySet = new Set(produced.readyIds);
    return [
      ...removable,
      ...contentAffected.filter((item) => readySet.has(item.user_property_id)),
    ];
  }

  private toOperationType(value: string | undefined): CmsSyncOperationType {
    if (value === 'CREATE' || value === 'UPDATE' || value === 'REMOVE') {
      return value;
    }
    return 'UPDATE';
  }
}
