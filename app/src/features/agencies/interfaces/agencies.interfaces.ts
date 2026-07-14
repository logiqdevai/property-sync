export const AgencyStatuses = {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
  ARCHIVED: "ARCHIVED",
} as const;

export type AgencyStatus = (typeof AgencyStatuses)[keyof typeof AgencyStatuses];

export interface SourceAgency {
  id: string;
  name: string;
  base_url: string;
  country: string | null;
  city: string | null;
  status: AgencyStatus;
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

export interface UpdateAgencyPayload extends Partial<CreateAgencyPayload> {
  status?: AgencyStatus;
}

export interface UpdateAgencyVisibilityPayload {
  is_visible: boolean;
  is_enabled?: boolean;
}

export interface UpdateTrackerAdminSettingsPayload {
  crawl_interval?: string;
  concurrent_insertions?: number;
  insertion_interval_minutes?: number;
}

export interface AgencyListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: AgencyStatus;
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
