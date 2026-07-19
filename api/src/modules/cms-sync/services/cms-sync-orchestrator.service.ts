import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CMS_SYNC_QUEUE } from '@/core/queues/queues.constants';
import { CrawlRunsService } from '@/modules/crawl-runs/crawl-runs.service';
import { CmsSyncRunsService } from '@/modules/cms-sync-runs/cms-sync-runs.service';
import { EstateWebIntegrationResolverService } from '@/integrations/estateweb/services/estateweb-integration-resolver.service';
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
    insertion_interval_minutes: number;
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
    private readonly crawlRunsService: CrawlRunsService,
    private readonly estateWebResolver: EstateWebIntegrationResolverService,
    @InjectQueue(CMS_SYNC_QUEUE)
    private readonly cmsSyncQueue: Queue<CmsSyncJobData>,
  ) {}

  async planAndEnqueueCrawlSync(
    crawlRunId: string,
    affected: AffectedUserProperty[],
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

    const byTracker = await this.groupByTracker(affected);

    for (const trackerGroup of byTracker) {
      await this.processTrackerBatch(crawlRunId, trackerGroup);
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

    const crawlRun = await this.crawlRunsService.createBackfillRun(
      tracker.source_agency_id,
      tracker.id,
    );

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
        insertion_interval_minutes: tracker.insertion_interval_minutes,
        max_properties: tracker.max_properties,
      },
      affected,
    };

    await this.processTrackerBatch(crawlRun.id, trackerGroup);

    this.logger.log(
      `Backfill ${userTrackedAgencyId}: enqueued CMS sync for ${affected.length} property(s) via crawl run ${crawlRun.id}`,
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
          insertion_interval_minutes: tracker.insertion_interval_minutes,
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
    userPropertyId: string,
  ): Promise<void> {
    const userProperty = await this.prisma.userProperty.findFirst({
      where: { id: userPropertyId, user_id: userId },
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

    if (!userProperty) {
      throw new Error('Property not found');
    }
    if (!userProperty.integration_property_id) {
      throw new Error('Property is not in the CRM yet');
    }

    const sourceAgencyId =
      userProperty.canonical_property.source_links[0]?.source_property
        .source_agency_id;
    if (!sourceAgencyId) {
      throw new Error('Property has no source agency');
    }

    const tracker = await this.prisma.userTrackedAgency.findUnique({
      where: {
        user_id_source_agency_id: {
          user_id: userId,
          source_agency_id: sourceAgencyId,
        },
      },
    });

    if (!tracker?.enabled) {
      throw new Error('Agency is not being tracked');
    }

    const crawlRun = await this.crawlRunsService.createBackfillRun(
      tracker.source_agency_id,
      tracker.id,
    );

    await this.processTrackerBatch(
      crawlRun.id,
      {
        tracker: {
          id: tracker.id,
          user_id: tracker.user_id,
          source_agency_id: tracker.source_agency_id,
          track_new_listings: tracker.track_new_listings,
          track_updated_listings: true,
          track_removed_listings: tracker.track_removed_listings,
          auto_update_to_crm: tracker.auto_update_to_crm,
          concurrent_insertions: tracker.concurrent_insertions,
          insertion_interval_minutes: tracker.insertion_interval_minutes,
          max_properties: tracker.max_properties,
        },
        affected: [
          {
            user_property_id: userProperty.id,
            change_type: 'UPDATE',
            user_property: userProperty,
          },
        ],
      },
      { includeUpdatesRegardlessOfAuto: true },
    );
  }

  private async processTrackerBatch(
    crawlRunId: string,
    trackerGroup: TrackerGroup,
    options?: ProcessTrackerBatchOptions,
  ): Promise<void> {
    const tracker = trackerGroup.tracker;

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

    if (filtered.length === 0) return;

    const integration = await this.resolveLinkedIntegration(tracker.id);
    if (!integration) return;

    const batch = await this.batchService.buildBatch({
      crawl_run_id: crawlRunId,
      user_integration_id: integration.userIntegrationId,
      user_tracked_agency_id: tracker.id,
      source_agency_id: tracker.source_agency_id,
      concurrent_insertions: tracker.concurrent_insertions,
      insertion_interval_minutes: tracker.insertion_interval_minutes,
      max_properties: tracker.max_properties,
      affected: filtered,
    });

    if (batch.operations.length === 0) {
      this.logger.log(
        `Crawl ${crawlRunId}: tracker ${tracker.id} has no CMS operations after duplicate collapse`,
      );
      return;
    }

    const cmsSyncRun = await this.cmsSyncRunsService.createBatch({
      crawlRunId,
      userIntegrationId: integration.userIntegrationId,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      payload: this.serializeBatchPayload(batch),
    });

    await this.cmsSyncQueue.add('cms-sync', {
      cms_sync_run_id: cmsSyncRun.id,
      user_tracked_agency_id: tracker.id,
      user_integration_id: integration.userIntegrationId,
      crawl_run_id: crawlRunId,
    });

    this.logger.log(
      `Crawl ${crawlRunId}: enqueued CMS sync run ${cmsSyncRun.id} for tracker ${tracker.id} with ${batch.operations.length} operation(s)`,
    );
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

  private serializeBatchPayload(batch: CmsSyncBatch): Record<string, unknown> {
    return {
      user_tracked_agency_id: batch.user_tracked_agency_id,
      source_agency_id: batch.source_agency_id,
      concurrent_insertions: batch.concurrent_insertions,
      insertion_interval_minutes: batch.insertion_interval_minutes,
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
}
