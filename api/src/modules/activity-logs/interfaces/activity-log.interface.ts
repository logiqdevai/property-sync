import { ActivityChangeOperation, ActivityOutcome } from 'generated/prisma';

export interface FieldChange {
  path: string;
  from?: unknown;
  to?: unknown;
  /** Value differs but is sensitive: neither side is stored. */
  redacted?: true;
}

/** One entity's before/after as collected during a request (raw, not yet redacted). */
export interface ChangeInput {
  entity_type: string;
  entity_id: string;
  before: unknown;
  after: unknown;
}

export interface ChangeRow {
  entity_type: string;
  entity_id: string;
  operation: ActivityChangeOperation;
  before: unknown;
  after: unknown;
  changes: FieldChange[];
}

export interface ActivityLogEntry {
  request_id: string | null;
  action: string;
  category: string;
  method: string;
  route: string;
  path: string;
  status_code: number | null;
  outcome: ActivityOutcome;
  error_message: string | null;
  duration_ms: number;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  effective_user_id: string | null;
  is_impersonated: boolean;
  ip: string | null;
  user_agent: string | null;
  client_route: string | null;
  client_session_id: string | null;
  request_body: unknown;
  request_query: unknown;
  job_log_id: string | null;
  affected_count: number;
  snapshots_truncated: boolean;
  changes: ChangeRow[];
}
