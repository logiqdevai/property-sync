export interface TrackingPrefs {
  track_new_listings: boolean;
  track_removed_listings: boolean;
  track_updated_listings: boolean;
  auto_update_to_crm: boolean;
  use_ai_batching: boolean;
  enabled: boolean;
  user_integration_id?: string | null;
  concurrent_insertions?: number;
  insertion_interval_minutes?: number;
  max_properties?: number | null;
  text_truncate_pieces?: string[];
  remove_watermark: boolean;
  watermark_image_count: number;
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
  user_tracked_agency_id: string | null;
  tracking_prefs?: TrackingPrefs;
}

export interface TrackAgencyPayload {
  track_new_listings?: boolean;
  track_removed_listings?: boolean;
  track_updated_listings?: boolean;
  auto_update_to_crm?: boolean;
  use_ai_batching?: boolean;
  enabled?: boolean;
  concurrent_insertions?: number;
  insertion_interval_minutes?: number;
  max_properties?: number | null;
  text_truncate_pieces?: string[];
  remove_watermark?: boolean;
  watermark_image_count?: number;
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
  concurrent_insertions: number;
  insertion_interval_minutes: number;
  max_properties: number | null;
  text_truncate_pieces: string[];
  track_new_listings: boolean;
  track_removed_listings: boolean;
  track_updated_listings: boolean;
  auto_update_to_crm: boolean;
  use_ai_batching: boolean;
  remove_watermark: boolean;
  watermark_image_count: number;
}

export interface TrackedAgencyIntegrationLink {
  id: string;
  user_tracked_agency_id: string;
  user_integration_id: string;
  created_at: string;
  updated_at: string;
  user_integration?: {
    id: string;
    is_active: boolean;
    email: string | null;
    username: string | null;
    created_at: string;
    integration_target: {
      integration_type: string;
      base_url: string | null;
    };
  };
}

export interface LinkIntegrationPayload {
  user_integration_id: string;
}
