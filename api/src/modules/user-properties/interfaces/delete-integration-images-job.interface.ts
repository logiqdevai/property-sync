export interface DeleteIntegrationImagesJobData {
  job_log_id: string;
  user_id: string;
  user_property_id: string;
  total: number;
}

export type DeleteIntegrationImagesItemStatus = 'deleted' | 'skipped' | 'failed';

export interface DeleteIntegrationImagesItemResult {
  user_property_id: string;
  status: DeleteIntegrationImagesItemStatus;
  deleted_count?: number;
  error?: string;
}

export interface DeleteIntegrationImagesJobResult {
  total: number;
  processed: number;
  deleted: number;
  skipped: number;
  failed: number;
  items: DeleteIntegrationImagesItemResult[];
  logs?: string[];
}
