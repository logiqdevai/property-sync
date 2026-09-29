export interface FixEstateWebRemovalJobData {
  job_log_id: string;
  user_id: string;
  user_property_id: string;
  total: number;
}

export type FixEstateWebRemovalItemStatus = 'fixed' | 'skipped' | 'failed';

export interface FixEstateWebRemovalItemResult {
  user_property_id: string;
  status: FixEstateWebRemovalItemStatus;
  error?: string;
}

// Per-property results live in JobLogItem, same pattern as
// CheckEstateWebRemovalJobResult / ResolveEstateWebLocationJobResult.
export interface FixEstateWebRemovalJobResult {
  total: number;
  processed: number;
  fixed: number;
  skipped: number;
  failed: number;
}
