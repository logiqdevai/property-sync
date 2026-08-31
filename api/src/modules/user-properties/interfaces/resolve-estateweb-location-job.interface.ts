export type ResolveEstateWebLocationEntityType = 'property' | 'user_property';

export interface ResolveEstateWebLocationJobData {
  job_log_id: string;
  entity_type: ResolveEstateWebLocationEntityType;
  entity_id: string;
  user_id?: string;
  total: number;
}

export type ResolveEstateWebLocationItemStatus =
  | 'resolved'
  | 'unchanged'
  | 'skipped'
  | 'failed';

export interface ResolveEstateWebLocationItemResult {
  entity_id: string;
  status: ResolveEstateWebLocationItemStatus;
  title?: string | null;
  error?: string;
}

export interface ResolveEstateWebLocationFailure {
  entity_id: string;
  title: string | null;
  error: string;
}

// Per-entity results live in JobLogItem (one row per entity, upserted independently so
// concurrent workers never contend on the same job_logs row). job_logs.result only holds
// this rolled-up summary, refreshed atomically from JobLogItem after each item completes.
export interface ResolveEstateWebLocationJobResult {
  total: number;
  processed: number;
  resolved: number;
  unchanged: number;
  skipped: number;
  failed: number;
  // Capped (see RESOLVE_ESTATEWEB_LOCATION_MAX_TRACKED_FAILURES) -- failures beyond the
  // cap still count toward `failed` above, they just stop being individually listed.
  failures?: ResolveEstateWebLocationFailure[];
}
