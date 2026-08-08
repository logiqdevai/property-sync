import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { GcsService } from '@/integrations/storage/gcs/services/gcs.service';
import { ContentProductionService } from '@/modules/content-publishing/services/content-production.service';
import {
  applyTextTruncatePieces,
  buildLocalizedTruncateUpdates,
  normalizeTextTruncatePieces,
} from '@/modules/user-tracked-agencies/utils/apply-text-truncate-pieces.util';
import { PropertyQueryType } from './dto/property-query.schema';
import { MergePropertiesDto } from './dto/merge-properties.dto';
import { Prisma } from 'generated/prisma';
import { serializePropertyForApi } from './utils/property-api-response.util';
import { buildHistoryChangeFilter } from './utils/property-change-filter.util';

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gcsService: GcsService,
    private readonly contentProductionService: ContentProductionService,
  ) {}

  private buildWhere(query: PropertyQueryType): Prisma.PropertyWhereInput {
    const historyFilter = buildHistoryChangeFilter({
      change: query.change,
      dateFrom: query.date_from,
      dateTo: query.date_to,
    });

    return {
      ...(query.status && { status: query.status }),
      ...(query.listing_type && { listing_type: query.listing_type }),
      ...(query.property_type && { property_type: query.property_type }),
      ...(query.city && {
        city: { contains: query.city, mode: 'insensitive' },
      }),
      ...(query.duplicate_group_id
        ? { duplicate_group_id: query.duplicate_group_id }
        : query.has_duplicate_group === true
          ? { duplicate_group_id: { not: null } }
          : query.has_duplicate_group === false
            ? { duplicate_group_id: null }
            : {}),
      ...(query.search && {
        OR: [
          { id: { equals: query.search } },
          { property_id: { contains: query.search, mode: 'insensitive' } },
          { internal_id: { contains: query.search, mode: 'insensitive' } },
          { title: { contains: query.search, mode: 'insensitive' } },
          { city: { contains: query.search, mode: 'insensitive' } },
          { district: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.price_min != null || query.price_max != null
        ? {
            price: {
              ...(query.price_min != null ? { gte: query.price_min } : {}),
              ...(query.price_max != null ? { lte: query.price_max } : {}),
            },
          }
        : {}),
      ...(query.agency_id && {
        source_links: {
          some: {
            source_property: { source_agency_id: query.agency_id },
          },
        },
      }),
      ...(historyFilter && { history: historyFilter }),
      ...(!query.change && (query.date_from || query.date_to)
        ? {
            created_at: {
              ...(query.date_from && { gte: query.date_from }),
              ...(query.date_to && { lte: query.date_to }),
            },
          }
        : {}),
    };
  }

  async findAll(query: PropertyQueryType) {
    const where = this.buildWhere(query);
    const unlimited = query.limit === 0;

    const [items, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        ...(unlimited
          ? {}
          : {
              skip: (query.page - 1) * query.limit,
              take: query.limit,
            }),
        orderBy:
          query.has_duplicate_group === true
            ? [{ duplicate_group_id: 'asc' }, { updated_at: 'desc' }]
            : { updated_at: 'desc' },
      }),
      this.prisma.property.count({ where }),
    ]);

    const totalPages = unlimited ? 1 : Math.ceil(total / query.limit);

    return {
      data: items.map((item) => serializePropertyForApi(item)),
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

  async count(query: PropertyQueryType) {
    const total = await this.prisma.property.count({
      where: this.buildWhere(query),
    });
    return { total };
  }

  async findOne(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
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
                raw_data: true,
                raw_html_path: true,
                content_hash: true,
                first_seen_at: true,
                last_seen_at: true,
                status: true,
                created_at: true,
                updated_at: true,
                source_agency: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
        history: {
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const sourceLinks = await Promise.all(
      property.source_links.map(async (link) => {
        const rawHtmlPath = link.source_property.raw_html_path;
        let raw_html_url: string | null = null;
        if (rawHtmlPath) {
          try {
            raw_html_url = await this.gcsService.getSignedUrlForPath(
              rawHtmlPath,
              60,
            );
          } catch (error) {
            this.logger.warn(
              `Failed to sign raw HTML for source property ${link.source_property.id}: ${error instanceof Error ? error.message : error}`,
            );
          }
        }
        return {
          ...link,
          source_property: {
            ...link.source_property,
            raw_html_url,
          },
        };
      }),
    );

    return serializePropertyForApi({
      ...property,
      source_links: sourceLinks,
    });
  }

  async merge(dto: MergePropertiesDto) {
    const properties = await this.prisma.property.findMany({
      where: { id: { in: dto.property_ids } },
      select: { id: true, duplicate_group_id: true },
    });

    if (properties.length !== dto.property_ids.length) {
      throw new NotFoundException('One or more properties not found');
    }

    const existingGroup = properties.find(
      (p) => p.duplicate_group_id,
    )?.duplicate_group_id;
    const groupId = existingGroup ?? randomUUID();

    await this.prisma.property.updateMany({
      where: { id: { in: dto.property_ids } },
      data: { duplicate_group_id: groupId },
    });

    await this.prisma.userProperty.updateMany({
      where: { canonical_property_id: { in: dto.property_ids } },
      data: { duplicate_group_id: groupId },
    });

    return this.prisma.property
      .findMany({
        where: { id: { in: dto.property_ids } },
      })
      .then((items) => items.map((item) => serializePropertyForApi(item)));
  }

  async split(id: string) {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    if (!property.duplicate_group_id) {
      throw new BadRequestException('Property is not in a duplicate group');
    }

    const groupId = property.duplicate_group_id;

    const [updated] = await this.prisma.$transaction([
      this.prisma.property.update({
        where: { id },
        data: { duplicate_group_id: null },
      }),
      this.prisma.userProperty.updateMany({
        where: { canonical_property_id: id },
        data: { duplicate_group_id: null },
      }),
    ]);

    await this.clearSingletonDuplicateGroups([groupId]);

    return serializePropertyForApi(updated);
  }

  async splitMany(propertyIds: string[]) {
    const uniqueIds = [...new Set(propertyIds)];
    const properties = await this.prisma.property.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, duplicate_group_id: true },
    });

    if (properties.length !== uniqueIds.length) {
      throw new NotFoundException('One or more properties not found');
    }

    const grouped = properties.filter((property) => property.duplicate_group_id);
    if (grouped.length === 0) {
      throw new BadRequestException(
        'None of the selected properties are in a duplicate group',
      );
    }

    const ids = grouped.map((property) => property.id);
    const groupIds = grouped.map((property) => property.duplicate_group_id!);

    await this.prisma.$transaction([
      this.prisma.property.updateMany({
        where: { id: { in: ids } },
        data: { duplicate_group_id: null },
      }),
      this.prisma.userProperty.updateMany({
        where: { canonical_property_id: { in: ids } },
        data: { duplicate_group_id: null },
      }),
    ]);

    await this.clearSingletonDuplicateGroups(groupIds);

    return { split: ids.length };
  }

  async remove(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      select: { id: true, duplicate_group_id: true },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const groupId = property.duplicate_group_id;
    await this.prisma.property.delete({ where: { id } });

    if (groupId) {
      await this.clearSingletonDuplicateGroups([groupId]);
    }
  }

  async removeMany(propertyIds: string[]) {
    const uniqueIds = [...new Set(propertyIds)];
    const properties = await this.prisma.property.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, duplicate_group_id: true },
    });

    if (properties.length !== uniqueIds.length) {
      throw new NotFoundException('One or more properties not found');
    }

    const groupIds = properties
      .map((property) => property.duplicate_group_id)
      .filter((groupId): groupId is string => !!groupId);

    await this.prisma.property.deleteMany({
      where: { id: { in: uniqueIds } },
    });

    await this.clearSingletonDuplicateGroups(groupIds);

    return { deleted: uniqueIds.length };
  }

  async truncateDescriptions(
    propertyIds: string[],
    texts: string[],
    replacement?: string,
  ) {
    const pieces = normalizeTextTruncatePieces(texts);
    if (pieces.length === 0) {
      throw new BadRequestException('Truncate text is required');
    }

    const replaceWith = replacement ?? '';
    const uniqueIds = [...new Set(propertyIds)];
    const properties = await this.prisma.property.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, title: true, description: true },
    });

    if (properties.length !== uniqueIds.length) {
      throw new NotFoundException('One or more properties not found');
    }

    let updated = 0;
    const changedUserPropertyIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const property of properties) {
        const nextTitle =
          applyTextTruncatePieces(property.title, pieces, replaceWith) ??
          property.title;
        const nextDescription = applyTextTruncatePieces(
          property.description,
          pieces,
          replaceWith,
        );

        const propertyChanged =
          nextTitle !== property.title ||
          nextDescription !== property.description;

        if (propertyChanged) {
          await tx.property.update({
            where: { id: property.id },
            data: {
              title: nextTitle,
              description: nextDescription,
            },
          });
        }

        const linked = await tx.userProperty.findMany({
          where: { canonical_property_id: property.id },
          select: { id: true, title: true, description: true },
        });

        const linkedIds = linked.map((row) => row.id);
        let linkedChanged = false;

        for (const userProperty of linked) {
          const linkedTitle =
            applyTextTruncatePieces(
              userProperty.title,
              pieces,
              replaceWith,
            ) ?? userProperty.title;
          const linkedDescription = applyTextTruncatePieces(
            userProperty.description,
            pieces,
            replaceWith,
          );

          if (
            linkedTitle === userProperty.title &&
            linkedDescription === userProperty.description
          ) {
            continue;
          }

          await tx.userProperty.update({
            where: { id: userProperty.id },
            data: {
              title: linkedTitle,
              description: linkedDescription,
            },
          });
          changedUserPropertyIds.push(userProperty.id);
          linkedChanged = true;
        }

        const localizedRows =
          linkedIds.length > 0
            ? await tx.propertyLocalizedContent.findMany({
                where: { user_property_id: { in: linkedIds } },
                select: { id: true, user_property_id: true, text: true },
              })
            : [];

        const localizedUpdates = buildLocalizedTruncateUpdates(
          localizedRows,
          pieces,
          replaceWith,
        );

        if (localizedUpdates.length > 0) {
          await Promise.all(
            localizedUpdates.map((update) =>
              tx.propertyLocalizedContent.update({
                where: { id: update.id },
                data: { text: update.text, is_stale: false },
              }),
            ),
          );
          for (const update of localizedUpdates) {
            if (!changedUserPropertyIds.includes(update.user_property_id)) {
              changedUserPropertyIds.push(update.user_property_id);
            }
          }
          linkedChanged = true;
        }

        if (propertyChanged || linkedChanged) {
          updated += 1;
        }
      }
    });

    if (changedUserPropertyIds.length > 0) {
      setImmediate(async () => {
        try {
          await this.contentProductionService.produceForUserProperties(
            [...new Set(changedUserPropertyIds)],
            { markStaleFirst: true, forceSyncAi: true },
          );
        } catch {}
      });
    }

    return { updated, total: uniqueIds.length };
  }

  async dedupeGroups(propertyIds: string[]) {
    const uniqueIds = [...new Set(propertyIds)];
    const properties = await this.prisma.property.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, duplicate_group_id: true },
    });

    if (properties.length !== uniqueIds.length) {
      throw new NotFoundException('One or more properties not found');
    }

    const byGroup = new Map<string, string[]>();
    for (const property of properties) {
      if (!property.duplicate_group_id) continue;
      const members = byGroup.get(property.duplicate_group_id) ?? [];
      members.push(property.id);
      byGroup.set(property.duplicate_group_id, members);
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

    await this.prisma.property.deleteMany({
      where: { id: { in: deleteIds } },
    });

    await this.clearSingletonDuplicateGroups(affectedGroupIds);

    return { deleted: deleteIds.length, kept: keepIds };
  }

  private async clearSingletonDuplicateGroups(groupIds: string[]) {
    const uniqueGroupIds = [...new Set(groupIds.filter(Boolean))];

    for (const groupId of uniqueGroupIds) {
      const remaining = await this.prisma.property.count({
        where: { duplicate_group_id: groupId },
      });

      if (remaining !== 1) continue;

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
