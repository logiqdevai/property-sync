export const ScraperStatuses = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  DEPRECATED: "DEPRECATED",
  TESTING: "TESTING",
  BROKEN: "BROKEN",
} as const;

export type ScraperStatus = (typeof ScraperStatuses)[keyof typeof ScraperStatuses];

export const ScraperHealths = {
  EXCELLENT: "EXCELLENT",
  GOOD: "GOOD",
  WARNING: "WARNING",
  CRITICAL: "CRITICAL",
  BROKEN: "BROKEN",
} as const;

export type ScraperHealth = (typeof ScraperHealths)[keyof typeof ScraperHealths];

export const ScraperVersionCreatedBys = {
  AI: "AI",
  USER: "USER",
} as const;

export type ScraperVersionCreatedBy =
  (typeof ScraperVersionCreatedBys)[keyof typeof ScraperVersionCreatedBys];

export interface ScraperVersion {
  id: string;
  scraper_id: string;
  version: number;
  config: Record<string, unknown>;
  created_by: ScraperVersionCreatedBy;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Scraper {
  id: string;
  source_agency_id: string;
  name: string;
  active_version_id: string | null;
  version_count: number;
  status: ScraperStatus;
  self_healing_enabled: boolean;
  health: ScraperHealth;
  success_rate: number | null;
  avg_runtime_ms: number | null;
  consecutive_failures: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  created_at: string;
  updated_at: string;
  active_version?: ScraperVersion | null;
  source_agency?: { id?: string; name: string };
}

export interface CreateScraperPayload {
  source_agency_id: string;
  name: string;
  config: Record<string, unknown>;
}

export interface CreateScraperVersionPayload {
  config: Record<string, unknown>;
  notes?: string;
}

export interface UpdateScraperPayload {
  self_healing_enabled?: boolean;
  validation_rules?: Record<string, unknown>;
}

export interface ScraperListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: ScraperStatus;
  health?: ScraperHealth;
  source_agency_id?: string;
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
