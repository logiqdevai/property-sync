export const JobStatuses = {
  WAITING: "WAITING",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  DELAYED: "DELAYED",
  PAUSED: "PAUSED",
  STALLED: "STALLED",
} as const;

export type JobStatus = (typeof JobStatuses)[keyof typeof JobStatuses];

export interface JobLog {
  id: string;
  queue_name: string;
  job_id: string | null;
  job_name: string | null;
  status: JobStatus;
  attempt: number;
  max_attempts: number | null;
  crawl_run_id: string | null;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  stack_trace: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface JobLogListQuery {
  page?: number;
  limit?: number;
  status?: JobStatus;
  queue_name?: string;
  date_from?: string;
  date_to?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface DeleteJobsPayload {
  job_ids: string[];
}
