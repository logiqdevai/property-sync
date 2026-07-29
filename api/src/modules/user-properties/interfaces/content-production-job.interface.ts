export interface ContentProductionJobData {
  job_log_id: string;
  user_id: string;
  user_property_id: string;
  run_translations: boolean;
  run_ai_titles: boolean;
  use_ai_batch: boolean;
  regenerate: boolean;
  push_to_crm: boolean;
  total: number;
}

export type ContentProductionItemStatus =
  | 'ready'
  | 'pending_batch'
  | 'failed'
  | 'cms_failed';

export interface ContentProductionItemResult {
  user_property_id: string;
  status: ContentProductionItemStatus;
  translations_written?: number;
  titles_written?: number;
  cms_pushed?: boolean;
  error?: string;
}

export interface ContentProductionJobResult {
  total: number;
  processed: number;
  ready: number;
  pending_batch: number;
  failed: number;
  cms_pushed: number;
  cms_failed: number;
  translations_written: number;
  titles_written: number;
  items: ContentProductionItemResult[];
  logs?: string[];
}
