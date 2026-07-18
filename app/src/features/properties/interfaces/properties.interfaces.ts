import type { PropertyCmsFields } from "./cms-property.interface";

export const PropertyStatuses = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  REMOVED: "REMOVED",
  SOLD: "SOLD",
  RENTED: "RENTED",
  UNKNOWN: "UNKNOWN",
} as const;
export type PropertyStatus = (typeof PropertyStatuses)[keyof typeof PropertyStatuses];

export const ListingTypes = {
  SALE: "SALE",
  RENT: "RENT",
  SHORT_TERM_RENT: "SHORT_TERM_RENT",
  UNKNOWN: "UNKNOWN",
} as const;
export type ListingType = (typeof ListingTypes)[keyof typeof ListingTypes];

export const PropertyTypes = {
  APARTMENT: "APARTMENT",
  HOUSE: "HOUSE",
  VILLA: "VILLA",
  MAISONETTE: "MAISONETTE",
  STUDIO: "STUDIO",
  LAND: "LAND",
  COMMERCIAL: "COMMERCIAL",
  OFFICE: "OFFICE",
  WAREHOUSE: "WAREHOUSE",
  PARKING: "PARKING",
  OTHER: "OTHER",
  UNKNOWN: "UNKNOWN",
} as const;
export type PropertyType = (typeof PropertyTypes)[keyof typeof PropertyTypes];

export const PropertyHistoryEventTypes = {
  CREATED: "CREATED",
  UPDATED: "UPDATED",
  PRICE_CHANGED: "PRICE_CHANGED",
  IMAGE_ADDED: "IMAGE_ADDED",
  IMAGE_REMOVED: "IMAGE_REMOVED",
  STATUS_CHANGED: "STATUS_CHANGED",
  REMOVED: "REMOVED",
  REAPPEARED: "REAPPEARED",
} as const;
export type PropertyHistoryEventType =
  (typeof PropertyHistoryEventTypes)[keyof typeof PropertyHistoryEventTypes];

export interface Property extends PropertyCmsFields {
  id: string;
  title: string;
  property_id: string;
  internal_id: string | null;
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
  duplicate_group_id: string | null;
  features: string[] | null;
  images: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface SourcePropertySummary {
  id: string;
  source_url: string;
  property_id: string;
  internal_id: string | null;
  raw_title: string | null;
  raw_description: string | null;
  raw_price: string | null;
  raw_location: string | null;
  raw_property_type: string | null;
  raw_listing_type: string | null;
  raw_sqm: string | null;
  raw_bedrooms: string | null;
  raw_bathrooms: string | null;
  last_seen_at: string | null;
  status: PropertyStatus;
}

export interface PropertySourceLink {
  id: string;
  property_id: string;
  source_property_id: string;
  is_primary_source: boolean;
  confidence_score: string | null;
  source_property: SourcePropertySummary;
}

export interface PropertyHistoryEntry {
  id: string;
  property_id: string;
  event_type: PropertyHistoryEventType;
  field: string | null;
  old_value: unknown;
  new_value: unknown;
  crawl_run_id: string | null;
  created_at: string;
}

export interface PropertyDetail extends Property {
  source_links: PropertySourceLink[];
  history: PropertyHistoryEntry[];
}

export interface PropertyListQuery {
  page?: number;
  limit?: number;
  status?: PropertyStatus;
  listing_type?: ListingType;
  property_type?: PropertyType;
  city?: string;
  price_min?: number;
  price_max?: number;
  duplicate_group_id?: string;
  search?: string;
  agency_id?: string;
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

export interface MergePropertiesPayload {
  property_ids: string[];
}

export interface DeletePropertiesPayload {
  property_ids: string[];
}
