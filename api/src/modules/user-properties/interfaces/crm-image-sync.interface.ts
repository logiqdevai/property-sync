export interface CrmImageSyncJobData {
  job_log_id: string;
  user_property_id: string;
  total: number;
}

export interface CrmImageSyncItemResult {
  user_property_id: string;
  status: 'in_sync' | 'reconciled' | 'skipped' | 'failed';
  skip_reason?: string;
  local_changed: boolean;
  crm_before: number;
  crm_after: number;
  desired: number;
  deleted: number;
  uploaded: number;
  upload_failed: number;
  error?: string;
}

export interface CrmImageSyncJobResult {
  total: number;
  processed: number;
  reconciled: number;
  in_sync: number;
  skipped: number;
  failed: number;
  deleted: number;
  uploaded: number;
  items: CrmImageSyncItemResult[];
  logs: string[];
}

export interface CrmImageSyncPreviewProperty {
  user_property_id: string;
  title: string;
  property_id: string;
  crm_now: number;
  target: number;
  to_delete: number;
  to_upload: number;
  local_now: number;
  local_changes: boolean;
}

export interface CrmImageSyncPreviewAgency {
  agency_id: string;
  agency_name: string;
  max_image_count: number | null;
  properties: number;
  needs_sync: number;
  skipped_not_ours: number;
  crm_now: number;
  crm_target: number;
  to_delete: number;
  to_upload: number;
  samples: CrmImageSyncPreviewProperty[];
  skipped_source_shrank: CrmImageSyncShrunkProperty[];
}

export interface CrmImageSyncShrunkProperty {
  user_property_id: string;
  title: string;
  property_id: string;
  source_now: number;
  source_peak: number;
  crm_now: number;
}
