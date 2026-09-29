export interface CheckEstateWebRemovalJobData {
  job_log_id: string;
  user_id: string;
  user_property_id: string;
  total: number;
}

export type CheckEstateWebRemovalItemStatus =
  | 'still_live'
  | 'unpublished'
  | 'skipped'
  | 'failed';

export interface CheckEstateWebRemovalItemResult {
  user_property_id: string;
  status: CheckEstateWebRemovalItemStatus;
  error?: string;
}

// Per-property results live in JobLogItem (one row per property, upserted independently
// so concurrent workers never contend on the same job_logs row) -- see
// ResolveEstateWebLocationJobResult for the pattern this mirrors. job_logs.result only
// holds this rolled-up summary, refreshed atomically from JobLogItem after each item
// completes, plus the full still-live id list appended once the job finishes (that list
// is what the "Check EstateWeb removal sync" modal shows/copies).
export interface CheckEstateWebRemovalJobResult {
  total: number;
  processed: number;
  still_live: number;
  unpublished: number;
  skipped: number;
  failed: number;
  still_live_ids?: string[];
}
