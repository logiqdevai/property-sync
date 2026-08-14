import type {
  ListingType,
  PropertyChangeFilter,
  PropertyHistoryEntry,
  PropertySourceLink,
  PropertyStatus,
  PropertyType,
} from "@/features/properties/interfaces/properties.interfaces";
import type { IntegrationProperty } from "@/features/integration-property/interfaces/integration-property.interfaces";
import type { ContentLanguage } from "@/features/content-publishing/interfaces/content-publishing.interfaces";

import type { PropertyCmsFields } from "@/features/properties/interfaces/cms-property.interface";

export interface PropertyLocalizedContent {
  id: string;
  user_property_id: string;
  content_type: "TITLE" | "DESCRIPTION";
  language: ContentLanguage;
  production: string;
  text: string;
  is_stale: boolean;
  created_at: string;
  updated_at: string;
}

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
  source_agency: { id: string; name: string } | null;
  is_modified: boolean;
  pending_crm_update: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    email: string;
    role?: string;
  };
}

export interface UserPropertyDetail extends UserProperty {
  source_links: PropertySourceLink[];
  history: PropertyHistoryEntry[];
  integration_property?: IntegrationProperty | null;
  localized_contents?: PropertyLocalizedContent[];
  text_truncate_pieces?: string[];
  integration_email?: string | null;
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
  estateweb_scope_id?: number | null;
  estateweb_energy_class_id?: number | null;
  estateweb_road_type_id?: number | null;
  features?: string[] | null;
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
  change?: PropertyChangeFilter;
  search?: string;
  city?: string;
  price_min?: number;
  price_max?: number;
  has_duplicate_group?: boolean;
  pushed_to_crm?: boolean;
  pending_crm_update?: boolean;
  agency_id?: string;
  user_tracked_agency_id?: string;
  date_from?: string;
  date_to?: string;
  order_by?: "created_at" | "updated_at" | "price";
  order_direction?: "asc" | "desc";
}

export interface AdminUserPropertyListQuery {
  page?: number;
  limit?: number;
  status?: PropertyStatus;
  change?: PropertyChangeFilter;
  listing_type?: ListingType;
  property_type?: PropertyType;
  search?: string;
  user_id?: string;
  agency_id?: string;
  has_duplicate_group?: boolean;
  pushed_to_crm?: boolean;
  pending_crm_update?: boolean;
  date_from?: string;
  date_to?: string;
  order_by?: "created_at" | "updated_at" | "price";
  order_direction?: "asc" | "desc";
}

export type UserPropertyCountQuery = Omit<UserPropertyListQuery, "page" | "limit">;

export type AdminUserPropertyCountQuery = Omit<
  AdminUserPropertyListQuery,
  "page" | "limit"
>;

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

export interface PushUserPropertiesToCrmPayload {
  ids: string[];
}

export interface PushUserPropertiesToCrmResult {
  queued: number;
  batches_enqueued: number;
  failed: Array<{ user_property_id: string; error: string }>;
}

export interface UpdateEstateWebSitesPayload {
  ids: string[];
  sites: Array<{
    selected: boolean;
    name: string;
    agent_site_id: number;
    show_on_slider: 0 | 1;
    show_on_first_page: 0 | 1;
    show_on_relative_pages: 0 | 1;
  }>;
}

export interface UpdateEstateWebSitesResult {
  job_log_id: string;
  enqueued: number;
  failed: Array<{ user_property_id: string; error: string }>;
  message: string;
}

export interface UpdateSalesPricesPayload {
  ids: string[];
}

export interface UpdateSalesPricesResult {
  job_log_id: string;
  enqueued: number;
  failed: Array<{ user_property_id: string; error: string }>;
  message: string;
}

export interface SyncCrmClientNotesPayload {
  ids: string[];
}

export interface SyncCrmClientNotesResult {
  job_log_id: string;
  enqueued: number;
  failed: Array<{ user_property_id: string; error: string }>;
  message: string;
}

export interface RenormalizeUserPropertiesPayload {
  ids: string[];
}

export interface RenormalizeUserPropertiesResult {
  job_log_id: string;
  enqueued: number;
  failed: Array<{ user_property_id: string; error: string }>;
  message: string;
}

export interface BulkDeleteIntegrationImagesPayload {
  ids: string[];
}

export interface BulkDeleteIntegrationImagesResult {
  job_log_id: string;
  enqueued: number;
  failed: Array<{ user_property_id: string; error: string }>;
  message: string;
}

export interface DedupeUserPropertiesPayload {
  ids: string[];
}

export interface DedupeUserPropertiesResult {
  deleted: number;
  kept: string[];
}

export interface SplitUserPropertiesPayload {
  ids: string[];
}

export interface SplitUserPropertiesResult {
  split: number;
}

export interface TruncateUserPropertyDescriptionsPayload {
  ids: string[];
  texts: string[];
  replacement?: string;
}

export interface UpdateUserPropertyStatusPayload {
  ids: string[];
  status: PropertyStatus;
}

export interface UpdateUserPropertyStatusResult {
  updated: number;
  status: PropertyStatus;
}

export interface TruncateUserPropertyDescriptionsResult {
  updated: number;
  total: number;
  queued?: number;
}

export interface UpdateIntegrationImagesPayload {
  image_ids: number[];
  show_on_site: boolean;
  show_on_groups: boolean;
  show_on_foreign_agents: boolean;
}

export interface RemoveWatermarkImagesPayload {
  image_ids?: string[];
  image_count?: number;
  replace_crm_images: boolean;
}

export interface BulkRemoveWatermarkImagesPayload {
  ids: string[];
  image_count: number;
  replace_crm_images: boolean;
}

export type MigrateIntegrationImagesMode = "remap_sources" | "from_crm";

export interface MigrateIntegrationImagesPayload {
  mode: MigrateIntegrationImagesMode;
}

export interface BulkMigrateIntegrationImagesPayload {
  ids: string[];
  mode: MigrateIntegrationImagesMode;
}

export interface BulkMigrateIntegrationImagesResult {
  job_log_id: string;
  enqueued: number;
  failed: Array<{ user_property_id: string; error: string }>;
  message: string;
}

export interface RemoveWatermarkImagesResponse {
  job_log_id: string;
  message: string;
}

export interface BulkRemoveWatermarkImagesResponse {
  job_log_ids: string[];
  enqueued: number;
  failed: Array<{ user_property_id: string; error: string }>;
  message: string;
}

export interface ProduceUserPropertyContentPayload {
  ids: string[];
  run_translations?: boolean;
  run_ai_titles?: boolean;
  use_ai_batch?: boolean;
  regenerate?: boolean;
  push_to_crm?: boolean;
}

export interface ProduceUserPropertyContentResponse {
  job_log_id: string;
  enqueued: number;
  message: string;
  skipped?: Array<{ user_property_id: string; error: string }>;
}
