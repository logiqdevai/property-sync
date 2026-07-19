export const CmsSyncStatuses = {
  PENDING: "PENDING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  RETRYING: "RETRYING",
} as const;

export type CmsSyncStatus = (typeof CmsSyncStatuses)[keyof typeof CmsSyncStatuses];

export interface CmsSyncRun {
  id: string;
  crawl_run_id: string;
  user_integration_id: string;
  status: CmsSyncStatus;
  attempt: number;
  max_attempts: number | null;
  total_created: number;
  total_updated: number;
  total_removed: number;
  total_failed: number;
  payload: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  crawl_run?: {
    id: string;
    source_agency_id?: string;
    source_agency?: { id?: string; name: string };
  };
  user_integration?: {
    id: string;
    email: string | null;
    username: string | null;
    user_id?: string;
    user?: { id: string; email: string };
    integration_target: {
      id?: string;
      integration_type: string;
      base_url: string | null;
    };
  };
}

export interface CmsSyncRunListQuery {
  page?: number;
  limit?: number;
  status?: CmsSyncStatus;
  user_integration_id?: string;
  date_from?: string;
  date_to?: string;
}

export interface AdminCmsSyncRunListQuery extends CmsSyncRunListQuery {
  user_id?: string;
}

export interface EstateWebIntegrationOption {
  id: string;
  email: string | null;
  username: string | null;
  user_id: string;
  user: { email: string };
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
