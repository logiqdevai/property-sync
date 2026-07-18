import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { PropertyStatus } from 'generated/prisma';
import { UserDashboardResponse } from './entities/user-dashboard.entity';

const RECENT_ACTIVITY_LIMIT = 10;

@Injectable()
export class UserDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(userId: string): Promise<UserDashboardResponse> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalProperties,
      activeProperties,
      modifiedProperties,
      propertiesAddedThisWeek,
      trackedAgencies,
      trackedProperties,
    ] = await Promise.all([
      this.prisma.userProperty.count({ where: { user_id: userId } }),
      this.prisma.userProperty.count({
        where: { user_id: userId, status: PropertyStatus.ACTIVE },
      }),
      this.prisma.userProperty.count({
        where: { user_id: userId, is_modified: true },
      }),
      this.prisma.userProperty.count({
        where: { user_id: userId, created_at: { gte: sevenDaysAgo } },
      }),
      this.prisma.userTrackedAgency.count({
        where: { user_id: userId, enabled: true },
      }),
      this.prisma.userProperty.findMany({
        where: { user_id: userId },
        select: { canonical_property_id: true },
      }),
    ]);

    const propertyIds = trackedProperties.map((p) => p.canonical_property_id);

    const recentHistory = propertyIds.length
      ? await this.prisma.propertyHistory.findMany({
          where: { property_id: { in: propertyIds } },
          orderBy: { created_at: 'desc' },
          take: RECENT_ACTIVITY_LIMIT,
          include: { property: { select: { title: true } } },
        })
      : [];

    return {
      stats: {
        total_properties: totalProperties,
        active_properties: activeProperties,
        modified_properties: modifiedProperties,
        properties_added_this_week: propertiesAddedThisWeek,
        tracked_agencies: trackedAgencies,
      },
      activity: recentHistory.map((entry) => ({
        id: entry.id,
        property_id: entry.property_id,
        property_title: entry.property.title,
        event_type: entry.event_type,
        field: entry.field,
        old_value: entry.old_value,
        new_value: entry.new_value,
        created_at: entry.created_at,
      })),
    };
  }
}
