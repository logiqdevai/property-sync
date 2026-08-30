export interface ContentProductionJobData {
  job_log_id: string;
  user_id: string;
  user_property_ids: string[];
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
  cms_pushed?: boolean;
  error?: string;
}

// One BullMQ job now produces content for a whole agency-group of properties
// in a single produceForUserProperties() call, so translations/titles written
// are only known in aggregate for the group, not attributable to one property.
export interface ContentProductionGroupResult {
  items: ContentProductionItemResult[];
  translations_written: number;
  titles_written: number;
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
  // Per-BullMQ-job-id contribution to translations_written/titles_written,
  // so re-recording the same (retried) job stays idempotent instead of
  // double-counting -- the totals above are always recomputed as the sum of
  // this map's values, mirroring how `items` is recomputed from scratch.
  group_totals?: Record<
    string,
    { translations_written: number; titles_written: number }
  >;
  logs?: string[];
}
