export interface DuplicateWatermarkCleanupJobData {
  job_log_id: string;
  user_property_id: string;
  user_integration_id: string;
  crm_property_id: string;
  crm_image_id: number;
  total: number;
}

export interface DuplicateWatermarkCleanupItemResult {
  user_property_id: string;
  crm_image_id: number;
  status: 'deleted' | 'failed';
  error?: string;
}

export interface DuplicateWatermarkCleanupJobResult {
  total: number;
  processed: number;
  deleted: number;
  failed: number;
  items: DuplicateWatermarkCleanupItemResult[];
  logs?: string[];
}
