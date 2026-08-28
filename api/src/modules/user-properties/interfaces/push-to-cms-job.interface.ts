export interface PushToCmsJobData {
  job_log_id: string;
  user_id: string;
  user_property_id: string;
  total: number;
}

export type PushToCmsItemStatus = 'queued' | 'failed';

export interface PushToCmsItemResult {
  user_property_id: string;
  status: PushToCmsItemStatus;
  error?: string;
}

export interface PushToCmsJobResult {
  total: number;
  processed: number;
  queued: number;
  failed: number;
  items: PushToCmsItemResult[];
  logs?: string[];
}
