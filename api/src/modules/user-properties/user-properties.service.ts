import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { UserPropertyQueryType } from './dto/user-property-query.schema';
import { UpdateUserPropertyDto } from './dto/update-user-property.dto';
import { Prisma, Property, PropertyStatus } from 'generated/prisma';
import { serializePropertyForApi } from '@/modules/properties/utils/property-api-response.util';
import { applyTextTruncatePieces } from '@/modules/user-tracked-agencies/utils/apply-text-truncate-pieces.util';

export type PropertySyncChangeType = 'created' | 'updated' | 'removed';

export interface SyncForPropertyOptions {
  userTrackedAgencyId?: string;
  sourceAgencyId?: string;
  changeType: PropertySyncChangeType;
}

export interface SyncForPropertyResult {
  user_property_id: string;
  change_type: PropertySyncChangeType;
  user_tracked_agency_id: string;
}

@Injectable()
export class UserPropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveFilterSourceAgencyId(
    userId: string,
    query: UserPropertyQueryType,
  ): Promise<string | undefined | null> {
    let sourceAgencyId = query.agency_id;

    if (query.user_tracked_agency_id) {
      const tracker = await this.prisma.userTrackedAgency.findFirst({
        where: {
          id: query.user_tracked_agency_id,
          user_id: userId,
        },
        select: { source_agency_id: true },
      });

      if (!tracker) {
        return null;
      }

      sourceAgencyId = tracker.source_agency_id;
    }

    return sourceAgencyId;
  }

  private buildWhere(
    userId: string,
    query: UserPropertyQueryType,
    sourceAgencyId?: string,
  ): Prisma.UserPropertyWhereInput {
    const hasCanonicalFilter =
      !!sourceAgencyId || query.has_duplicate_group !== undefined;

    return {
      user_id: userId,
      ...(query.status && { status: query.status }),
      ...(query.city && {
        city: { contains: query.city, mode: 'insensitive' },
      }),
      ...(hasCanonicalFilter && {
        canonical_property: {
          ...(sourceAgencyId && {
            source_links: {
              some: {
                source_property: { source_agency_id: sourceAgencyId },
              },
            },
          }),
          ...(query.has_duplicate_group === true && {
            duplicate_group_id: { not: null },
          }),
          ...(query.has_duplicate_group === false && {
            duplicate_group_id: null,
          }),
        },
      }),
      ...(query.price_min != null || query.price_max != null
        ? {
            price: {
              ...(query.price_min != null ? { gte: query.price_min } : {}),
              ...(query.price_max != null ? { lte: query.price_max } : {}),
            },
          }
        : {}),
    };
  }

  async findAll(userId: string, query: UserPropertyQueryType) {
    const sourceAgencyId = await this.resolveFilterSourceAgencyId(
      userId,
      query,
    );

    if (sourceAgencyId === null) {
      return {
        data: [],
        pagination: {
          page: query.page,
          limit: query.limit,
          total: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        },
      };
    }

    const where = this.buildWhere(userId, query, sourceAgencyId);

    const [items, total] = await Promise.all([
      this.prisma.userProperty.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { updated_at: 'desc' },
        include: {
          canonical_property: {
            select: { duplicate_group_id: true },
          },
        },
      }),
      this.prisma.userProperty.count({ where }),
    ]);

    return {
      data: items.map(({ canonical_property, ...item }) =>
        serializePropertyForApi({
          ...item,
          duplicate_group_id: canonical_property.duplicate_group_id,
        }),
      ),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        total_pages: Math.ceil(total / query.limit),
        has_next: query.page < Math.ceil(total / query.limit),
        has_prev: query.page > 1,
      },
    };
  }

  async count(userId: string, query: UserPropertyQueryType) {
    const sourceAgencyId = await this.resolveFilterSourceAgencyId(
      userId,
      query,
    );

    if (sourceAgencyId === null) {
      return { total: 0 };
    }

    const total = await this.prisma.userProperty.count({
      where: this.buildWhere(userId, query, sourceAgencyId),
    });
    return { total };
  }

  async findOne(userId: string, id: string) {
    const userProperty = await this.prisma.userProperty.findFirst({
      where: { id, user_id: userId },
      include: {
        canonical_property: {
          include: {
            source_links: {
              include: {
                source_property: {
                  select: {
                    id: true,
                    source_url: true,
                    property_id: true,
                    internal_id: true,
                    raw_title: true,
                    raw_description: true,
                    raw_price: true,
                    raw_location: true,
                    raw_property_type: true,
                    raw_listing_type: true,
                    raw_sqm: true,
                    raw_bedrooms: true,
                    raw_bathrooms: true,
                    last_seen_at: true,
                    status: true,
                  },
                },
              },
            },
            history: {
              orderBy: { created_at: 'desc' },
            },
          },
        },
      },
    });

    if (!userProperty) {
      throw new NotFoundException('Property not found');
    }

    const { canonical_property, ...rest } = userProperty;

    return serializePropertyForApi({
      ...rest,
      duplicate_group_id: canonical_property.duplicate_group_id,
      source_links: canonical_property.source_links,
      history: canonical_property.history,
    });
  }

  async update(userId: string, id: string, dto: UpdateUserPropertyDto) {
    await this.assertOwned(userId, id);

    return serializePropertyForApi(
      await this.prisma.userProperty.update({
        where: { id },
        data: dto,
      }),
    );
  }

  async resync(userId: string, id: string) {
    const userProperty = await this.prisma.userProperty.findFirst({
      where: { id, user_id: userId },
      include: { canonical_property: true },
    });

    if (!userProperty) {
      throw new NotFoundException('Property not found');
    }

    return serializePropertyForApi(
      await this.prisma.userProperty.update({
        where: { id },
        data: {
          ...this.mapFromCanonical(userProperty.canonical_property),
          is_modified: false,
          last_synced_at: new Date(),
        },
      }),
    );
  }

  async remove(userId: string, id: string) {
    const property = await this.prisma.userProperty.findFirst({
      where: { id, user_id: userId },
      select: {
        id: true,
        duplicate_group_id: true,
        canonical_property: { select: { duplicate_group_id: true } },
      },
    });

    if (!property) {
      throw new ForbiddenException('Property not found');
    }

    const groupId =
      property.canonical_property.duplicate_group_id ??
      property.duplicate_group_id;

    await this.prisma.userProperty.delete({ where: { id } });

    if (groupId) {
      await this.clearSingletonUserDuplicateGroups(userId, [groupId]);
    }
  }

  async removeMany(userId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    const owned = await this.prisma.userProperty.findMany({
      where: { user_id: userId, id: { in: uniqueIds } },
      select: {
        id: true,
        duplicate_group_id: true,
        canonical_property: { select: { duplicate_group_id: true } },
      },
    });

    if (owned.length !== uniqueIds.length) {
      throw new NotFoundException('One or more properties not found');
    }

    const groupIds = owned
      .map(
        (property) =>
          property.canonical_property.duplicate_group_id ??
          property.duplicate_group_id,
      )
      .filter((groupId): groupId is string => !!groupId);

    await this.prisma.userProperty.deleteMany({
      where: { user_id: userId, id: { in: uniqueIds } },
    });

    await this.clearSingletonUserDuplicateGroups(userId, groupIds);

    return { deleted: uniqueIds.length };
  }

  async dedupeGroups(userId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    const properties = await this.prisma.userProperty.findMany({
      where: { user_id: userId, id: { in: uniqueIds } },
      select: {
        id: true,
        duplicate_group_id: true,
        canonical_property: { select: { duplicate_group_id: true } },
      },
    });

    if (properties.length !== uniqueIds.length) {
      throw new NotFoundException('One or more properties not found');
    }

    const byGroup = new Map<string, string[]>();
    for (const property of properties) {
      const groupId =
        property.canonical_property.duplicate_group_id ??
        property.duplicate_group_id;
      if (!groupId) continue;
      const members = byGroup.get(groupId) ?? [];
      members.push(property.id);
      byGroup.set(groupId, members);
    }

    const keepIds: string[] = [];
    const deleteIds: string[] = [];
    const affectedGroupIds: string[] = [];

    for (const [groupId, members] of byGroup) {
      if (members.length < 2) continue;
      const sorted = [...members].sort();
      keepIds.push(sorted[0]);
      deleteIds.push(...sorted.slice(1));
      affectedGroupIds.push(groupId);
    }

    if (deleteIds.length === 0) {
      throw new BadRequestException(
        'Select at least two properties from the same duplicate group',
      );
    }

    await this.prisma.userProperty.deleteMany({
      where: { user_id: userId, id: { in: deleteIds } },
    });

    await this.clearSingletonUserDuplicateGroups(userId, affectedGroupIds);

    return { deleted: deleteIds.length, kept: keepIds };
  }

  private async clearSingletonUserDuplicateGroups(
    userId: string,
    groupIds: string[],
  ) {
    const uniqueGroupIds = [...new Set(groupIds.filter(Boolean))];

    for (const groupId of uniqueGroupIds) {
      const remaining = await this.prisma.userProperty.findMany({
        where: {
          user_id: userId,
          OR: [
            { duplicate_group_id: groupId },
            { canonical_property: { duplicate_group_id: groupId } },
          ],
        },
        select: { id: true },
      });

      if (remaining.length !== 1) continue;

      await this.prisma.userProperty.update({
        where: { id: remaining[0].id },
        data: { duplicate_group_id: null },
      });

      const canonicalRemaining = await this.prisma.property.count({
        where: { duplicate_group_id: groupId },
      });

      if (canonicalRemaining === 1) {
        await this.prisma.$transaction([
          this.prisma.property.updateMany({
            where: { duplicate_group_id: groupId },
            data: { duplicate_group_id: null },
          }),
          this.prisma.userProperty.updateMany({
            where: { duplicate_group_id: groupId },
            data: { duplicate_group_id: null },
          }),
        ]);
      }
    }
  }

  async syncForProperty(
    propertyId: string,
    options: SyncForPropertyOptions,
  ): Promise<SyncForPropertyResult[]> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) return [];

    const sourceAgencyId =
      options.sourceAgencyId ?? (await this.resolveSourceAgencyId(propertyId));

    if (!sourceAgencyId) return [];

    const trackers = options.userTrackedAgencyId
      ? await this.prisma.userTrackedAgency.findMany({
          where: {
            id: options.userTrackedAgencyId,
            enabled: true,
          },
        })
      : await this.prisma.userTrackedAgency.findMany({
          where: {
            source_agency_id: sourceAgencyId,
            enabled: true,
          },
        });

    const results: SyncForPropertyResult[] = [];

    for (const tracker of trackers) {
      if (options.changeType === 'created' && !tracker.track_new_listings) {
        continue;
      }

      if (options.changeType === 'updated' && !tracker.track_updated_listings) {
        continue;
      }

      if (options.changeType === 'removed' && !tracker.track_removed_listings) {
        continue;
      }

      const existing = await this.prisma.userProperty.findUnique({
        where: {
          user_id_canonical_property_id: {
            user_id: tracker.user_id,
            canonical_property_id: propertyId,
          },
        },
      });

      const canonicalFields = this.mapFromCanonical(
        property,
        tracker.text_truncate_pieces,
      );

      if (options.changeType === 'created') {
        if (existing) continue;
        const created = await this.prisma.userProperty.create({
          data: {
            user_id: tracker.user_id,
            canonical_property_id: propertyId,
            ...canonicalFields,
          },
        });
        results.push({
          user_property_id: created.id,
          change_type: 'created',
          user_tracked_agency_id: tracker.id,
        });
        continue;
      }

      if (options.changeType === 'removed') {
        if (!existing) continue;
        await this.prisma.userProperty.update({
          where: { id: existing.id },
          data: {
            status: PropertyStatus.REMOVED,
            last_synced_at: new Date(),
          },
        });
        results.push({
          user_property_id: existing.id,
          change_type: 'removed',
          user_tracked_agency_id: tracker.id,
        });
        continue;
      }

      if (!existing) {
        if (!tracker.track_new_listings) continue;
        const created = await this.prisma.userProperty.create({
          data: {
            user_id: tracker.user_id,
            canonical_property_id: propertyId,
            ...canonicalFields,
          },
        });
        results.push({
          user_property_id: created.id,
          change_type: 'created',
          user_tracked_agency_id: tracker.id,
        });
        continue;
      }

      await this.prisma.userProperty.update({
        where: { id: existing.id },
        data: canonicalFields,
      });
      results.push({
        user_property_id: existing.id,
        change_type: 'updated',
        user_tracked_agency_id: tracker.id,
      });
    }

    return results;
  }

  private mapFromCanonical(property: Property, textTruncatePieces?: string[]) {
    return {
      property_id: property.property_id,
      internal_id: property.internal_id,
      title:
        applyTextTruncatePieces(property.title, textTruncatePieces) ??
        property.title,
      description: applyTextTruncatePieces(
        property.description,
        textTruncatePieces,
      ),
      listing_type: property.listing_type,
      property_type: property.property_type,
      status: property.status,
      price: property.price,
      currency: property.currency,
      city: property.city,
      district: property.district,
      address: property.address,
      postal_code: property.postal_code,
      country: property.country,
      latitude: property.latitude,
      longitude: property.longitude,
      square_meters: property.square_meters,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      floor: property.floor,
      construction_year: property.construction_year,
      renovation_year: property.renovation_year,
      estateweb_type_id: property.estateweb_type_id,
      estateweb_location_id: property.estateweb_location_id,
      cms_fields: property.cms_fields ?? undefined,
      cms_metadata: property.cms_metadata ?? undefined,
      video_url: property.video_url,
      distance_airport: property.distance_airport,
      distance_port: property.distance_port,
      distance_beach: property.distance_beach,
      price_start: property.price_start,
      price_web: property.price_web,
      features: property.features ?? undefined,
      images: property.images ?? undefined,
      normalized_data: property.normalized_data ?? undefined,
      duplicate_group_id: property.duplicate_group_id,
      last_synced_at: new Date(),
      is_modified: false,
    };
  }

  private async resolveSourceAgencyId(
    propertyId: string,
  ): Promise<string | null> {
    const link = await this.prisma.propertySourceLink.findFirst({
      where: { property_id: propertyId },
      include: {
        source_property: { select: { source_agency_id: true } },
      },
    });

    return link?.source_property.source_agency_id ?? null;
  }

  private async assertOwned(userId: string, id: string) {
    const userProperty = await this.prisma.userProperty.findFirst({
      where: { id, user_id: userId },
      select: { id: true },
    });

    if (!userProperty) {
      throw new ForbiddenException('Property not found');
    }
  }
}
