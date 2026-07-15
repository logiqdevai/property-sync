import type {
  ListingType,
  PropertyHistoryEntry,
  PropertyStatus,
  PropertyType,
} from "@/features/properties/interfaces/properties.interfaces";

export interface UserProperty {
  id: string;
  user_id: string;
  property_id: string;
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
  square_meters: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  construction_year: number | null;
  features: string[] | null;
  images: string[] | null;
  is_modified: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserPropertyDetail extends UserProperty {
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
  square_meters?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floor?: string | null;
  construction_year?: number | null;
}

export interface UserPropertyListQuery {
  page?: number;
  limit?: number;
  status?: PropertyStatus;
  city?: string;
  price_min?: number;
  price_max?: number;
  agency_id?: string;
  user_tracked_agency_id?: string;
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
