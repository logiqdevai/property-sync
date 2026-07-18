import type { PropertyHistoryEventType } from "@/features/properties/interfaces/properties.interfaces";

export interface UserDashboardStats {
  total_properties: number;
  active_properties: number;
  properties_added_this_week: number;
  tracked_agencies: number;
}

export interface UserDashboardActivityItem {
  id: string;
  property_id: string;
  property_title: string;
  event_type: PropertyHistoryEventType;
  field: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

export interface UserDashboardResponse {
  stats: UserDashboardStats;
  activity: UserDashboardActivityItem[];
}
