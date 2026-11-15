import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IntegrationType } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CmsSyncAdapterFactory } from '@/modules/cms-sync/services/cms-sync-adapter.factory';
import { EstateWebIntegrationResolverService } from '@/integrations/estateweb/services/estateweb-integration-resolver.service';
import { EstateWebPropertyService } from '@/integrations/estateweb/services/estateweb-property.service';
import { UserPropertiesService } from '@/modules/user-properties/user-properties.service';
import { MigrateIntegrationImagesMode } from '@/modules/user-properties/dto/migrate-integration-images.dto';
import { PHOTO_CHECK_DELAY_MS } from '../constants/desktop-crawl.constants';
import type {
  PhotoCheckResult,
  PhotoCheckTarget,
} from '../interfaces/desktop-crawl.interfaces';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface UploadedPhoto {
  buffer: Buffer;
}

/**
 * The mcp-crawl skill's photo gate (§9) as an API. For an agency whose site blocks the server,
 * the CRM push can create listings with zero photos (the server's image download hits the same
 * wall). The desktop app checks the live CRM records here, downloads the missing photos through its
 * own Chrome, and uploads the bytes back; they go to EstateWeb through the same adapter code the
 * app's normal "push images" uses (scripts/check-estateweb-images.ts and
 * scripts/push-images-via-local-chrome.ts do the same from a terminal).
 */
@Injectable()
export class DesktopCrawlPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly estateWebPropertyService: EstateWebPropertyService,
    private readonly resolver: EstateWebIntegrationResolverService,
    private readonly cmsSyncAdapterFactory: CmsSyncAdapterFactory,
    private readonly userPropertiesService: UserPropertiesService,
  ) {}

  /** Every listing of the agency that has already been pushed to a linked CRM. */
  async listTargets(sourceAgencyId: string): Promise<PhotoCheckTarget[]> {
    const trackers = await this.prisma.userTrackedAgency.findMany({
      where: {
        source_agency_id: sourceAgencyId,
        integration_link: { isNot: null },
      },
      select: { user_id: true },
    });
    if (trackers.length === 0) return [];

    const rows = await this.prisma.userProperty.findMany({
      where: {
        user_id: { in: trackers.map((t) => t.user_id) },
        integration_property_id: { not: null },
        canonical_property: {
          source_links: {
            some: { source_property: { source_agency_id: sourceAgencyId } },
          },
        },
      },
      select: { id: true, title: true },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((r) => ({ user_property_id: r.id, title: r.title }));
  }

  /** Reads each listing live from EstateWeb and reports the ones with no photos there. */
  async check(
    sourceAgencyId: string,
    userPropertyIds: string[],
  ): Promise<PhotoCheckResult[]> {
    const rows = await this.prisma.userProperty.findMany({
      where: { id: { in: userPropertyIds } },
      select: {
        id: true,
        user_id: true,
        integration_property_id: true,
        images: true,
      },
    });

    const results: PhotoCheckResult[] = [];
    for (const row of rows) {
      const source_image_urls = this.imageUrls(row.images);
      if (!row.integration_property_id) {
        results.push({
          user_property_id: row.id,
          crm_images: null,
          missing: false,
          error: 'not pushed yet',
          source_image_urls,
        });
        continue;
      }
      try {
        const { userIntegrationId } =
          await this.resolver.resolveForTrackedAgency(
            row.user_id,
            sourceAgencyId,
          );
        const remote = (await this.estateWebPropertyService.getProperty(
          userIntegrationId,
          row.integration_property_id,
        )) as { images?: unknown[] };
        const count = (remote.images ?? []).length;
        results.push({
          user_property_id: row.id,
          crm_images: count,
          missing: count === 0,
          error: null,
          source_image_urls,
        });
      } catch (error) {
        results.push({
          user_property_id: row.id,
          crm_images: null,
          missing: false,
          error: (error instanceof Error ? error.message : String(error)).slice(
            0,
            300,
          ),
          source_image_urls,
        });
      }
      await sleep(PHOTO_CHECK_DELAY_MS);
    }
    return results;
  }

  /** Uploads photos the app downloaded to the listing's CRM record, then refreshes the cache. */
  async upload(
    userPropertyId: string,
    urls: string[],
    files: UploadedPhoto[],
  ): Promise<{ uploaded: number }> {
    if (files.length === 0 || files.length !== urls.length) {
      throw new BadRequestException(
        'Send one photo file per url, in the same order.',
      );
    }
    const property = await this.prisma.userProperty.findUnique({
      where: { id: userPropertyId },
      select: {
        id: true,
        user_id: true,
        canonical_property_id: true,
        integration_property_id: true,
      },
    });
    if (!property) throw new NotFoundException('Listing not found');
    if (!property.integration_property_id) {
      throw new BadRequestException(
        'This listing has not been pushed to the CRM yet.',
      );
    }

    const link = await this.prisma.propertySourceLink.findFirst({
      where: { property_id: property.canonical_property_id },
      select: { source_property: { select: { source_agency_id: true } } },
    });
    if (!link) throw new NotFoundException('Agency of this listing not found');

    const { userIntegrationId } = await this.resolver.resolveForTrackedAgency(
      property.user_id,
      link.source_property.source_agency_id,
    );

    const preloadedImages = new Map<string, Buffer>();
    urls.forEach((url, i) => preloadedImages.set(url, files[i].buffer));

    await this.cmsSyncAdapterFactory
      .getAdapter(IntegrationType.ESTATEWEB)
      .createImages({
        userIntegrationId,
        crmPropertyId: property.integration_property_id,
        userPropertyId: property.id,
        sourceImageUrls: urls,
        preloadedImages,
      });

    await this.userPropertiesService.migrateIntegrationImagesForUserProperty(
      property.user_id,
      property.id,
      MigrateIntegrationImagesMode.REMAP_SOURCES,
    );

    return { uploaded: files.length };
  }

  private imageUrls(images: unknown): string[] {
    return Array.isArray(images)
      ? images.filter(
          (url): url is string => typeof url === 'string' && url.length > 0,
        )
      : [];
  }
}
