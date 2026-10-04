import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JobStatus } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CRM_IMAGE_SYNC_QUEUE } from '@/core/queues/queues.constants';
import { EstateWebCmsSyncAdapter } from '@/integrations/estateweb/services/estateweb-cms-sync-adapter.service';
import {
  countDistinctPhotos,
  isSourceGalleryShrunk,
  peakDistinctPhotos,
  planImageReconcile,
} from '@/integrations/estateweb/utils/estateweb-image-reconcile.util';
import { UserPropertiesService } from '../user-properties.service';
import { normalizeSourceImageIdentity } from '../utils/duplicate-watermark-detection.util';
import { AgencyWatermarkSettings } from '../interfaces/agency-watermark-settings.interface';
import { UserPropertyImagesCurationService } from './user-property-images-curation.service';
import {
  CrmImageSyncItemResult,
  CrmImageSyncJobData,
  CrmImageSyncJobResult,
  CrmImageSyncPreviewAgency,
} from '../interfaces/crm-image-sync.interface';

const MAX_IMAGE_UPLOAD_ATTEMPTS = 5;

interface CachedImage {
  id?: unknown;
  source_image?: unknown;
}

// Makes every property's photos match its agency's "images to keep": our
// UserProperty.images becomes exactly what the next crawl would store, and
// the EstateWeb gallery becomes exactly that list (each photo once, in
// order, nothing else). Replaces the three one-symptom cleanup tools.
@Injectable()
export class CrmImageSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userPropertiesService: UserPropertiesService,
    private readonly estateWebCmsSyncAdapter: EstateWebCmsSyncAdapter,
    private readonly imagesCuration: UserPropertyImagesCurationService,
    @InjectQueue(CRM_IMAGE_SYNC_QUEUE)
    private readonly queue: Queue<CrmImageSyncJobData>,
  ) {}

  async listAgencyImageSettings(): Promise<AgencyWatermarkSettings[]> {
    return this.prisma.userTrackedAgency.findMany({
      where: { enabled: true },
      select: {
        source_agency_id: true,
        user_id: true,
        remove_watermark: true,
        watermark_image_count: true,
        max_image_count: true,
      },
    });
  }

  // Largest gallery (in distinct photos) each canonical property ever had,
  // from its image history.
  private async loadPeakGallerySizes(
    canonicalIds: string[],
  ): Promise<Map<string, number>> {
    if (canonicalIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<
      Array<{ property_id: string; old_value: unknown }>
    >`
      SELECT property_id, old_value
      FROM property_history
      WHERE field = 'images'
        AND jsonb_typeof(old_value) = 'array'
        AND property_id = ANY(${canonicalIds}::text[])`;
    const galleriesById = new Map<string, unknown[]>();
    for (const row of rows) {
      const galleries = galleriesById.get(row.property_id) ?? [];
      galleries.push(row.old_value);
      galleriesById.set(row.property_id, galleries);
    }
    const peaks = new Map<string, number>();
    for (const [propertyId, galleries] of galleriesById) {
      const peak = peakDistinctPhotos(galleries, normalizeSourceImageIdentity);
      if (peak != null) peaks.set(propertyId, peak);
    }
    return peaks;
  }

  // Read-only, from our cached copy of each CRM gallery. The real run re-reads
  // EstateWeb live, so numbers can shift slightly if the cache is stale.
  async preview(
    sourceAgencyIds: string[],
  ): Promise<CrmImageSyncPreviewAgency[]> {
    const agencies = await this.prisma.sourceAgency.findMany({
      where: { id: { in: sourceAgencyIds } },
      select: { id: true, name: true },
    });

    const result: CrmImageSyncPreviewAgency[] = [];
    for (const agency of agencies) {
      const trackers = await this.prisma.userTrackedAgency.findMany({
        where: { source_agency_id: agency.id },
        select: { user_id: true, max_image_count: true },
      });

      for (const tracker of trackers) {
        const properties = await this.prisma.userProperty.findMany({
          where: {
            user_id: tracker.user_id,
            integration_property_id: { not: null },
            canonical_property: {
              source_links: {
                some: { source_property: { source_agency_id: agency.id } },
              },
            },
          },
          select: {
            id: true,
            title: true,
            property_id: true,
            images: true,
            images_curated_at: true,
            images_curated_cap: true,
            canonical_property_id: true,
            canonical_property: { select: { images: true } },
            integration_properties: {
              orderBy: { updated_at: 'desc' },
              take: 1,
              select: {
                images: true,
                linked_via_reconciliation: true,
                excluded_source_images: true,
                image_upload_failures: true,
              },
            },
          },
        });
        if (properties.length === 0) continue;
        const peaks = await this.loadPeakGallerySizes(
          properties.map((property) => property.canonical_property_id),
        );

        const summary: CrmImageSyncPreviewAgency = {
          agency_id: agency.id,
          agency_name: agency.name,
          max_image_count: tracker.max_image_count,
          properties: properties.length,
          needs_sync: 0,
          skipped_not_ours: 0,
          crm_now: 0,
          crm_target: 0,
          to_delete: 0,
          to_upload: 0,
          samples: [],
          skipped_source_shrank: [],
        };

        for (const property of properties) {
          const cache = property.integration_properties[0];
          if (cache?.linked_via_reconciliation) {
            summary.skipped_not_ours += 1;
            continue;
          }
          const sourceCount = countDistinctPhotos(
            property.canonical_property.images,
            normalizeSourceImageIdentity,
          );
          const peak = peaks.get(property.canonical_property_id);
          if (
            property.images_curated_at == null &&
            isSourceGalleryShrunk(sourceCount, peak, tracker.max_image_count)
          ) {
            summary.skipped_source_shrank.push({
              user_property_id: property.id,
              title: property.title,
              property_id: property.property_id,
              source_now: sourceCount,
              source_peak: peak ?? 0,
              crm_now: Array.isArray(cache?.images) ? cache.images.length : 0,
            });
            continue;
          }
          const excludedImages = Array.isArray(cache?.excluded_source_images)
            ? (cache.excluded_source_images as unknown[]).filter(
                (url): url is string => typeof url === 'string',
              )
            : [];
          const desired = this.userPropertiesService.computeTrackedImages({
            userProperty: property,
            canonicalImages: property.canonical_property.images,
            maxImageCount: tracker.max_image_count,
            excludedImages,
          }).images;
          if (desired.length === 0) continue;

          const cachedImages = Array.isArray(cache?.images)
            ? (cache.images as CachedImage[])
            : [];
          const crmIds = cachedImages
            .map((image) => image?.id)
            .filter((id): id is number => typeof id === 'number');
          const sourceById = new Map<number, string>();
          for (const image of cachedImages) {
            if (
              typeof image?.id === 'number' &&
              typeof image.source_image === 'string'
            ) {
              sourceById.set(image.id, image.source_image);
            }
          }
          const failures = (cache?.image_upload_failures ?? {}) as Record<
            string,
            { attempts?: number }
          >;
          const plan = planImageReconcile({
            crmImageIds: crmIds,
            sourceById,
            desiredImages: desired,
            excludedImages,
            isUploadBlocked: (url) =>
              (failures[url]?.attempts ?? 0) >= MAX_IMAGE_UPLOAD_ATTEMPTS,
            normalize: normalizeSourceImageIdentity,
          });

          const localNow = Array.isArray(property.images)
            ? property.images.length
            : 0;
          const localChanges =
            JSON.stringify(property.images ?? []) !== JSON.stringify(desired);
          summary.crm_now += crmIds.length;
          summary.crm_target += plan.desired.length;

          const needsSync =
            localChanges ||
            plan.toDelete.length > 0 ||
            plan.toUpload.length > 0 ||
            plan.orderWrong;
          if (!needsSync) continue;

          summary.needs_sync += 1;
          summary.to_delete += plan.toDelete.length;
          summary.to_upload += plan.toUpload.length;
          summary.samples.push({
            user_property_id: property.id,
            title: property.title,
            property_id: property.property_id,
            crm_now: crmIds.length,
            target: plan.desired.length,
            to_delete: plan.toDelete.length,
            to_upload: plan.toUpload.length,
            local_now: localNow,
            local_changes: localChanges,
          });
        }

        summary.samples.sort((a, b) => b.to_delete - a.to_delete);
        result.push(summary);
      }
    }
    return result;
  }

  async enqueue(
    sourceAgencyIds: string[],
    onlyUserPropertyIds?: string[],
  ): Promise<{
    job_log_id: string;
    enqueued: number;
    message: string;
  }> {
    const trackers = await this.prisma.userTrackedAgency.findMany({
      where: { source_agency_id: { in: sourceAgencyIds } },
      select: { user_id: true, source_agency_id: true },
    });
    const ids = new Set<string>();
    for (const tracker of trackers) {
      const rows = await this.prisma.userProperty.findMany({
        where: {
          user_id: tracker.user_id,
          integration_property_id: { not: null },
          canonical_property: {
            source_links: {
              some: {
                source_property: { source_agency_id: tracker.source_agency_id },
              },
            },
          },
        },
        select: { id: true },
      });
      for (const row of rows) ids.add(row.id);
    }
    if (onlyUserPropertyIds?.length) {
      const only = new Set(onlyUserPropertyIds);
      for (const id of [...ids]) if (!only.has(id)) ids.delete(id);
    }
    if (ids.size === 0) {
      throw new BadRequestException(
        'No linked properties found for the selected agencies',
      );
    }

    const total = ids.size;
    const initialResult: CrmImageSyncJobResult = {
      total,
      processed: 0,
      reconciled: 0,
      in_sync: 0,
      skipped: 0,
      failed: 0,
      deleted: 0,
      uploaded: 0,
      items: [],
      logs: [`enqueued properties=${total}`],
    };
    const jobLog = await this.prisma.jobLog.create({
      data: {
        queue_name: CRM_IMAGE_SYNC_QUEUE,
        job_name: 'crm-image-sync',
        status: JobStatus.WAITING,
        payload: { total, source_agency_ids: sourceAgencyIds } as object,
        result: initialResult as object,
      },
    });

    await this.queue.addBulk(
      [...ids].map((userPropertyId) => ({
        name: 'crm-image-sync',
        data: {
          job_log_id: jobLog.id,
          user_property_id: userPropertyId,
          total,
        },
        opts: {
          jobId: `${jobLog.id}__${userPropertyId}`,
          attempts: 3,
          backoff: { type: 'exponential' as const, delay: 10000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      })),
    );

    return {
      job_log_id: jobLog.id,
      enqueued: total,
      message:
        'CRM image sync started in the background. Track progress in Job queue.',
    };
  }

  async processProperty(
    userPropertyId: string,
  ): Promise<CrmImageSyncItemResult> {
    const base: CrmImageSyncItemResult = {
      user_property_id: userPropertyId,
      status: 'skipped',
      local_changed: false,
      crm_before: 0,
      crm_after: 0,
      desired: 0,
      deleted: 0,
      uploaded: 0,
      upload_failed: 0,
    };

    const property = await this.prisma.userProperty.findUnique({
      where: { id: userPropertyId },
      select: {
        id: true,
        user_id: true,
        images: true,
        images_curated_at: true,
        images_curated_cap: true,
        integration_property_id: true,
        canonical_property_id: true,
        canonical_property: {
          select: {
            images: true,
            source_links: {
              take: 1,
              select: {
                source_property: { select: { source_agency_id: true } },
              },
            },
          },
        },
      },
    });
    if (!property?.integration_property_id) {
      return { ...base, skip_reason: 'not_linked' };
    }
    const agencyId =
      property.canonical_property.source_links[0]?.source_property
        .source_agency_id;
    const tracker = agencyId
      ? await this.prisma.userTrackedAgency.findFirst({
          where: { user_id: property.user_id, source_agency_id: agencyId },
          select: {
            max_image_count: true,
            integration_link: { select: { user_integration_id: true } },
          },
        })
      : null;
    const userIntegrationId = tracker?.integration_link?.user_integration_id;
    if (!tracker || !userIntegrationId) {
      return { ...base, skip_reason: 'no_estateweb_integration' };
    }

    const sourceCount = countDistinctPhotos(
      property.canonical_property.images,
      normalizeSourceImageIdentity,
    );
    const peaks = await this.loadPeakGallerySizes([
      property.canonical_property_id,
    ]);
    if (
      property.images_curated_at == null &&
      isSourceGalleryShrunk(
        sourceCount,
        peaks.get(property.canonical_property_id),
        tracker.max_image_count,
      )
    ) {
      return { ...base, skip_reason: 'source_gallery_shrank' };
    }

    const tracked = this.userPropertiesService.computeTrackedImages({
      userProperty: property,
      canonicalImages: property.canonical_property.images,
      maxImageCount: tracker.max_image_count,
      excludedImages: await this.imagesCuration.loadExcludedSourceImages(
        property.id,
      ),
    });
    const desired = tracked.images;
    if (desired.length === 0) {
      return { ...base, skip_reason: 'no_source_images' };
    }

    const localChanged =
      JSON.stringify(property.images ?? []) !== JSON.stringify(desired);
    if (localChanged) {
      await this.prisma.userProperty.update({
        where: { id: property.id },
        data: {
          images: desired,
          ...(tracked.curatedCap !== undefined
            ? { images_curated_cap: tracked.curatedCap }
            : {}),
        },
      });
    }

    const crm = await this.estateWebCmsSyncAdapter.reconcileImages({
      userIntegrationId,
      userPropertyId: property.id,
      crmPropertyId: property.integration_property_id,
      desiredImages: desired,
    });

    return {
      ...base,
      status:
        crm.status === 'skipped'
          ? 'skipped'
          : crm.status === 'reconciled' || localChanged
            ? 'reconciled'
            : 'in_sync',
      skip_reason: crm.skip_reason,
      local_changed: localChanged,
      crm_before: crm.crm_before,
      crm_after: crm.crm_after,
      desired: crm.desired,
      deleted: crm.deleted_ids.length,
      uploaded: crm.uploaded,
      upload_failed: crm.upload_failed.length,
    };
  }
}
