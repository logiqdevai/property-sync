import type {
  ListingType,
  PropertyHistoryEntry,
  PropertySourceLink,
  PropertyStatus,
  PropertyType,
} from "@/features/properties/interfaces/properties.interfaces";

import type { PropertyCmsFields } from "@/features/properties/interfaces/cms-property.interface";

export interface UserProperty extends PropertyCmsFields {
  id: string;
  user_id: string;
  canonical_property_id: string;
  property_id: string;
  internal_id: string | null;
  integration_property_id: string | null;
  title: string;
  description: string | null;
  listing_type: ListingType;
  property_type: PropertyType;
  status: PropertyStatus;
  price: string | null;
  currency: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
  square_meters: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  construction_year: number | null;
  renovation_year: number | null;
  features: string[] | null;
  images: string[] | null;
  duplicate_group_id: string | null;
  is_modified: boolean;
  pending_crm_update: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserPropertyDetail extends UserProperty {
  source_links: PropertySourceLink[];
  history: PropertyHistoryEntry[];
}

export interface UpdateUserPropertyPayload {
  title?: string;
  description?: string | null;
  listing_type?: ListingType;
  property_type?: PropertyType;
  status?: PropertyStatus;
  price?: number | null;
  currency?: string | null;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  postal_code?: string | null;
  country?: string | null;
  square_meters?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floor?: string | null;
  construction_year?: number | null;
  renovation_year?: number | null;
  integration_property_id?: string | null;
  estateweb_type_id?: number | null;
  estateweb_location_id?: number | null;
  video_url?: string | null;
  distance_airport?: string | null;
  distance_port?: string | null;
  distance_beach?: string | null;
  price_start?: number | null;
  price_web?: number | null;
}

export interface UserPropertyListQuery {
  page?: number;
  limit?: number;
  status?: PropertyStatus;
  city?: string;
  price_min?: number;
  price_max?: number;
  has_duplicate_group?: boolean;
  agency_id?: string;
  user_tracked_agency_id?: string;
}

export type UserPropertyCountQuery = Omit<UserPropertyListQuery, "page" | "limit">;

export interface UserPropertyCountResponse {
  total: number;
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

export interface DeleteUserPropertiesPayload {
  ids: string[];
}

export interface DedupeUserPropertiesPayload {
  ids: string[];
}

export interface DedupeUserPropertiesResult {
  deleted: number;
  kept: string[];
}

export interface TruncateUserPropertyDescriptionsPayload {
  ids: string[];
  text: string;
}

export interface TruncateUserPropertyDescriptionsResult {
  updated: number;
  total: number;
}
