import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import {
  AffectedUserProperty,
  CmsSyncBatch,
  CmsSyncBatchOperation,
  CmsSyncOperationType,
} from '../interfaces/cms-sync-batch.interface';
import { UserProperty, PropertyStatus } from 'generated/prisma';

export interface TrackerBatchInput {
  crawl_run_id: string;
  user_integration_id: string;
  user_tracked_agency_id: string;
  source_agency_id: string;
  concurrent_insertions: number;
  insertion_interval_minutes: number;
  max_properties: number | null;
  affected: AffectedUserProperty[];
}

interface GroupContext {
  duplicate_group_id: string | null;
  affected: AffectedUserProperty[];
  allMembers: UserProperty[];
  representative: UserProperty;
  hasActiveMember: boolean;
  sharedIntegrationPropertyId: string | null;
}

@Injectable()
export class CmsSyncBatchService {
  constructor(private readonly prisma: PrismaService) {}

  async buildBatch(input: TrackerBatchInput): Promise<CmsSyncBatch> {
    const userId = await this.resolveUserId(input.user_tracked_agency_id);
    const affectedUserProperties = await this.loadAffectedUserProperties(
      input.affected.map((a) => a.user_property_id),
    );
    const affectedMap = new Map(
      input.affected.map((a) => [a.user_property_id, a.change_type]),
    );

    const grouped = this.groupByDuplicateGroup(
      affectedUserProperties,
      affectedMap,
    );

    const operations: CmsSyncBatchOperation[] = [];

    for (const group of grouped) {
      const context = await this.resolveGroupContext(
        userId,
        group.duplicate_group_id,
        group.items,
      );
      const op = this.resolveGroupOperation(context);
      if (op) {
        operations.push(op);
      }
    }

    const cappedOperations = await this.applyMaxPropertiesCap(
      userId,
      input.source_agency_id,
      input.max_properties,
      operations,
    );

    return {
      crawl_run_id: input.crawl_run_id,
      user_integration_id: input.user_integration_id,
      user_tracked_agency_id: input.user_tracked_agency_id,
      source_agency_id: input.source_agency_id,
      concurrent_insertions: input.concurrent_insertions,
      insertion_interval_minutes: input.insertion_interval_minutes,
      operations: cappedOperations,
      user_property_ids: input.affected.map((a) => a.user_property_id),
    };
  }

  private async applyMaxPropertiesCap(
    userId: string,
    sourceAgencyId: string,
    maxProperties: number | null,
    operations: CmsSyncBatchOperation[],
  ): Promise<CmsSyncBatchOperation[]> {
    if (maxProperties == null) {
      return operations;
    }

    const alreadySynced = await this.countSyncedProperties(
      userId,
      sourceAgencyId,
    );
    const remaining = Math.max(0, maxProperties - alreadySynced);

    let createsKept = 0;
    return operations.filter((op) => {
      if (op.operation !== 'CREATE') {
        return true;
      }
      if (createsKept >= remaining) {
        return false;
      }
      createsKept += 1;
      return true;
    });
  }

  private async countSyncedProperties(
    userId: string,
    sourceAgencyId: string,
  ): Promise<number> {
    const rows = await this.prisma.userProperty.findMany({
      where: {
        user_id: userId,
        integration_property_id: { not: null },
        status: { not: PropertyStatus.REMOVED },
        canonical_property: {
          source_links: {
            some: {
              source_property: { source_agency_id: sourceAgencyId },
            },
          },
        },
      },
      select: { integration_property_id: true },
      distinct: ['integration_property_id'],
    });
    return rows.length;
  }

  private groupByDuplicateGroup(
    userProperties: UserProperty[],
    affectedMap: Map<string, CmsSyncOperationType>,
  ): Array<{
    duplicate_group_id: string | null;
    items: AffectedUserProperty[];
  }> {
    const byGroup = new Map<string | null, AffectedUserProperty[]>();

    for (const userProperty of userProperties) {
      const changeType = affectedMap.get(userProperty.id);
      if (!changeType) continue;
      const groupId = userProperty.duplicate_group_id ?? null;
      const items = byGroup.get(groupId) ?? [];
      items.push({
        user_property_id: userProperty.id,
        change_type: changeType,
        user_property: userProperty,
      });
      byGroup.set(groupId, items);
    }

    return [...byGroup.entries()].map(([duplicate_group_id, items]) => ({
      duplicate_group_id,
      items,
    }));
  }

  private async resolveGroupContext(
    userId: string,
    duplicateGroupId: string | null,
    affectedItems: AffectedUserProperty[],
  ): Promise<GroupContext> {
    if (!duplicateGroupId) {
      const representative = affectedItems[0].user_property!;
      return {
        duplicate_group_id: null,
        affected: affectedItems,
        allMembers: [representative],
        representative,
        hasActiveMember: representative.status !== PropertyStatus.REMOVED,
        sharedIntegrationPropertyId:
          representative.integration_property_id ?? null,
      };
    }

    const allMembers = await this.loadGroupMembers(userId, duplicateGroupId);
    const representative = this.selectRepresentative(allMembers);
    const hasActiveMember = allMembers.some(
      (m) => m.status !== PropertyStatus.REMOVED,
    );
    const sharedIntegrationPropertyId =
      representative.integration_property_id ??
      allMembers.find((m) => m.integration_property_id)
        ?.integration_property_id ??
      null;

    return {
      duplicate_group_id: duplicateGroupId,
      affected: affectedItems,
      allMembers,
      representative,
      hasActiveMember,
      sharedIntegrationPropertyId,
    };
  }

  private async loadGroupMembers(
    userId: string,
    duplicateGroupId: string,
  ): Promise<UserProperty[]> {
    return this.prisma.userProperty.findMany({
      where: {
        user_id: userId,
        OR: [
          { duplicate_group_id: duplicateGroupId },
          {
            canonical_property: {
              duplicate_group_id: duplicateGroupId,
            },
          },
        ],
      },
      orderBy: { created_at: 'asc' },
    });
  }

  private selectRepresentative(allMembers: UserProperty[]): UserProperty {
    const withIntegrationId = allMembers.filter(
      (m) => m.integration_property_id,
    );
    if (withIntegrationId.length > 0) {
      return withIntegrationId[0];
    }
    return allMembers[0];
  }

  private resolveGroupOperation(
    context: GroupContext,
  ): CmsSyncBatchOperation | null {
    const changeTypes = new Set(context.affected.map((a) => a.change_type));
    const hasCreate = changeTypes.has('CREATE');
    const hasUpdate = changeTypes.has('UPDATE');
    const allRemove = !hasCreate && !hasUpdate && changeTypes.has('REMOVE');

    const skippedIds = context.affected
      .filter((a) => a.user_property_id !== context.representative.id)
      .map((a) => a.user_property_id);

    if (allRemove) {
      if (!context.hasActiveMember) {
        return {
          user_property_id: context.representative.id,
          operation: 'REMOVE',
          duplicate_group_id: context.duplicate_group_id,
          is_representative: true,
          skipped_sibling_ids: skippedIds,
        };
      }
      if (context.sharedIntegrationPropertyId) {
        return {
          user_property_id: context.representative.id,
          operation: 'UPDATE',
          duplicate_group_id: context.duplicate_group_id,
          is_representative: true,
          skipped_sibling_ids: skippedIds,
        };
      }
      return null;
    }

    if (hasCreate && !context.sharedIntegrationPropertyId) {
      return {
        user_property_id: context.representative.id,
        operation: 'CREATE',
        duplicate_group_id: context.duplicate_group_id,
        is_representative: true,
        skipped_sibling_ids: skippedIds,
      };
    }

    return {
      user_property_id: context.representative.id,
      operation: 'UPDATE',
      duplicate_group_id: context.duplicate_group_id,
      is_representative: true,
      skipped_sibling_ids: skippedIds,
    };
  }

  private async resolveUserId(userTrackedAgencyId: string): Promise<string> {
    const tracker = await this.prisma.userTrackedAgency.findUnique({
      where: { id: userTrackedAgencyId },
      select: { user_id: true },
    });
    if (!tracker) {
      throw new Error(
        `UserTrackedAgency ${userTrackedAgencyId} not found during batch build`,
      );
    }
    return tracker.user_id;
  }

  private async loadAffectedUserProperties(
    ids: string[],
  ): Promise<UserProperty[]> {
    return this.prisma.userProperty.findMany({
      where: { id: { in: ids } },
    });
  }
}
