import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { GcsService } from '@/integrations/storage/gcs/services/gcs.service';
import { Prisma } from 'generated/prisma';
import { SourcePropertyQueryType } from './dto/source-property-query.schema';

const sourceAgencySelect = {
  id: true,
  name: true,
  base_url: true,
} as const;

const listSelect = {
  id: true,
  source_agency_id: true,
  property_id: true,
  internal_id: true,
  source_url: true,
  canonical_url: true,
  raw_title: true,
  raw_price: true,
  raw_location: true,
  raw_property_type: true,
  raw_listing_type: true,
  first_seen_at: true,
  last_seen_at: true,
  status: true,
  created_at: true,
  updated_at: true,
  source_agency: { select: sourceAgencySelect },
  _count: { select: { property_links: true } },
} as const;

@Injectable()
export class SourcePropertiesService {
  private readonly logger = new Logger(SourcePropertiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gcsService: GcsService,
  ) {}

  private buildWhere(
    query: SourcePropertyQueryType,
  ): Prisma.SourcePropertyWhereInput {
    return {
      ...(query.status && { status: query.status }),
      ...(query.agency_id && { source_agency_id: query.agency_id }),
      ...(query.search && {
        OR: [
          { id: { equals: query.search } },
          { property_id: { contains: query.search, mode: 'insensitive' } },
          { internal_id: { contains: query.search, mode: 'insensitive' } },
          { raw_title: { contains: query.search, mode: 'insensitive' } },
          { raw_location: { contains: query.search, mode: 'insensitive' } },
          { source_url: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
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

  async findAll(query: SourcePropertyQueryType) {
    const where = this.buildWhere(query);
    const unlimited = query.limit === 0;

    const [items, total] = await Promise.all([
      this.prisma.sourceProperty.findMany({
        where,
        select: listSelect,
        ...(unlimited
          ? {}
          : {
              skip: (query.page - 1) * query.limit,
              take: query.limit,
            }),
        orderBy: { updated_at: 'desc' },
      }),
      this.prisma.sourceProperty.count({ where }),
    ]);

    const totalPages = unlimited ? 1 : Math.ceil(total / query.limit);

    return {
      data: items.map(({ _count, ...item }) => ({
        ...item,
        linked_property_count: _count.property_links,
      })),
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

  async count(query: SourcePropertyQueryType) {
    const total = await this.prisma.sourceProperty.count({
      where: this.buildWhere(query),
    });
    return { total };
  }

  async findOne(id: string) {
    const sourceProperty = await this.prisma.sourceProperty.findUnique({
      where: { id },
      include: {
        source_agency: { select: sourceAgencySelect },
        property_links: {
          select: {
            id: true,
            property_id: true,
            is_primary_source: true,
            confidence_score: true,
            property: {
              select: {
                id: true,
                title: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!sourceProperty) {
      throw new NotFoundException('Source property not found');
    }

    let raw_html_url: string | null = null;
    if (sourceProperty.raw_html_path) {
      try {
        raw_html_url = await this.gcsService.getSignedUrlForPath(
          sourceProperty.raw_html_path,
          60,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to sign raw HTML for source property ${id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return {
      ...sourceProperty,
      raw_html_url,
      linked_property_count: sourceProperty.property_links.length,
    };
  }

  async remove(id: string) {
    const existing = await this.prisma.sourceProperty.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Source property not found');
    }

    await this.prisma.sourceProperty.delete({ where: { id } });
  }

  async removeMany(sourcePropertyIds: string[]) {
    const uniqueIds = [...new Set(sourcePropertyIds)];
    const existing = await this.prisma.sourceProperty.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });

    if (existing.length !== uniqueIds.length) {
      throw new NotFoundException('One or more source properties not found');
    }

    await this.prisma.sourceProperty.deleteMany({
      where: { id: { in: uniqueIds } },
    });

    return { deleted: uniqueIds.length };
  }
}
