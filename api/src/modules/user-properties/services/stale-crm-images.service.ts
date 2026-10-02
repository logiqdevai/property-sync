import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JobStatus } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { STALE_CRM_IMAGES_REPLACE_QUEUE } from '@/core/queues/queues.constants';
import { StaleCrmImageReplaceItemDto } from '../dto/enqueue-stale-crm-images-replace.dto';
import {
  StaleCrmImagesReplaceJobData,
  StaleCrmImagesReplaceJobResult,
} from '../interfaces/stale-crm-images-replace-job.interface';
import { StaleCrmImagePropertyCandidate } from '../interfaces/stale-crm-images-candidate.interface';
import {
  isPropertyImagesGcsUrl,
  normalizeSourceImageIdentity,
} from '../utils/duplicate-watermark-detection.util';

interface RawIntegrationImage {
  id?: unknown;
  source_image?: unknown;
  show_on_site?: unknown;
  show_on_groups?: unknown;
  show_on_foreign_agents?: unknown;
}

@Injectable()
export class StaleCrmImagesService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(STALE_CRM_IMAGES_REPLACE_QUEUE)
    private readonly replaceQueue: Queue<StaleCrmImagesReplaceJobData>,
  ) {}

  // Finds CRM images whose content no longer matches the local image we now
  // have at the same position -- e.g. the local image was dewatermarked (or
  // otherwise changed) but the push to EstateWeb was skipped (a content_hash
  // gate bug, fixed in commit 6060905) or never ran. Unlike excess-images
  // (positions beyond what's kept) or duplicate-watermark-images (CRM images
  // that don't match ANYTHING local), this is a 1:1 content mismatch at a
  // position we're definitely keeping -- there's no ambiguity to review, only
  // whether the admin wants to push the fix.
  async calculateCandidates(
    sourceAgencyIds: string[],
  ): Promise<StaleCrmImagePropertyCandidate[]> {
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

    const candidates: StaleCrmImagePropertyCandidate[] = [];

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
      if (localImages.length === 0 || crmImages.length === 0) continue;

      const overlapLength = Math.min(localImages.length, crmImages.length);
      const mismatches: StaleCrmImagePropertyCandidate['mismatches'] = [];

      for (let i = 0; i < overlapLength; i++) {
        const crmImage = crmImages[i];
        if (typeof crmImage?.id !== 'number') continue;
        const localUrl = localImages[i];

        // Only ever propose replacing a position where OUR pipeline actually
        // produced a processed (GCS) image locally. Raw-vs-raw URL
        // differences at the same position are not a "stuck push" -- the
        // source agency's own site can reorder its photo gallery between
        // crawls, so "position i" can silently become a different real
        // photo on their end without our tracker ever touching it. Confirmed
        // against live cretahouses data: multiple properties had different
        // (both still-watermarked) photos at the same position across
        // crawls, which this service was flagging as a false-positive
        // "replace" -- i.e. it would have swapped a correct, untouched CRM
        // photo for an unrelated one, never a real fix. Restricting to GCS
        // local images keeps this tool scoped to its actual job: pushing a
        // local processing change (dewatermark) that never reached the CRM.
        if (!isPropertyImagesGcsUrl(localUrl)) continue;

        const localIdentity = normalizeSourceImageIdentity(localUrl);
        const crmIdentity =
          typeof crmImage.source_image === 'string'
            ? normalizeSourceImageIdentity(crmImage.source_image)
            : null;
        if (crmIdentity === localIdentity) continue;

        mismatches.push({
          position: i,
          crm_image_id: crmImage.id,
          new_source_image: localUrl,
          old_source_image:
            typeof crmImage.source_image === 'string' ? crmImage.source_image : null,
          show_on_site: Boolean(crmImage.show_on_site),
          show_on_groups: Boolean(crmImage.show_on_groups),
          show_on_foreign_agents: Boolean(crmImage.show_on_foreign_agents),
        });
      }

      if (mismatches.length === 0) continue;

      candidates.push({
        user_property_id: up.id,
        user_id: up.user_id,
        property_id: up.property_id,
        title: up.title,
        agency_id: agencyId,
        agency_name: agencyName,
        user_integration_id: userIntegrationId,
        crm_property_id: up.integration_property_id as string,
        mismatches,
      });
    }

    return candidates;
  }

  async enqueueReplace(items: StaleCrmImageReplaceItemDto[]): Promise<{
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
      item: StaleCrmImageReplaceItemDto;
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
        item,
      });
    }

    if (enqueueItems.length === 0) {
      throw new BadRequestException(
        'None of the selected images could be resolved to an active EstateWeb integration',
      );
    }

    const initialResult: StaleCrmImagesReplaceJobResult = {
      total: enqueueItems.length,
      processed: 0,
      replaced: 0,
      failed: 0,
      items: [],
      logs: [`enqueued images=${enqueueItems.length} action=replace-stale-crm-image`],
    };

    const jobLog = await this.prisma.jobLog.create({
      data: {
        queue_name: STALE_CRM_IMAGES_REPLACE_QUEUE,
        job_name: 'replace-stale-crm-image',
        status: JobStatus.WAITING,
        payload: {
          total: enqueueItems.length,
          user_property_ids: enqueueItems.map((i) => i.userPropertyId),
        } as object,
        result: initialResult as object,
      },
    });

    await this.replaceQueue.addBulk(
      enqueueItems.map(({ userPropertyId, userIntegrationId, crmPropertyId, item }) => {
        const jobData: StaleCrmImagesReplaceJobData = {
          job_log_id: jobLog.id,
          user_property_id: userPropertyId,
          user_integration_id: userIntegrationId,
          crm_property_id: crmPropertyId,
          crm_image_id: item.crm_image_id,
          new_source_image: item.new_source_image,
          position: item.position,
          show_on_site: item.show_on_site,
          show_on_groups: item.show_on_groups,
          show_on_foreign_agents: item.show_on_foreign_agents,
          total: enqueueItems.length,
        };
        return {
          name: 'replace-stale-crm-image',
          data: jobData,
          opts: {
            jobId: `${jobLog.id}__${item.crm_image_id}`,
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
      message: 'Stale CRM image replacement started in the background. Track progress in Job queue.',
    };
  }
}
