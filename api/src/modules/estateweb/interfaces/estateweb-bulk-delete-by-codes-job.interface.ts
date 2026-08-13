export interface EstateWebBulkDeleteByCodesJobData {
  job_log_id: string;
  user_integration_id: string;
  code: string;
  property_id: number;
  total: number;
}

export interface EstateWebBulkDeleteByCodesItemResult {
  code: string;
  property_id: number | null;
  status: 'deleted' | 'failed';
  error?: string;
}

export interface EstateWebBulkDeleteByCodesJobResult {
  total: number;
  processed: number;
  deleted: number;
  failed: number;
  items: EstateWebBulkDeleteByCodesItemResult[];
  logs?: string[];
}
