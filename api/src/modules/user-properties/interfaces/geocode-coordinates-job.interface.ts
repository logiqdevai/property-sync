export type GeocodeCoordinatesEntityType = 'property' | 'user_property';

export interface GeocodeCoordinatesJobData {
  job_log_id: string;
  entity_type: GeocodeCoordinatesEntityType;
  entity_id: string;
  user_id?: string;
  total: number;
}

export type GeocodeCoordinatesItemStatus = 'geocoded' | 'skipped' | 'failed';

export interface GeocodeCoordinatesItemResult {
  entity_id: string;
  status: GeocodeCoordinatesItemStatus;
  error?: string;
}

// Per-entity results live in JobLogItem (one row per entity, upserted independently so
// concurrent workers never contend on the same job_logs row). job_logs.result only holds
// this rolled-up summary, refreshed atomically from JobLogItem after each item completes.
export interface GeocodeCoordinatesJobResult {
  total: number;
  processed: number;
  geocoded: number;
  failed: number;
}
