import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { GcsService } from '@/integrations/storage/gcs/services/gcs.service';
import { PropertyQueryType } from './dto/property-query.schema';
import { MergePropertiesDto } from './dto/merge-properties.dto';
import { Prisma } from 'generated/prisma';
import { serializePropertyForApi } from './utils/property-api-response.util';

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gcsService: GcsService,
  ) {}

  private buildWhere(query: PropertyQueryType): Prisma.PropertyWhereInput {
    return {
      ...(query.status && { status: query.status }),
      ...(query.listing_type && { listing_type: query.listing_type }),
      ...(query.property_type && { property_type: query.property_type }),
      ...(query.city && { city: { contains: query.city, mode: 'insensitive' } }),
      ...(query.duplicate_group_id
        ? { duplicate_group_id: query.duplicate_group_id }
        : query.has_duplicate_group === true
          ? { duplicate_group_id: { not: null } }
          : query.has_duplicate_group === false
            ? { duplicate_group_id: null }
            : {}),
      ...(query.search && {
        OR: [
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
    };
  }

  async findAll(query: PropertyQueryType) {
    const where = this.buildWhere(query);

    const [items, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { updated_at: 'desc' },
      }),
      this.prisma.property.count({ where }),
    ]);

    return {
      data: items.map((item) => serializePropertyForApi(item)),
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

    const existingGroup = properties.find((p) => p.duplicate_group_id)?.duplicate_group_id;
    const groupId = existingGroup ?? randomUUID();

    await this.prisma.property.updateMany({
      where: { id: { in: dto.property_ids } },
      data: { duplicate_group_id: groupId },
    });

    await this.prisma.userProperty.updateMany({
      where: { canonical_property_id: { in: dto.property_ids } },
      data: { duplicate_group_id: groupId },
    });

    return this.prisma.property.findMany({
      where: { id: { in: dto.property_ids } },
    }).then((items) => items.map((item) => serializePropertyForApi(item)));
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
