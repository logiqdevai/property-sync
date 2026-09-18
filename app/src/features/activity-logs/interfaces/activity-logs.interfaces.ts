import type { PaginatedResponse } from "@/features/crawl-runs/interfaces/crawl-runs.interfaces";

export const ActivityOutcomes = {
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
} as const;

export type ActivityOutcome = (typeof ActivityOutcomes)[keyof typeof ActivityOutcomes];

export const ActivityChangeOperations = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  ACTION: "ACTION",
} as const;

export type ActivityChangeOperation =
  (typeof ActivityChangeOperations)[keyof typeof ActivityChangeOperations];

export interface ActivityFieldChange {
  path: string;
  from?: unknown;
  to?: unknown;
  /** The value changed but is sensitive, so neither side was stored. */
  redacted?: boolean;
}

export interface ActivityLogChange {
  id: string;
  activity_log_id: string;
  entity_type: string;
  entity_id: string;
  operation: ActivityChangeOperation;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changes: ActivityFieldChange[];
  created_at: string;
}

export interface ActivityLog {
  id: string;
  request_id: string | null;
  action: string;
  category: string;
  method: string;
  route: string;
  path: string;
  status_code: number | null;
  outcome: ActivityOutcome;
  error_message: string | null;
  duration_ms: number | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  effective_user_id: string | null;
  is_impersonated: boolean;
  ip: string | null;
  user_agent: string | null;
  client_route: string | null;
  client_session_id: string | null;
  job_log_id: string | null;
  affected_count: number;
  snapshots_truncated: boolean;
  created_at: string;
}

export interface ActivityLogListItem extends ActivityLog {
  _count: { changes: number };
}

export interface ActivityLogDetail extends ActivityLog {
  request_body: unknown;
  request_query: unknown;
  changes: ActivityLogChange[];
}

export type ActivityLogListResponse = PaginatedResponse<ActivityLogListItem>;

export interface ActivityLogListQuery {
  page?: number;
  limit?: number;
  user_id?: string;
  actor_id?: string;
  action?: string;
  category?: string;
  entity_type?: string;
  entity_id?: string;
  outcome?: ActivityOutcome;
  date_from?: string;
  date_to?: string;
}

export interface ActivityLogFacets {
  categories: string[];
  actions: string[];
  entity_types: string[];
}
