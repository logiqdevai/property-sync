export interface AgencyTrackedUser {
  id: string;
  user_id: string;
  source_agency_id: string;
  enabled: boolean;
  concurrent_insertions: number;
  insertion_interval_seconds: number;
  max_properties: number | null;
  text_truncate_pieces: string[];
  track_new_listings: boolean;
  track_removed_listings: boolean;
  track_updated_listings: boolean;
  auto_update_to_crm: boolean;
  cms_update_on_hash_only: boolean;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

export type BlockSignal = "BLOCKED" | "CHALLENGE";

export type BlockRuleSource =
  | "TITLE"
  | "TEXT"
  | "HTML"
  | "PATH"
  | "SCRIPT_CONTENT"
  | "SELECTOR";

export interface BlockRule {
  id?: string;
  label?: string | null;
  signal: BlockSignal;
  source: BlockRuleSource;
  pattern: string;
  is_regex?: boolean;
  regex_flags?: string | null;
  position?: number;
}

export interface SourceAgency {
  id: string;
  name: string;
  base_url: string;
  country: string | null;
  city: string | null;
  content_language?: string | null;
  is_visible: boolean;
  is_enabled: boolean;
  use_ai_batching: boolean;
  crawl_interval: string;
  notes: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error_message: string | null;
  block_handling_wait_timeout_ms?: number | null;
  block_handling_min_ready_body_length?: number | null;
  block_rules?: BlockRule[];
  created_at: string;
  updated_at: string;
  _count?: {
    scrapers: number;
    crawl_runs: number;
    notifications: number;
  };
  user_tracked_agencies?: AgencyTrackedUser[];
}

export interface CreateAgencyPayload {
  name: string;
  base_url: string;
  country?: string;
  city?: string;
  notes?: string;
  crawl_interval?: string;
  is_visible?: boolean;
  is_enabled?: boolean;
  use_ai_batching?: boolean;
  content_language?: string;
  block_handling_wait_timeout_ms?: number | null;
  block_handling_min_ready_body_length?: number | null;
  block_rules?: BlockRule[];
}

export interface UpdateAgencyPayload extends Partial<CreateAgencyPayload> {}

export interface UpdateAgencyVisibilityPayload {
  is_visible: boolean;
  is_enabled?: boolean;
}

export interface UpdateTrackerAdminSettingsPayload {
  concurrent_insertions?: number;
  insertion_interval_seconds?: number;
  max_properties?: number | null;
  text_truncate_pieces?: string[];
}

export interface AgencyListQuery {
  page?: number;
  limit?: number;
  search?: string;
  country?: string;
  city?: string;
  is_visible?: boolean;
  is_enabled?: boolean;
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
