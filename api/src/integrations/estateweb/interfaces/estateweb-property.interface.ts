import FormData = require('form-data');
import {
  EstateWebAgentSiteId,
  EstateWebGatewayLogo,
} from '../constants/estateweb-agent-catalog.constants';
import {
  EstateWebAgentScope,
  EstateWebBooleanFlag,
  EstateWebHasKeys,
  EstateWebIncomePeriod,
  EstateWebIncomeType,
  EstateWebLanguageId,
  EstateWebPropertyHistoryTypeId,
  EstateWebPropertyListSortColumn,
  EstateWebPropertyListSortWay,
  EstateWebPropertyTypeId,
  EstateWebScope,
  EstateWebStatusId,
} from '../constants/estateweb-enums.constants';
import {
  EstateWebFieldId,
  EstateWebSelectFieldEntry,
} from '../constants/estateweb-field-options.constants';

export interface EstateWebPropertyAd {
  lang_id: EstateWebLanguageId;
  title?: string;
  description?: string;
  text?: string;
}

export interface EstateWebPropertySelectFieldValue {
  id: EstateWebFieldId;
  value: number;
}

export interface EstateWebPropertyBooleanFieldValue {
  id: EstateWebFieldId;
  value: '1';
}

export interface EstateWebPropertyScalarFieldValue {
  id: EstateWebFieldId;
  value: string;
}

export type EstateWebPropertyFieldValue =
  | EstateWebSelectFieldEntry
  | EstateWebPropertyBooleanFieldValue
  | EstateWebPropertyScalarFieldValue;

export interface EstateWebPropertyFieldResponse {
  field_id: number;
  value: string;
}

export interface EstateWebPropertySite {
  agent_site_id: EstateWebAgentSiteId | number;
  selected?: boolean;
  name?: string;
  show_on_slider?: EstateWebBooleanFlag | boolean;
  show_on_first_page?: EstateWebBooleanFlag | boolean;
  show_on_relative_pages?: EstateWebBooleanFlag | boolean;
}

export interface EstateWebPropertyGateway {
  logo?: EstateWebGatewayLogo | string;
  name?: string;
  agent_id?: number;
  selected?: boolean;
}

export interface EstateWebPropertyForeignAgent {
  id?: number;
  name?: string;
  selected?: boolean;
}

export interface EstateWebPropertyNote {
  id?: number;
  text?: string;
  created_at?: string;
  created_by?: number;
}

export interface EstateWebPropertyImage {
  id: number;
  path: string;
  filename: string;
  show_on_site: boolean;
  show_on_groups: boolean;
  show_on_foreign_agents: boolean;
}

export interface EstateWebPropertyHistorySiteChange {
  added_sites?: EstateWebAgentSiteId[] | number[];
  removed_sites?: EstateWebAgentSiteId[] | number[];
}

export interface EstateWebPropertyHistoryEntry {
  property_id: number;
  entry_type_id: EstateWebPropertyHistoryTypeId | number;
  data: string | EstateWebPropertyHistorySiteChange;
  created_by: number;
  created_at: string;
}

export interface EstateWebPropertyRentalHistoryEntry {
  client_id: number;
  in_date: string;
  price: string;
}

export interface EstateWebPropertyMetadata {
  guarantee?: string;
  stamp?: string;
  inc_type?: EstateWebIncomeType;
  inc_value?: string;
  inc_period?: EstateWebIncomePeriod;
  inc_2years?: EstateWebBooleanFlag;
  contract_period?: string;
  terms?: string;
  has_keys?: EstateWebHasKeys;
  rental_history?: EstateWebPropertyRentalHistoryEntry[];
}

export interface EstateWebPropertyPayload {
  id?: number;
  type_id: EstateWebPropertyTypeId | number;
  scope_id: EstateWebScope;
  location_id: number;
  client_id?: number;
  coop_id?: number;
  to_client_id?: number;
  code?: string;
  address?: string;
  zip?: string;
  price_start?: number;
  price?: number;
  price_final?: number;
  price_web?: number;
  sqm?: number;
  distance_airport?: string;
  distance_port?: string;
  distance_beach?: string;
  description?: string;
  status_id?: EstateWebStatusId;
  is_offer?: EstateWebBooleanFlag;
  is_exclusive_order?: EstateWebBooleanFlag;
  video_url?: string;
  show_video_on_site?: EstateWebBooleanFlag;
  lat_lng?: string;
  show_map_on_site?: EstateWebBooleanFlag;
  metadata?: string | EstateWebPropertyMetadata;
  client_contacted_at?: string;
  expires_at?: string;
  fields?: EstateWebPropertyFieldValue[];
  sites?: EstateWebPropertySite[];
  gateways?: EstateWebPropertyGateway[];
  ads?: EstateWebPropertyAd[];
  foreign_agents?: EstateWebPropertyForeignAgent[];
  images?: EstateWebPropertyImage[];
  history?: EstateWebPropertyHistoryEntry[];
  notes?: EstateWebPropertyNote[];
  price_negotiable?: EstateWebBooleanFlag;
  note?: string;
}

export type EstateWebCreatePropertyPayload = EstateWebPropertyPayload;

export interface EstateWebUpdatePropertyPayload
  extends EstateWebPropertyPayload {
  id: number;
  agent_id?: number;
  group_id?: number;
  user_id?: number;
  created_at?: string;
  updated_at?: string | null;
  deleted_at?: string | null;
  old_location_id?: number;
}

export interface EstateWebPropertyListQuery {
  code?: string;
  scope_id?: EstateWebScope | number;
  client_id?: number;
  sqm_from?: number;
  sqm_to?: number;
  price_from?: number;
  price_to?: number;
  address?: string;
  is_exclusive_order?: EstateWebBooleanFlag | number;
  is_offer?: EstateWebBooleanFlag | number;
  status_id?: EstateWebStatusId | number;
  types?: string;
  locations?: string;
  site_id?: EstateWebAgentSiteId | number;
  gateway_id?: number;
  agent_scope?: EstateWebAgentScope;
  page?: number;
  rpp?: number;
  sort_col?: EstateWebPropertyListSortColumn;
  sort_way?: EstateWebPropertyListSortWay;
}

export interface EstateWebUploadImagePayload {
  filename: string;
  show_on_site?: EstateWebBooleanFlag;
  show_on_groups?: EstateWebBooleanFlag;
  show_on_foreign_agents?: EstateWebBooleanFlag;
  zindex?: number;
}

export interface EstateWebUpdateImagePayload {
  show_on_site?: EstateWebBooleanFlag | boolean;
  show_on_groups?: EstateWebBooleanFlag | boolean;
  show_on_foreign_agents?: EstateWebBooleanFlag | boolean;
  filename?: string;
  zindex?: number;
}

export interface EstateWebCreatePropertyResponse {
  id: number;
  code?: string;
}

export interface EstateWebPropertyListImage {
  id: number;
  path: string;
  filename: string;
}

export interface EstateWebPropertyListItem {
  id: number;
  code?: string;
  scope_id: EstateWebScope | number;
  type_id: EstateWebPropertyTypeId | number;
  location_id: number;
  address?: string;
  sqm?: number;
  price?: number;
  client_id?: number | null;
  coop_id?: number | null;
  client_contacted_at?: string | null;
  expires_at?: string | null;
  description?: string;
  status_id?: EstateWebStatusId | number;
  created_at?: string;
  updated_at?: string | null;
  agent_id?: number;
  group_id?: number;
  user_id?: number;
  location_name?: string;
  default_sorting?: string;
  image?: EstateWebPropertyListImage[];
  sites?: EstateWebPropertySite[];
}

export interface EstateWebPropertyListResponse {
  total: number;
  debug?: unknown;
  list: EstateWebPropertyListItem[];
}

export interface EstateWebPropertyResponse {
  id: number;
  agent_id?: number;
  group_id?: number;
  user_id?: number;
  scope_id: EstateWebScope;
  type_id: EstateWebPropertyTypeId | number;
  location_id: number;
  client_id?: number | null;
  coop_id?: number | null;
  to_client_id?: number | null;
  code?: string;
  address?: string | null;
  zip?: string;
  price_start?: number;
  price?: number;
  price_final?: number;
  price_web?: number;
  sqm?: number;
  distance_airport?: string;
  distance_port?: string;
  distance_beach?: string;
  description?: string;
  status_id?: EstateWebStatusId;
  is_offer?: boolean;
  is_exclusive_order?: boolean;
  video_url?: string;
  show_video_on_site?: boolean;
  lat_lng?: string;
  show_map_on_site?: boolean;
  metadata?: EstateWebPropertyMetadata;
  notes?: EstateWebPropertyNote[];
  client_contacted_at?: string | null;
  expires_at?: string | null;
  created_at?: string;
  updated_at?: string | null;
  deleted_at?: string | null;
  price_negotiable?: boolean;
  old_location_id?: number;
  fields?: EstateWebPropertyFieldResponse[];
  images?: EstateWebPropertyImage[];
  ads?: EstateWebPropertyAd[];
  sites?: EstateWebPropertySite[];
  foreign_agents?: EstateWebPropertyForeignAgent[];
  history?: EstateWebPropertyHistoryEntry[];
  gateways?: EstateWebPropertyGateway[];
}

export interface EstateWebClientRequestOptions {
  method?: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  formData?: FormData;
  retryOnUnauthorized?: boolean;
  operation?: string;
  propertyId?: number | string;
  validateCreateResponse?: boolean;
}

export function serializeEstateWebPropertyMetadata(
  metadata: EstateWebPropertyMetadata,
): string {
  return JSON.stringify(metadata);
}
