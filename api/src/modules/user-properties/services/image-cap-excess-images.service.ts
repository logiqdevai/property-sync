import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JobStatus } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { IMAGE_CAP_EXCESS_IMAGES_CLEANUP_QUEUE } from '@/core/queues/queues.constants';
import { ImageCapExcessImagesCleanupItemDto } from '../dto/enqueue-image-cap-excess-images-cleanup.dto';
import {
  ImageCapExcessImagesCleanupJobData,
  ImageCapExcessImagesCleanupJobResult,
} from '../interfaces/image-cap-excess-images-cleanup-job.interface';
import { ImageCapExcessPropertyCandidate } from '../interfaces/image-cap-excess-images-candidate.interface';
import { normalizeSourceImageIdentity } from '../utils/duplicate-watermark-detection.util';

interface RawIntegrationImage {
  id?: unknown;
  source_image?: unknown;
  filename?: unknown;
}

@Injectable()
export class ImageCapExcessImagesService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(IMAGE_CAP_EXCESS_IMAGES_CLEANUP_QUEUE)
    private readonly cleanupQueue: Queue<ImageCapExcessImagesCleanupJobData>,
  ) {}

  // Finds CRM images left over on EstateWeb after a tracker's max_image_count
  // trimmed UserProperty.images locally -- the trim itself never used to reach
  // the CRM when the source listing's own content didn't change (CRM update
  // was gated purely on content_hash). See docs/CLIENT-ISSUES-2026-10-01.md #1
  // follow-up: the local copy is correct, EstateWeb just never got told.
  async calculateCandidates(
    sourceAgencyIds: string[],
  ): Promise<ImageCapExcessPropertyCandidate[]> {
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
        integration_link: { select: { user_integration_id: true } },
      },
    });
    const trackerByKey = new Map(
      trackers.map((t) => [`${t.user_id}::${t.source_agency_id}`, t]),
    );

    const candidates: ImageCapExcessPropertyCandidate[] = [];

    for (const up of userProperties) {
      const sourceLink = up.canonical_property.source_links[0];
      if (!sourceLink) continue;
      const agencyId = sourceLink.source_property.source_agency_id;
      const agencyName = sourceLink.source_property.source_agency.name;
      const tracker = trackerByKey.get(`${up.user_id}::${agencyId}`);
      const userIntegrationId = tracker?.integration_link?.user_integration_id;
      if (!userIntegrationId) continue;

      const localImages = Array.isArray(up.images)
        ? up.images.filter((x): x is string => typeof x === 'string')
        : [];
      const crmImages = Array.isArray(up.integration_properties[0]?.images)
        ? (up.integration_properties[0].images as RawIntegrationImage[])
        : [];
      if (localImages.length === 0 || crmImages.length <= localImages.length) {
        continue;
      }

      const localIdentities = localImages.map(normalizeSourceImageIdentity);
      const localIdentitySet = new Set(localIdentities);

      const identityOf = (img: RawIntegrationImage): string | null =>
        typeof img.source_image === 'string' && img.source_image.length > 0
          ? normalizeSourceImageIdentity(img.source_image)
          : null;

      const firstN = crmImages.slice(0, localImages.length);
      const rest = crmImages.slice(localImages.length);

      const firstNAllMatch = firstN.every((img) => {
        const identity = identityOf(img);
        return identity != null && localIdentitySet.has(identity);
      });
      const restAllExcess = rest.every((img) => {
        const identity = identityOf(img);
        return identity == null || !localIdentitySet.has(identity);
      });
      const isHighConfidence = firstNAllMatch && restAllExcess;

      const excessImages = crmImages.filter((img) => {
        if (typeof img.id !== 'number') return false;
        const identity = identityOf(img);
        return identity == null || !localIdentitySet.has(identity);
      });
      if (excessImages.length === 0) continue;

      candidates.push({
        user_property_id: up.id,
        user_id: up.user_id,
        property_id: up.property_id,
        title: up.title,
        agency_id: agencyId,
        agency_name: agencyName,
        user_integration_id: userIntegrationId,
        crm_property_id: up.integration_property_id as string,
        local_image_count: localImages.length,
        crm_image_count: crmImages.length,
        excess_count: excessImages.length,
        is_high_confidence: isHighConfidence,
        excess_images: excessImages.map((img) => ({
          id: img.id as number,
          source_image:
            typeof img.source_image === 'string' ? img.source_image : null,
          filename: typeof img.filename === 'string' ? img.filename : null,
        })),
        kept_local_images: localImages,
      });
    }

    return candidates;
  }

  async enqueueCleanup(items: ImageCapExcessImagesCleanupItemDto[]): Promise<{
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

    const initialResult: ImageCapExcessImagesCleanupJobResult = {
      total: enqueueItems.length,
      processed: 0,
      deleted: 0,
      failed: 0,
      items: [],
      logs: [`enqueued images=${enqueueItems.length} action=delete-image-cap-excess`],
    };

    const jobLog = await this.prisma.jobLog.create({
      data: {
        queue_name: IMAGE_CAP_EXCESS_IMAGES_CLEANUP_QUEUE,
        job_name: 'delete-image-cap-excess-image',
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
        const jobData: ImageCapExcessImagesCleanupJobData = {
          job_log_id: jobLog.id,
          user_property_id: item.userPropertyId,
          user_integration_id: item.userIntegrationId,
          crm_property_id: item.crmPropertyId,
          crm_image_id: item.crmImageId,
          total: enqueueItems.length,
        };
        return {
          name: 'delete-image-cap-excess-image',
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
      message: 'Image cap cleanup started in the background. Track progress in Job queue.',
    };
  }
}
