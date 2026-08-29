import { UserProperty } from 'generated/prisma';

export type CmsSyncOperationType = 'CREATE' | 'UPDATE' | 'REMOVE';

export type PropertySyncChangeType = 'created' | 'updated' | 'removed' | 'sold';

const PROPERTY_SYNC_TO_CMS_OPERATION: Record<
  PropertySyncChangeType,
  CmsSyncOperationType
> = {
  created: 'CREATE',
  updated: 'UPDATE',
  removed: 'REMOVE',
  // The CMS integration only knows CREATE/UPDATE/REMOVE -- a sold listing is delisted the same
  // way a removed one is, it's just tracked as a more specific PropertyStatus internally.
  sold: 'REMOVE',
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
  content_changed?: boolean;
  // See CmsSyncBatchOperation.skip_ownership_check.
  skip_ownership_check?: boolean;
}

export interface CmsSyncBatchOperation {
  user_property_id: string;
  operation: CmsSyncOperationType;
  duplicate_group_id: string | null;
  is_representative: boolean;
  skipped_sibling_ids?: string[];
  payload?: Record<string, unknown>;
  // Trust userProperty.integration_property_id for an UPDATE instead of
  // re-verifying it against EstateWeb's stored listing code. Only set for a
  // human-initiated single/bulk "Push to CRM" click (cms-sync-orchestrator's
  // planAndEnqueueManualPropertyUpdate with skipOwnershipCheck) -- never for
  // crawl-driven sync or admin bulk edits, where a silent duplicate create
  // could go unnoticed. See listingBelongsToIntegration in
  // cms-sync.processor.ts, the execution-time counterpart of this same check.
  skip_ownership_check?: boolean;
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
