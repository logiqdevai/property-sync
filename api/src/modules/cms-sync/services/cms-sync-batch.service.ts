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
  crawl_run_id: string | null;
  user_integration_id: string;
  user_tracked_agency_id: string;
  source_agency_id: string;
  concurrent_insertions: number;
  insertion_interval_seconds: number;
  max_properties: number | null;
  affected: AffectedUserProperty[];
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

    const operations: CmsSyncBatchOperation[] = [];

    for (const userProperty of affectedUserProperties) {
      const changeType = affectedMap.get(userProperty.id);
      if (!changeType) continue;
      const op = this.resolveOperation(userProperty, changeType);
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
      insertion_interval_seconds: input.insertion_interval_seconds,
      operations: cappedOperations,
      user_property_ids: input.affected.map((a) => a.user_property_id),
    };
  }

  private resolveOperation(
    userProperty: UserProperty,
    changeType: CmsSyncOperationType,
  ): CmsSyncBatchOperation | null {
    const duplicateGroupId = userProperty.duplicate_group_id ?? null;

    if (changeType === 'REMOVE') {
      if (!userProperty.integration_property_id) {
        return null;
      }
      return {
        user_property_id: userProperty.id,
        operation: 'REMOVE',
        duplicate_group_id: duplicateGroupId,
        is_representative: true,
      };
    }

    if (changeType === 'CREATE' && !userProperty.integration_property_id) {
      return {
        user_property_id: userProperty.id,
        operation: 'CREATE',
        duplicate_group_id: duplicateGroupId,
        is_representative: true,
      };
    }

    if (!userProperty.integration_property_id && changeType === 'UPDATE') {
      return {
        user_property_id: userProperty.id,
        operation: 'CREATE',
        duplicate_group_id: duplicateGroupId,
        is_representative: true,
      };
    }

    return {
      user_property_id: userProperty.id,
      operation: 'UPDATE',
      duplicate_group_id: duplicateGroupId,
      is_representative: true,
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
