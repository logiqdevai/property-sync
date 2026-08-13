export interface TrackingPrefs {
  track_new_listings: boolean;
  track_removed_listings: boolean;
  track_updated_listings: boolean;
  auto_update_to_crm: boolean;
  cms_update_on_hash_only: boolean;
  enabled: boolean;
  user_integration_id?: string | null;
  integration_client_id?: number | null;
  concurrent_insertions?: number;
  insertion_interval_seconds?: number;
  max_properties?: number | null;
  text_truncate_pieces?: string[];
  remove_watermark: boolean;
  watermark_image_count: number;
  watermark_manual_selection: boolean;
}

export interface TrackableAgency {
  id: string;
  name: string;
  base_url: string;
  country: string | null;
  city: string | null;
  content_language?: string | null;
  status: string;
  is_visible: boolean;
  is_enabled: boolean;
  use_ai_batching: boolean;
  is_tracked: boolean;
  user_tracked_agency_id: string | null;
  tracking_prefs?: TrackingPrefs;
}

export interface TrackAgencyPayload {
  track_new_listings?: boolean;
  track_removed_listings?: boolean;
  track_updated_listings?: boolean;
  auto_update_to_crm?: boolean;
  cms_update_on_hash_only?: boolean;
  enabled?: boolean;
  concurrent_insertions?: number;
  insertion_interval_seconds?: number;
  max_properties?: number | null;
  text_truncate_pieces?: string[];
  remove_watermark?: boolean;
  watermark_image_count?: number;
  watermark_manual_selection?: boolean;
}

export const BulkAgencyTrackingActions = {
  TRACK: "track",
  UNTRACK: "untrack",
  UPDATE: "update",
} as const;

export type BulkAgencyTrackingAction =
  (typeof BulkAgencyTrackingActions)[keyof typeof BulkAgencyTrackingActions];

export interface BulkAgencyTrackingPayload extends TrackAgencyPayload {
  agency_ids: string[];
  action: BulkAgencyTrackingAction;
}

export interface BulkAgencyTrackingResult {
  updated: number;
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
  insertion_interval_seconds: number;
  max_properties: number | null;
  text_truncate_pieces: string[];
  track_new_listings: boolean;
  track_removed_listings: boolean;
  track_updated_listings: boolean;
  auto_update_to_crm: boolean;
  cms_update_on_hash_only: boolean;
  remove_watermark: boolean;
  watermark_image_count: number;
  watermark_manual_selection: boolean;
}

export interface TrackedAgencyIntegrationLink {
  id: string;
  user_tracked_agency_id: string;
  user_integration_id: string;
  integration_client_id: number | null;
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
  integration_client_id?: number | null;
}
