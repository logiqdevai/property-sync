import type { PropertyHistoryEventType } from "@/features/properties/interfaces/properties.interfaces";

export interface UserDashboardStats {
  total_properties: number;
  active_properties: number;
  properties_added_this_week: number;
  properties_updated_this_week: number;
  properties_removed_this_week: number;
  tracked_agencies: number;
}

export interface UserDashboardActivityItem {
  id: string;
  property_id: string;
  user_property_id: string | null;
  property_title: string;
  event_type: PropertyHistoryEventType;
  field: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

export interface UserDashboardListings {
  added: UserDashboardActivityItem[];
  updated: UserDashboardActivityItem[];
  removed: UserDashboardActivityItem[];
}

export interface UserDashboardResponse {
  stats: UserDashboardStats;
  listings: UserDashboardListings;
}
