export const AiProviders = {
  OPENAI: "OPENAI",
  ANTHROPIC: "ANTHROPIC",
  GEMINI: "GEMINI",
} as const;
export type AiProvider = (typeof AiProviders)[keyof typeof AiProviders];

export interface TrackingPrefs {
  track_new_listings: boolean;
  track_removed_listings: boolean;
  track_updated_listings: boolean;
  use_ai_batching: boolean;
  ai_provider: AiProvider;
  ai_model: string | null;
  crawl_interval: string;
  enabled: boolean;
}

export interface TrackableAgency {
  id: string;
  name: string;
  base_url: string;
  country: string | null;
  city: string | null;
  status: string;
  is_visible: boolean;
  is_enabled: boolean;
  is_tracked: boolean;
  tracking_prefs?: TrackingPrefs;
}

export interface TrackAgencyPayload {
  track_new_listings?: boolean;
  track_removed_listings?: boolean;
  track_updated_listings?: boolean;
  use_ai_batching?: boolean;
  ai_provider?: AiProvider;
  ai_model?: string | null;
  enabled?: boolean;
}

export interface AgencyListQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export interface UserTrackedAgency {
  id: string;
  user_id: string;
  source_agency_id: string;
  enabled: boolean;
  crawl_interval: string;
  track_new_listings: boolean;
  track_removed_listings: boolean;
  track_updated_listings: boolean;
  use_ai_batching: boolean;
  ai_provider: AiProvider;
  ai_model: string | null;
}
