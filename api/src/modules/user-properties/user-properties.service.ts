import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CmsSyncOrchestratorService } from '@/modules/cms-sync/services/cms-sync-orchestrator.service';
import { UserPropertyQueryType } from './dto/user-property-query.schema';
import { UpdateUserPropertyDto } from './dto/update-user-property.dto';
import { Prisma, Property, PropertyStatus } from 'generated/prisma';
import { serializePropertyForApi } from '@/modules/properties/utils/property-api-response.util';
import {
  applyTextTruncatePieces,
  normalizeTextTruncatePieces,
} from '@/modules/user-tracked-agencies/utils/apply-text-truncate-pieces.util';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly cmsSyncOrchestratorService: CmsSyncOrchestratorService,
  ) {}

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
      ...(query.date_from || query.date_to
        ? {
            created_at: {
              ...(query.date_from && { gte: query.date_from }),
              ...(query.date_to && { lte: query.date_to }),
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

    const unlimited = query.limit === 0;
    const [items, total] = await Promise.all([
      this.prisma.userProperty.findMany({
        where,
        ...(unlimited
          ? {}
          : {
              skip: (query.page - 1) * query.limit,
              take: query.limit,
            }),
        orderBy: { updated_at: 'desc' },
        include: {
          canonical_property: {
            select: { duplicate_group_id: true },
          },
        },
      }),
      this.prisma.userProperty.count({ where }),
    ]);

    const totalPages = unlimited ? 1 : Math.ceil(total / query.limit);

    return {
      data: items.map(({ canonical_property, ...item }) =>
        serializePropertyForApi({
          ...item,
          duplicate_group_id: canonical_property.duplicate_group_id,
        }),
      ),
      pagination: {
        page: unlimited ? 1 : query.page,
        limit: query.limit,
        total,
        total_pages: totalPages,
        has_next: unlimited ? false : query.page < totalPages,
        has_prev: unlimited ? false : query.page > 1,
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
    const existing = await this.prisma.userProperty.findFirst({
      where: { id, user_id: userId },
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

    if (!existing) {
      throw new NotFoundException('Property not found');
    }

    const sourceAgencyId =
      existing.canonical_property.source_links[0]?.source_property
        .source_agency_id;
    let pendingCrmUpdate = existing.pending_crm_update;

    if (
      existing.integration_property_id &&
      sourceAgencyId &&
      !pendingCrmUpdate
    ) {
      const tracker = await this.prisma.userTrackedAgency.findUnique({
        where: {
          user_id_source_agency_id: {
            user_id: userId,
            source_agency_id: sourceAgencyId,
          },
        },
        select: { auto_update_to_crm: true, enabled: true },
      });

      if (tracker?.enabled && !tracker.auto_update_to_crm) {
        pendingCrmUpdate = true;
      }
    }

    return serializePropertyForApi(
      await this.prisma.userProperty.update({
        where: { id },
        data: {
          ...dto,
          is_modified: true,
          pending_crm_update: pendingCrmUpdate,
        },
      }),
    );
  }

  async pushToCrm(userId: string, ids: string | string[]) {
    const idList = [...new Set(Array.isArray(ids) ? ids : [ids])];
    if (idList.length === 0) {
      throw new BadRequestException('No properties selected');
    }

    const owned = await this.prisma.userProperty.findMany({
      where: { id: { in: idList }, user_id: userId },
      select: { id: true },
    });

    if (owned.length === 0) {
      throw new NotFoundException('Property not found');
    }

    try {
      const result =
        await this.cmsSyncOrchestratorService.planAndEnqueueManualPropertyUpdate(
          userId,
          idList,
        );

      if (idList.length === 1 && result.queued === 1) {
        return serializePropertyForApi(
          await this.prisma.userProperty.findFirstOrThrow({
            where: { id: idList[0], user_id: userId },
          }),
        );
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(message);
    }
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

  async truncateDescriptions(userId: string, ids: string[], text: string) {
    const pieces = normalizeTextTruncatePieces([text]);
    if (pieces.length === 0) {
      throw new BadRequestException('Truncate text is required');
    }

    const uniqueIds = [...new Set(ids)];
    const properties = await this.prisma.userProperty.findMany({
      where: { user_id: userId, id: { in: uniqueIds } },
      select: {
        id: true,
        title: true,
        description: true,
        canonical_property_id: true,
      },
    });

    if (properties.length !== uniqueIds.length) {
      throw new NotFoundException('One or more properties not found');
    }

    const propertyUpdates = properties.flatMap((property) => {
      const nextTitle =
        applyTextTruncatePieces(property.title, pieces) ?? property.title;
      const nextDescription = applyTextTruncatePieces(
        property.description,
        pieces,
      );

      if (
        nextTitle === property.title &&
        nextDescription === property.description
      ) {
        return [];
      }

      return [
        {
          id: property.id,
          title: nextTitle,
          description: nextDescription,
        },
      ];
    });

    const canonicalPropertyIds = [
      ...new Set(properties.map((property) => property.canonical_property_id)),
    ];

    await this.prisma.$transaction(
      async (tx) => {
        if (propertyUpdates.length > 0) {
          await Promise.all(
            propertyUpdates.map((update) =>
              tx.userProperty.update({
                where: { id: update.id },
                data: {
                  title: update.title,
                  description: update.description,
                },
              }),
            ),
          );
        }

        const links = await tx.propertySourceLink.findMany({
          where: { property_id: { in: canonicalPropertyIds } },
          select: {
            source_property: { select: { source_agency_id: true } },
          },
        });

        const sourceAgencyIds = [
          ...new Set(
            links
              .map((link) => link.source_property.source_agency_id)
              .filter((agencyId): agencyId is string => Boolean(agencyId)),
          ),
        ];

        if (sourceAgencyIds.length === 0) return;

        const trackers = await tx.userTrackedAgency.findMany({
          where: {
            user_id: userId,
            source_agency_id: { in: sourceAgencyIds },
          },
          select: { id: true, text_truncate_pieces: true },
        });

        const trackerUpdates = trackers.flatMap((tracker) => {
          const nextPieces = normalizeTextTruncatePieces([
            ...tracker.text_truncate_pieces,
            ...pieces,
          ]);
          if (
            nextPieces.length === tracker.text_truncate_pieces.length &&
            nextPieces.every(
              (piece, index) => piece === tracker.text_truncate_pieces[index],
            )
          ) {
            return [];
          }

          return [{ id: tracker.id, text_truncate_pieces: nextPieces }];
        });

        if (trackerUpdates.length === 0) return;

        await Promise.all(
          trackerUpdates.map((update) =>
            tx.userTrackedAgency.update({
              where: { id: update.id },
              data: { text_truncate_pieces: update.text_truncate_pieces },
            }),
          ),
        );
      },
      { timeout: 30_000 },
    );

    return { updated: propertyUpdates.length, total: uniqueIds.length };
  }

  async splitMany(userId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    const properties = await this.prisma.userProperty.findMany({
      where: { user_id: userId, id: { in: uniqueIds } },
      select: {
        id: true,
        duplicate_group_id: true,
        canonical_property_id: true,
        canonical_property: { select: { duplicate_group_id: true } },
      },
    });

    if (properties.length !== uniqueIds.length) {
      throw new NotFoundException('One or more properties not found');
    }

    const grouped = properties.filter(
      (property) =>
        property.canonical_property.duplicate_group_id ??
        property.duplicate_group_id,
    );

    if (grouped.length === 0) {
      throw new BadRequestException(
        'None of the selected properties are in a duplicate group',
      );
    }

    const userPropertyIds = grouped.map((property) => property.id);
    const canonicalIds = [
      ...new Set(grouped.map((property) => property.canonical_property_id)),
    ];
    const groupIds = grouped
      .map(
        (property) =>
          property.canonical_property.duplicate_group_id ??
          property.duplicate_group_id,
      )
      .filter((groupId): groupId is string => !!groupId);

    await this.prisma.$transaction([
      this.prisma.property.updateMany({
        where: { id: { in: canonicalIds } },
        data: { duplicate_group_id: null },
      }),
      this.prisma.userProperty.updateMany({
        where: {
          OR: [
            { id: { in: userPropertyIds } },
            { canonical_property_id: { in: canonicalIds } },
          ],
        },
        data: { duplicate_group_id: null },
      }),
    ]);

    await this.clearSingletonUserDuplicateGroups(userId, groupIds);

    return { split: grouped.length };
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
