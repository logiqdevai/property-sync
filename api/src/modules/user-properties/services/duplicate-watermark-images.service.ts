import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JobStatus, Prisma } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { DUPLICATE_WATERMARK_CLEANUP_QUEUE } from '@/core/queues/queues.constants';
import { DuplicateWatermarkCleanupItemDto } from '../dto/enqueue-duplicate-watermark-cleanup.dto';
import {
  DuplicateWatermarkCleanupJobData,
  DuplicateWatermarkCleanupJobResult,
} from '../interfaces/duplicate-watermark-cleanup-job.interface';
import { DuplicateWatermarkPropertyCandidate } from '../interfaces/duplicate-watermark-candidate.interface';
import { AgencyWatermarkSettings } from '../interfaces/agency-watermark-settings.interface';
import {
  isPropertyImagesGcsUrl,
  normalizeSourceImageIdentity,
} from '../utils/duplicate-watermark-detection.util';

interface RawIntegrationImage {
  id?: unknown;
  source_image?: unknown;
  filename?: unknown;
}

@Injectable()
export class DuplicateWatermarkImagesService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(DUPLICATE_WATERMARK_CLEANUP_QUEUE)
    private readonly cleanupQueue: Queue<DuplicateWatermarkCleanupJobData>,
  ) {}

  // For the agency picker: lets the admin see, before calculating, which
  // agencies even have watermark removal on and what their current settings
  // are, instead of picking blind.
  async listAgencyWatermarkSettings(): Promise<AgencyWatermarkSettings[]> {
    const trackers = await this.prisma.userTrackedAgency.findMany({
      where: { enabled: true },
      select: {
        source_agency_id: true,
        user_id: true,
        remove_watermark: true,
        watermark_image_count: true,
        max_image_count: true,
      },
    });
    return trackers;
  }

  // Finds CRM images that are stale leftovers from the automatic watermark
  // pipeline: a raw (still-watermarked) image that used to be at a position
  // the pipeline could have processed, which no longer matches anything in
  // UserProperty.images because a clean GCS-processed copy replaced it there.
  // See docs/CLIENT-ISSUES-2026-10-01.md issue #1 follow-up.
  async calculateCandidates(
    sourceAgencyIds: string[],
  ): Promise<DuplicateWatermarkPropertyCandidate[]> {
    const userProperties = await this.prisma.userProperty.findMany({
      where: {
        integration_property_id: { not: null },
        canonical_property: {
          source_links: {
            some: {
              source_property: { source_agency_id: { in: sourceAgencyIds } },
            },
          },
        },
      },
      select: {
        id: true,
        user_id: true,
        property_id: true,
        title: true,
        images: true,
        integration_property_id: true,
        canonical_property: {
          select: {
            images: true,
            source_links: {
              take: 1,
              select: {
                source_property: {
                  select: {
                    source_agency_id: true,
                    source_agency: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
        integration_properties: {
          take: 1,
          select: { images: true },
        },
      },
    });

    if (userProperties.length === 0) return [];

    const trackerKeys = new Set(
      userProperties.map(
        (up) =>
          `${up.user_id}::${up.canonical_property.source_links[0]?.source_property.source_agency_id}`,
      ),
    );
    const trackers = await this.prisma.userTrackedAgency.findMany({
      where: {
        OR: [...trackerKeys].map((key) => {
          const [userId, agencyId] = key.split('::');
          return { user_id: userId, source_agency_id: agencyId };
        }),
      },
      select: {
        user_id: true,
        source_agency_id: true,
        watermark_image_count: true,
        integration_link: { select: { user_integration_id: true } },
      },
    });
    const trackerByKey = new Map(
      trackers.map((t) => [`${t.user_id}::${t.source_agency_id}`, t]),
    );

    const candidates: DuplicateWatermarkPropertyCandidate[] = [];

    for (const up of userProperties) {
      const sourceLink = up.canonical_property.source_links[0];
      if (!sourceLink) continue;
      const agencyId = sourceLink.source_property.source_agency_id;
      const agencyName = sourceLink.source_property.source_agency.name;
      const tracker = trackerByKey.get(`${up.user_id}::${agencyId}`);
      const userIntegrationId = tracker?.integration_link?.user_integration_id;
      const watermarkImageCount = tracker?.watermark_image_count ?? 0;
      if (!userIntegrationId || watermarkImageCount === 0) continue;

      const upImages = Array.isArray(up.images)
        ? up.images.filter((x): x is string => typeof x === 'string')
        : [];
      const canonicalImages = Array.isArray(up.canonical_property.images)
        ? up.canonical_property.images.filter(
            (x): x is string => typeof x === 'string',
          )
        : [];
      const crmImages = Array.isArray(up.integration_properties[0]?.images)
        ? (up.integration_properties[0].images as RawIntegrationImage[])
        : [];
      if (upImages.length === 0 || crmImages.length === 0 || canonicalImages.length === 0) {
        continue;
      }

      // mapFromCanonical() builds up.images as canonicalImages.slice(0, cap),
      // then the watermark pipeline replaces raw urls with GCS urls IN PLACE
      // at the same index -- so up.images[k] and canonicalImages[k] are the
      // same photo by position, never by independent identity-set membership.
      // Walking both by index (not comparing two differently-ordered identity
      // sets) is what ties each stale CRM image to the ONE specific GCS image
      // that actually replaced it, instead of pairing by array-index
      // coincidence against an unrelated list later in the UI.
      const windowLimit = Math.min(watermarkImageCount, canonicalImages.length, upImages.length);
      const afterImageByIdentity = new Map<string, string>();
      for (let k = 0; k < windowLimit; k++) {
        const afterUrl = upImages[k];
        const beforeUrl = canonicalImages[k];
        if (!isPropertyImagesGcsUrl(afterUrl) || isPropertyImagesGcsUrl(beforeUrl)) continue;
        afterImageByIdentity.set(normalizeSourceImageIdentity(beforeUrl), afterUrl);
      }
      if (afterImageByIdentity.size === 0) continue;

      const currentIdentities = new Set(upImages.map(normalizeSourceImageIdentity));

      const genuineDuplicates: DuplicateWatermarkPropertyCandidate['genuine_duplicates'] =
        [];
      let excessCount = 0;

      for (const img of crmImages) {
        if (typeof img?.id !== 'number') continue;
        const src = typeof img.source_image === 'string' ? img.source_image : null;
        if (!src || isPropertyImagesGcsUrl(src)) continue;
        const identity = normalizeSourceImageIdentity(src);
        if (currentIdentities.has(identity)) continue; // still current, not stale
        const afterImage = afterImageByIdentity.get(identity);
        if (afterImage) {
          genuineDuplicates.push({
            id: img.id,
            source_image: src,
            filename: typeof img.filename === 'string' ? img.filename : null,
            after_image: afterImage,
          });
        } else {
          excessCount += 1;
        }
      }

      if (genuineDuplicates.length === 0) continue;

      candidates.push({
        user_property_id: up.id,
        user_id: up.user_id,
        property_id: up.property_id,
        title: up.title,
        agency_id: agencyId,
        agency_name: agencyName,
        user_integration_id: userIntegrationId,
        crm_property_id: up.integration_property_id as string,
        genuine_duplicate_count: genuineDuplicates.length,
        excess_left_alone_count: excessCount,
        genuine_duplicates: genuineDuplicates,
      });
    }

    return candidates;
  }

  async enqueueCleanup(items: DuplicateWatermarkCleanupItemDto[]): Promise<{
    job_log_id: string;
    enqueued: number;
    message: string;
  }> {
    const userPropertyIds = [...new Set(items.map((i) => i.user_property_id))];
    const userProperties = await this.prisma.userProperty.findMany({
      where: { id: { in: userPropertyIds } },
      select: {
        id: true,
        user_id: true,
        integration_property_id: true,
        canonical_property: {
          select: {
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
    const userPropertyById = new Map(userProperties.map((up) => [up.id, up]));

    const trackerKeys = new Set(
      userProperties
        .map((up) => {
          const agencyId = up.canonical_property.source_links[0]?.source_property
            .source_agency_id;
          return agencyId ? `${up.user_id}::${agencyId}` : null;
        })
        .filter((key): key is string => key !== null),
    );
    const trackers = await this.prisma.userTrackedAgency.findMany({
      where: {
        OR: [...trackerKeys].map((key) => {
          const [userId, agencyId] = key.split('::');
          return { user_id: userId, source_agency_id: agencyId };
        }),
      },
      select: {
        user_id: true,
        source_agency_id: true,
        integration_link: { select: { user_integration_id: true } },
      },
    });
    const trackerByKey = new Map(
      trackers.map((t) => [`${t.user_id}::${t.source_agency_id}`, t]),
    );

    const enqueueItems: Array<{
      userPropertyId: string;
      userIntegrationId: string;
      crmPropertyId: string;
      crmImageId: number;
    }> = [];

    for (const item of items) {
      const up = userPropertyById.get(item.user_property_id);
      if (!up || !up.integration_property_id) continue;
      const agencyId = up.canonical_property.source_links[0]?.source_property
        .source_agency_id;
      const userIntegrationId = agencyId
        ? trackerByKey.get(`${up.user_id}::${agencyId}`)?.integration_link
            ?.user_integration_id
        : undefined;
      if (!userIntegrationId) continue;

      enqueueItems.push({
        userPropertyId: up.id,
        userIntegrationId,
        crmPropertyId: up.integration_property_id,
        crmImageId: item.crm_image_id,
      });
    }

    if (enqueueItems.length === 0) {
      throw new BadRequestException(
        'None of the selected images could be resolved to an active EstateWeb integration',
      );
    }

    const initialResult: DuplicateWatermarkCleanupJobResult = {
      total: enqueueItems.length,
      processed: 0,
      deleted: 0,
      failed: 0,
      items: [],
      logs: [`enqueued images=${enqueueItems.length} action=delete-duplicate-watermarked`],
    };

    const jobLog = await this.prisma.jobLog.create({
      data: {
        queue_name: DUPLICATE_WATERMARK_CLEANUP_QUEUE,
        job_name: 'delete-duplicate-watermarked-image',
        status: JobStatus.WAITING,
        payload: {
          total: enqueueItems.length,
          user_property_ids: enqueueItems.map((i) => i.userPropertyId),
        } as object,
        result: initialResult as object,
      },
    });

    await this.cleanupQueue.addBulk(
      enqueueItems.map((item) => {
        const jobData: DuplicateWatermarkCleanupJobData = {
          job_log_id: jobLog.id,
          user_property_id: item.userPropertyId,
          user_integration_id: item.userIntegrationId,
          crm_property_id: item.crmPropertyId,
          crm_image_id: item.crmImageId,
          total: enqueueItems.length,
        };
        return {
          name: 'delete-duplicate-watermarked-image',
          data: jobData,
          opts: {
            jobId: `${jobLog.id}__${item.crmImageId}`,
            attempts: 3,
            backoff: { type: 'exponential' as const, delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 200,
          },
        };
      }),
    );

    return {
      job_log_id: jobLog.id,
      enqueued: enqueueItems.length,
      message: 'Duplicate image cleanup started in the background. Track progress in Job queue.',
    };
  }
}
