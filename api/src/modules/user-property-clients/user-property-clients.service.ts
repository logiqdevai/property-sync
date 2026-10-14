import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { PropertyStatus } from 'generated/prisma';
import {
  CreateUserPropertyClientDto,
  UpdateUserPropertyClientDto,
} from './dto/user-property-client.dto';

@Injectable()
export class UserPropertyClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, userPropertyId: string) {
    const property = await this.findOwnedProperty(userId, userPropertyId);
    return this.prisma.userPropertyClient.findMany({
      where: {
        user_id: userId,
        OR: [
          { user_property_id: property.id },
          // Orphans of a previous incarnation of this property that were not re-attached yet.
          ...(property.sourceAgencyId
            ? [
                {
                  user_property_id: null,
                  source_agency_id: property.sourceAgencyId,
                  property_id: property.property_id,
                },
              ]
            : []),
        ],
      },
      orderBy: { shown_at: 'desc' },
    });
  }

  /** Distinct clients (by name + phone + email) the user already recorded, newest first. */
  async listKnownClients(userId: string) {
    const rows = await this.prisma.userPropertyClient.findMany({
      where: { user_id: userId },
      orderBy: { shown_at: 'desc' },
      select: { name: true, phone: true, email: true },
      take: 1000,
    });
    const seen = new Set<string>();
    const result: { name: string; phone: string | null; email: string | null }[] = [];
    for (const row of rows) {
      const key = [row.name, row.phone, row.email]
        .map((v) => (v ?? '').trim().toLowerCase())
        .join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(row);
    }
    return result;
  }

  async create(
    userId: string,
    userPropertyId: string,
    dto: CreateUserPropertyClientDto,
  ) {
    const property = await this.findOwnedProperty(userId, userPropertyId);
    return this.prisma.userPropertyClient.create({
      data: {
        user_id: userId,
        user_property_id: property.id,
        user_tracked_agency_id: property.userTrackedAgencyId,
        source_agency_id: property.sourceAgencyId,
        property_id: property.property_id,
        internal_id: property.internal_id,
        property_title: property.title,
        source_url: property.sourceUrl,
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim() || null,
        notes: dto.notes?.trim() || null,
        shown_at: dto.shown_at ? new Date(dto.shown_at) : undefined,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateUserPropertyClientDto) {
    await this.assertOwnedClient(userId, id);
    return this.prisma.userPropertyClient.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        phone: dto.phone === undefined ? undefined : dto.phone?.trim() || null,
        email: dto.email === undefined ? undefined : dto.email?.trim() || null,
        notes: dto.notes === undefined ? undefined : dto.notes?.trim() || null,
        shown_at: dto.shown_at ? new Date(dto.shown_at) : undefined,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.assertOwnedClient(userId, id);
    await this.prisma.userPropertyClient.delete({ where: { id } });
    return { id };
  }

  /**
   * Properties delisted from the agency site that have >=1 client and whose alert the user has not
   * dismissed yet. Persistent: it keeps coming back at every login until acknowledged.
   */
  async listDelistedAlerts(userId: string) {
    const clients = await this.prisma.userPropertyClient.findMany({
      where: {
        user_id: userId,
        delisted_ack_at: null,
        user_property: {
          status: { in: [PropertyStatus.REMOVED, PropertyStatus.SOLD] },
        },
      },
      include: {
        user_property: {
          select: { id: true, title: true, status: true, internal_id: true },
        },
      },
      orderBy: { delisted_at: 'desc' },
    });

    const byProperty = new Map<
      string,
      {
        user_property_id: string;
        title: string;
        status: PropertyStatus;
        internal_id: string | null;
        delisted_at: Date | null;
        clients: {
          id: string;
          name: string;
          phone: string | null;
          notes: string | null;
          shown_at: Date;
        }[];
      }
    >();
    for (const client of clients) {
      const property = client.user_property;
      if (!property) continue;
      const entry = byProperty.get(property.id) ?? {
        user_property_id: property.id,
        title: property.title,
        status: property.status,
        internal_id: property.internal_id,
        delisted_at: client.delisted_at,
        clients: [],
      };
      entry.clients.push({
        id: client.id,
        name: client.name,
        phone: client.phone,
        notes: client.notes,
        shown_at: client.shown_at,
      });
      byProperty.set(property.id, entry);
    }
    return Array.from(byProperty.values());
  }

  async acknowledgeDelisted(userId: string, userPropertyIds: string[]) {
    const result = await this.prisma.userPropertyClient.updateMany({
      where: {
        user_id: userId,
        user_property_id: { in: userPropertyIds },
        delisted_ack_at: null,
      },
      data: { delisted_ack_at: new Date() },
    });
    return { acknowledged: result.count };
  }

  private async findOwnedProperty(userId: string, userPropertyId: string) {
    const property = await this.prisma.userProperty.findFirst({
      where: { id: userPropertyId, user_id: userId },
      select: {
        id: true,
        title: true,
        property_id: true,
        internal_id: true,
        canonical_property_id: true,
      },
    });
    if (!property) throw new NotFoundException('Property not found');

    const link = await this.prisma.propertySourceLink.findFirst({
      where: { property_id: property.canonical_property_id },
      include: {
        source_property: {
          select: { source_agency_id: true, source_url: true },
        },
      },
    });
    const sourceAgencyId = link?.source_property.source_agency_id ?? null;
    const tracker = sourceAgencyId
      ? await this.prisma.userTrackedAgency.findUnique({
          where: {
            user_id_source_agency_id: {
              user_id: userId,
              source_agency_id: sourceAgencyId,
            },
          },
          select: { id: true },
        })
      : null;

    return {
      ...property,
      sourceAgencyId,
      sourceUrl: link?.source_property.source_url ?? null,
      userTrackedAgencyId: tracker?.id ?? null,
    };
  }

  private async assertOwnedClient(userId: string, id: string) {
    const client = await this.prisma.userPropertyClient.findFirst({
      where: { id, user_id: userId },
      select: { id: true },
    });
    if (!client) throw new NotFoundException('Client not found');
  }
}
