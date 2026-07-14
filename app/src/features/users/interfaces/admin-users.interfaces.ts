import type { RoleType } from "@/features/user/interfaces/user.interface";
import type { MaskedUserIntegration } from "@/features/integration-targets/interfaces/integration-targets.interfaces";

export interface AdminUser {
  id: string;
  email: string;
  phone: string | null;
  role: RoleType;
  created_at: string;
  updated_at: string;
}

export interface AdminUserListQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: RoleType;
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

export interface AdminUserTrackedAgency {
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
  source_agency: {
    id: string;
    name: string;
    base_url: string;
    status: string;
  };
}

export interface AdminUserSavedProperty {
  id: string;
  property_id: string;
  title: string;
  city: string | null;
  price: string | null;
  currency: string | null;
  status: string;
  is_modified: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUserIntegration extends MaskedUserIntegration {
  integration_target: {
    id: string;
    integration_type: string;
    auth_type: string;
    base_url: string | null;
  };
}

export interface AdminUserDetail extends AdminUser {
  tracked_agencies: AdminUserTrackedAgency[];
  saved_properties: AdminUserSavedProperty[];
  user_integrations: AdminUserIntegration[];
}
