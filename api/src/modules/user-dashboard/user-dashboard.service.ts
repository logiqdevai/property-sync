import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { PropertyHistoryEventType, PropertyStatus } from 'generated/prisma';
import { UPDATE_EVENT_TYPES } from '@/modules/properties/utils/property-change-filter.util';
import { humanizeHistoryChange } from '@/modules/properties/utils/cms-fields-history.util';
import { UserDashboardResponse } from './entities/user-dashboard.entity';

// Raw history rows fetched; the UI groups them per property.
const RECENT_ACTIVITY_LIMIT = 1000;

const ACTIVITY_PERIOD_DAYS = { day: 1, week: 7, month: 30 } as const;
export type ActivityPeriod = keyof typeof ACTIVITY_PERIOD_DAYS;

@Injectable()
export class UserDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(
    userId: string,
    period?: string,
  ): Promise<UserDashboardResponse> {
    const activityDays =
      ACTIVITY_PERIOD_DAYS[(period as ActivityPeriod) ?? 'week'] ??
      ACTIVITY_PERIOD_DAYS.week;
    const activitySince = new Date(Date.now() - activityDays * 24 * 60 * 60 * 1000);

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
        where: { user_id: userId, created_at: { gte: activitySince } },
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
    const userPropertyIdByCanonicalId = new Map(
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
        activity: [],
      };
    }

    const historyBase = {
      property_id: { in: propertyIds },
      created_at: { gte: activitySince },
    };

    const [propertiesUpdatedThisWeek, propertiesRemovedThisWeek, recentHistory] =
      await Promise.all([
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
            created_at: { gte: activitySince },
          },
          orderBy: { created_at: 'desc' },
          take: RECENT_ACTIVITY_LIMIT,
          include: {
            property: {
              select: {
                title: true,
                source_links: {
                  orderBy: { is_primary_source: 'desc' },
                  take: 1,
                  select: {
                    source_property: {
                      select: { source_agency: { select: { name: true } } },
                    },
                  },
                },
              },
            },
          },
        }),
      ]);

    return {
      stats: {
        total_properties: totalProperties,
        active_properties: activeProperties,
        properties_added_this_week: propertiesAddedThisWeek,
        properties_updated_this_week: propertiesUpdatedThisWeek,
        properties_removed_this_week: propertiesRemovedThisWeek,
        tracked_agencies: trackedAgencies,
      },
      activity: recentHistory.flatMap((entry) => {
        const readable = humanizeHistoryChange(
          entry.field,
          entry.old_value,
          entry.new_value,
        );
        // Order-only cms_fields changes have nothing to show; drop them.
        if (!readable) return [];
        const oldValue = readable.old_value;
        const newValue = readable.new_value;
        return [
          {
            id: entry.id,
            property_id: entry.property_id,
            user_property_id:
              userPropertyIdByCanonicalId.get(entry.property_id) ?? '',
            property_title: entry.property.title,
            agency_name:
              entry.property.source_links[0]?.source_property.source_agency
                .name ?? null,
            event_type: entry.event_type,
            field: entry.field,
            old_value: oldValue,
            new_value: newValue,
            created_at: entry.created_at,
          },
        ];
      }),
    };
  }
}
