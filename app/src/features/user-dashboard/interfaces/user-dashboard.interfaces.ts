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
  user_property_id: string;
  property_title: string;
  agency_name: string | null;
  event_type: PropertyHistoryEventType;
  field: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

export interface UserDashboardResponse {
  stats: UserDashboardStats;
  activity: UserDashboardActivityItem[];
  /** Distinct properties with changes in the period (list may show fewer). */
  activity_total: number;
  /** Server time the activity windows are measured from. */
  as_of: string;
}

export type ActivityPeriod = "day" | "week" | "month";
