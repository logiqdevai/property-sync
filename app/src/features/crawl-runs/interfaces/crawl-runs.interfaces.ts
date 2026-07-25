import type { PropertyHistoryEntry } from "@/features/properties/interfaces/properties.interfaces";

export const CrawlRunStatuses = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  SUCCESS: "SUCCESS",
  PARTIAL_SUCCESS: "PARTIAL_SUCCESS",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type CrawlRunStatus = (typeof CrawlRunStatuses)[keyof typeof CrawlRunStatuses];

export interface ScraperExecutionTrace {
  id: string;
  scraper_id: string;
  crawl_run_id: string | null;
  steps: unknown;
  success: boolean;
  error_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrawlRunJobLogSummary {
  id: string;
  queue_name: string;
  job_name: string | null;
  status: string;
  attempt: number;
  max_attempts: number | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface CrawlRun {
  id: string;
  source_agency_id: string;
  scraper_id: string | null;
  user_tracked_agency_id: string | null;
  status: CrawlRunStatus;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  total_found: number;
  total_new_listings: number;
  total_refreshed_listings: number;
  total_created: number;
  total_updated: number;
  total_removed: number;
  total_linked: number;
  total_failed: number;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  ai_model: string | null;
  ai_input_tokens: number | null;
  ai_output_tokens: number | null;
  ai_input_cost: string | null;
  ai_output_cost: string | null;
  ai_total_cost: string | null;
  ai_average_cost_per_property: string | null;
  created_at: string;
  updated_at: string;
  source_agency?: { name: string };
  scraper?: { name: string } | null;
  user_tracked_agency?: {
    user: { email: string };
  } | null;
}

export interface CrawlRunDetail extends CrawlRun {
  execution_traces: ScraperExecutionTrace[];
  job_logs: CrawlRunJobLogSummary[];
  diagnostics_package?: { id: string; mode: string } | null;
  property_history?: CrawlRunPropertyHistoryEntry[];
  cms_sync_runs?: CrawlRunCmsSyncRunSummary[];
}

export interface CrawlRunPropertyHistoryEntry extends PropertyHistoryEntry {
  property?: {
    id: string;
    title: string;
    user_property_copies?: Array<{
      id: string;
      title: string;
      user?: { email: string };
    }>;
  };
}

export interface CrawlRunCmsSyncRunSummary {
  id: string;
  status: string;
  total_created: number;
  total_updated: number;
  total_removed: number;
  total_linked: number;
  total_failed: number;
  response: {
    failed_property_ids?: string[];
    skipped_duplicate_property_ids?: string[];
    operation_results?: Array<{
      user_property_id: string;
      operation: string;
      success: boolean;
      property_title?: string | null;
      error?: string;
      skipped_push?: boolean;
      history?: PropertyHistoryEntry[];
    }>;
  } | null;
  user_integration?: {
    id: string;
    email: string | null;
    username: string | null;
    user?: { id: string; email: string };
  };
}

export interface CrawlRunListQuery {
  page?: number;
  limit?: number;
  status?: CrawlRunStatus;
  agency_id?: string;
  scraper_id?: string;
  user_tracked_agency_id?: string;
  user_id?: string;
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

export interface CrawlRunListResponse extends PaginatedResponse<CrawlRun> {
  total_cost: string | null;
}

export interface DeleteCrawlRunsPayload {
  crawl_run_ids: string[];
}
