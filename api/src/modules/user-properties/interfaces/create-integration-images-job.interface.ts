export interface CreateIntegrationImagesJobData {
  job_log_id: string;
  user_id: string;
  user_property_id: string;
  total: number;
}

export type CreateIntegrationImagesItemStatus =
  | 'created'
  | 'skipped'
  | 'failed';

export interface CreateIntegrationImagesItemResult {
  user_property_id: string;
  status: CreateIntegrationImagesItemStatus;
  error?: string;
}

export interface CreateIntegrationImagesJobResult {
  total: number;
  processed: number;
  created: number;
  skipped: number;
  failed: number;
  items: CreateIntegrationImagesItemResult[];
  logs?: string[];
}
