import type { PropertyStatus } from "@/features/properties/interfaces/properties.interfaces";
import type { PaginatedResponse } from "@/features/properties/interfaces/properties.interfaces";

export interface SourceAgencySummary {
  id: string;
  name: string;
  base_url: string;
}

export interface SourcePropertyLinkedProperty {
  id: string;
  property_id: string;
  is_primary_source: boolean;
  confidence_score: string | null;
  property: {
    id: string;
    title: string;
    status: PropertyStatus;
  };
}

export interface SourceProperty {
  id: string;
  source_agency_id: string;
  property_id: string;
  internal_id: string | null;
  source_url: string;
  canonical_url: string | null;
  raw_title: string | null;
  raw_price: string | null;
  raw_location: string | null;
  raw_property_type: string | null;
  raw_listing_type: string | null;
  first_seen_at: string;
  last_seen_at: string | null;
  status: PropertyStatus;
  created_at: string;
  updated_at: string;
  source_agency: SourceAgencySummary;
  linked_property_count: number;
}

export interface SourcePropertyDetail extends SourceProperty {
  raw_description: string | null;
  raw_sqm: string | null;
  raw_bedrooms: string | null;
  raw_bathrooms: string | null;
  raw_data: unknown;
  raw_html_path: string | null;
  raw_html_url: string | null;
  content_hash: string | null;
  property_links: SourcePropertyLinkedProperty[];
}

export interface SourcePropertyListQuery {
  page?: number;
  limit?: number;
  status?: PropertyStatus;
  search?: string;
  agency_id?: string;
  date_from?: string;
  date_to?: string;
  order_by?: "created_at" | "updated_at" | "price";
  order_direction?: "asc" | "desc";
}

export type SourcePropertyCountQuery = Omit<
  SourcePropertyListQuery,
  "page" | "limit"
>;

export interface SourcePropertyCountResponse {
  total: number;
}

export type SourcePropertyPaginatedResponse = PaginatedResponse<SourceProperty>;

export interface DeleteSourcePropertiesPayload {
  source_property_ids: string[];
}

export interface DeleteSourcePropertiesResult {
  deleted: number;
}
