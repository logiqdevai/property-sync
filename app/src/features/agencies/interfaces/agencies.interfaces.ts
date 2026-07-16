export interface AgencyTrackedUser {
  id: string;
  user_id: string;
  source_agency_id: string;
  enabled: boolean;
  crawl_interval: string;
  concurrent_insertions: number;
  insertion_interval_minutes: number;
  track_new_listings: boolean;
  track_removed_listings: boolean;
  track_updated_listings: boolean;
  use_ai_batching: boolean;
  ai_provider: string;
  ai_model: string | null;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

export interface SourceAgency {
  id: string;
  name: string;
  base_url: string;
  country: string | null;
  city: string | null;
  is_visible: boolean;
  is_enabled: boolean;
  notes: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error_message: string | null;
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
  is_visible?: boolean;
  is_enabled?: boolean;
}

export interface UpdateAgencyPayload extends Partial<CreateAgencyPayload> {}

export interface UpdateAgencyVisibilityPayload {
  is_visible: boolean;
  is_enabled?: boolean;
}

export interface UpdateTrackerAdminSettingsPayload {
  crawl_interval?: string;
  concurrent_insertions?: number;
  insertion_interval_minutes?: number;
  use_ai_batching?: boolean;
  ai_provider?: string;
  ai_model?: string | null;
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
