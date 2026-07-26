import { UserProperty } from 'generated/prisma';

export type CmsSyncOperationType = 'CREATE' | 'UPDATE' | 'REMOVE';

export type PropertySyncChangeType = 'created' | 'updated' | 'removed';

const PROPERTY_SYNC_TO_CMS_OPERATION: Record<
  PropertySyncChangeType,
  CmsSyncOperationType
> = {
  created: 'CREATE',
  updated: 'UPDATE',
  removed: 'REMOVE',
};

export function toCmsSyncOperationType(
  changeType: PropertySyncChangeType,
): CmsSyncOperationType {
  return PROPERTY_SYNC_TO_CMS_OPERATION[changeType];
}

export interface AffectedUserProperty {
  user_property_id: string;
  change_type: CmsSyncOperationType;
  user_property?: UserProperty;
}

export interface CmsSyncBatchOperation {
  user_property_id: string;
  operation: CmsSyncOperationType;
  duplicate_group_id: string | null;
  is_representative: boolean;
  skipped_sibling_ids?: string[];
  payload?: Record<string, unknown>;
}

export interface CmsSyncBatch {
  crawl_run_id: string | null;
  user_integration_id: string;
  user_tracked_agency_id: string;
  source_agency_id: string;
  concurrent_insertions: number;
  insertion_interval_seconds: number;
  operations: CmsSyncBatchOperation[];
  user_property_ids: string[];
}

export interface CmsSyncBatchResult {
  created: number;
  updated: number;
  removed: number;
  linked: number;
  failed: number;
  failed_property_ids: string[];
  skipped_duplicate_property_ids: string[];
  responses: CmsSyncOperationResult[];
}

export interface CmsSyncOperationResult {
  user_property_id: string;
  operation: CmsSyncOperationType;
  success: boolean;
  property_title?: string | null;
  integration_property_id?: string | null;
  error?: string;
  reconciled?: boolean;
  skipped_push?: boolean;
}
