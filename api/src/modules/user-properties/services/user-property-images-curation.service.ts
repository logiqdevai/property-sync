import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import {
  countDistinctPhotos,
  isSourceGalleryShrunk,
  peakDistinctPhotos,
} from '@/integrations/estateweb/utils/estateweb-image-reconcile.util';
import { normalizeSourceImageIdentity } from '../utils/duplicate-watermark-detection.util';

// Bookkeeping for hand-edited ("curated") property photos, shared by every
// action that changes a property's photos by hand (delete / reorder / copy in
// on the CRM, watermark replacement) so each one leaves UserProperty.images
// matching what the user did -- otherwise the next CRM push, which makes the
// CRM gallery equal UserProperty.images, would undo it.
@Injectable()
export class UserPropertyImagesCurationService {
  constructor(private readonly prisma: PrismaService) {}

  // The max_image_count of the tracker this property belongs to
  // (null = keep all, or no tracker found).
  async resolveImageCap(userPropertyId: string): Promise<number | null> {
    const property = await this.prisma.userProperty.findUnique({
      where: { id: userPropertyId },
      select: {
        user_id: true,
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
    const agencyId =
      property?.canonical_property.source_links[0]?.source_property
        .source_agency_id;
    if (!property || !agencyId) return null;
    const tracker = await this.prisma.userTrackedAgency.findFirst({
      where: { user_id: property.user_id, source_agency_id: agencyId },
      select: { max_image_count: true },
    });
    return tracker?.max_image_count ?? null;
  }

  // Saves the user's own photo selection and pins it against future crawls.
  // The agency's gallery right now is recorded too, so later crawls can tell
  // photos the agency adds or removes afterwards from ones the user dropped.
  async saveCuratedImages(
    userPropertyId: string,
    images: string[],
  ): Promise<void> {
    const cap = await this.resolveImageCap(userPropertyId);
    const property = await this.prisma.userProperty.findUnique({
      where: { id: userPropertyId },
      select: { canonical_property: { select: { images: true } } },
    });
    const sourceImages = property?.canonical_property.images;
    await this.prisma.userProperty.update({
      where: { id: userPropertyId },
      data: {
        images: images as unknown as Prisma.InputJsonValue,
        images_curated_at: new Date(),
        images_curated_cap: cap,
        images_curated_source_seen: Array.isArray(sourceImages)
          ? (sourceImages as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  // Whether the source gallery looks like a crawler gap (lost half or more of
  // the distinct photos it ever had) -- see isSourceGalleryShrunk().
  async isSourceGalleryShrunk(
    canonicalPropertyId: string,
    canonicalImages: unknown,
    maxImageCount: number | null,
  ): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ old_value: unknown }>>`
      SELECT old_value
      FROM property_history
      WHERE field = 'images'
        AND jsonb_typeof(old_value) = 'array'
        AND property_id = ${canonicalPropertyId}`;
    return isSourceGalleryShrunk(
      countDistinctPhotos(canonicalImages, normalizeSourceImageIdentity),
      peakDistinctPhotos(
        rows.map((row) => row.old_value),
        normalizeSourceImageIdentity,
      ),
      maxImageCount,
    );
  }

  async loadExcludedSourceImages(userPropertyId: string): Promise<string[]> {
    const rows = await this.prisma.integrationProperty.findMany({
      where: { user_property_id: userPropertyId },
      select: { excluded_source_images: true },
    });
    return rows.flatMap((row) =>
      Array.isArray(row.excluded_source_images)
        ? row.excluded_source_images.filter(
            (url): url is string => typeof url === 'string' && url.length > 0,
          )
        : [],
    );
  }

  // A photo the user deliberately brings back (e.g. copies it in again from
  // the normalized gallery) must no longer be treated as deleted.
  async unexcludeSourceImages(
    userPropertyId: string,
    urls: string[],
  ): Promise<void> {
    if (urls.length === 0) return;
    const identities = new Set(urls.map(normalizeSourceImageIdentity));
    const rows = await this.prisma.integrationProperty.findMany({
      where: { user_property_id: userPropertyId },
      select: { id: true, excluded_source_images: true },
    });
    for (const row of rows) {
      if (!Array.isArray(row.excluded_source_images)) continue;
      const before = row.excluded_source_images.filter(
        (url): url is string => typeof url === 'string',
      );
      const after = before.filter(
        (url) => !identities.has(normalizeSourceImageIdentity(url)),
      );
      if (after.length === before.length) continue;
      await this.prisma.integrationProperty.update({
        where: { id: row.id },
        data: {
          excluded_source_images: after.length
            ? (after as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
    }
  }
}
