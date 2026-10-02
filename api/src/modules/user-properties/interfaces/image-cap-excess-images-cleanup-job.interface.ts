export interface ImageCapExcessImagesCleanupJobData {
  job_log_id: string;
  user_property_id: string;
  user_integration_id: string;
  crm_property_id: string;
  crm_image_id: number;
  total: number;
}

export interface ImageCapExcessImagesCleanupItemResult {
  user_property_id: string;
  crm_image_id: number;
  status: 'deleted' | 'failed';
  error?: string;
}

export interface ImageCapExcessImagesCleanupJobResult {
  total: number;
  processed: number;
  deleted: number;
  failed: number;
  items: ImageCapExcessImagesCleanupItemResult[];
  logs?: string[];
}
