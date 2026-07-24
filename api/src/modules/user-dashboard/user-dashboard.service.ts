import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { PropertyHistoryEventType, PropertyStatus } from 'generated/prisma';
import { UPDATE_EVENT_TYPES } from '@/modules/properties/utils/property-change-filter.util';
import {
  UserDashboardActivityItem,
  UserDashboardResponse,
} from './entities/user-dashboard.entity';

const RECENT_LISTINGS_LIMIT = 5;

@Injectable()
export class UserDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(userId: string): Promise<UserDashboardResponse> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalProperties,
      activeProperties,
      propertiesAddedThisWeek,
      trackedAgencies,
      trackedProperties,
    ] = await Promise.all([
      this.prisma.userProperty.count({ where: { user_id: userId } }),
      this.prisma.userProperty.count({
        where: { user_id: userId, status: PropertyStatus.ACTIVE },
      }),
      this.prisma.userProperty.count({
        where: { user_id: userId, created_at: { gte: sevenDaysAgo } },
      }),
      this.prisma.userTrackedAgency.count({
        where: { user_id: userId, enabled: true },
      }),
      this.prisma.userProperty.findMany({
        where: { user_id: userId },
        select: { id: true, canonical_property_id: true },
      }),
    ]);

    const propertyIds = trackedProperties.map((p) => p.canonical_property_id);
    const userPropertyByCanonicalId = new Map(
      trackedProperties.map((p) => [p.canonical_property_id, p.id]),
    );

    if (propertyIds.length === 0) {
      return {
        stats: {
          total_properties: totalProperties,
          active_properties: activeProperties,
          properties_added_this_week: propertiesAddedThisWeek,
          properties_updated_this_week: 0,
          properties_removed_this_week: 0,
          tracked_agencies: trackedAgencies,
        },
        listings: { added: [], updated: [], removed: [] },
      };
    }

    const historyBase = {
      property_id: { in: propertyIds },
      created_at: { gte: sevenDaysAgo },
    };

    const [
      propertiesUpdatedThisWeek,
      propertiesRemovedThisWeek,
      recentAdded,
      recentUpdated,
      recentRemoved,
    ] = await Promise.all([
      this.prisma.propertyHistory
        .groupBy({
          by: ['property_id'],
          where: {
            ...historyBase,
            event_type: { in: UPDATE_EVENT_TYPES },
          },
        })
        .then((rows) => rows.length),
      this.prisma.propertyHistory
        .groupBy({
          by: ['property_id'],
          where: {
            ...historyBase,
            event_type: PropertyHistoryEventType.REMOVED,
          },
        })
        .then((rows) => rows.length),
      this.prisma.propertyHistory.findMany({
        where: {
          property_id: { in: propertyIds },
          event_type: PropertyHistoryEventType.CREATED,
        },
        orderBy: { created_at: 'desc' },
        take: RECENT_LISTINGS_LIMIT,
        include: { property: { select: { title: true } } },
      }),
      this.prisma.propertyHistory.findMany({
        where: {
          property_id: { in: propertyIds },
          event_type: { in: UPDATE_EVENT_TYPES },
        },
        orderBy: { created_at: 'desc' },
        take: RECENT_LISTINGS_LIMIT,
        include: { property: { select: { title: true } } },
      }),
      this.prisma.propertyHistory.findMany({
        where: {
          property_id: { in: propertyIds },
          event_type: PropertyHistoryEventType.REMOVED,
        },
        orderBy: { created_at: 'desc' },
        take: RECENT_LISTINGS_LIMIT,
        include: { property: { select: { title: true } } },
      }),
    ]);

    const mapEntry = (
      entry: (typeof recentAdded)[number],
    ): UserDashboardActivityItem => ({
      id: entry.id,
      property_id: entry.property_id,
      user_property_id:
        userPropertyByCanonicalId.get(entry.property_id) ?? null,
      property_title: entry.property.title,
      event_type: entry.event_type,
      field: entry.field,
      old_value: entry.old_value,
      new_value: entry.new_value,
      created_at: entry.created_at,
    });

    return {
      stats: {
        total_properties: totalProperties,
        active_properties: activeProperties,
        properties_added_this_week: propertiesAddedThisWeek,
        properties_updated_this_week: propertiesUpdatedThisWeek,
        properties_removed_this_week: propertiesRemovedThisWeek,
        tracked_agencies: trackedAgencies,
      },
      listings: {
        added: recentAdded.map(mapEntry),
        updated: recentUpdated.map(mapEntry),
        removed: recentRemoved.map(mapEntry),
      },
    };
  }
}
