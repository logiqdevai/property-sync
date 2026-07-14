import FormData from 'form-data';

export interface EstateWebPropertyAd {
  lang_id: number;
  title?: string;
  description?: string;
  text?: string;
}

export interface EstateWebPropertyField {
  id: number;
  value: string | number;
}

export interface EstateWebCreatePropertyPayload {
  id: number;
  type_id: number;
  scope_id: number;
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
  status_id?: number;
  is_offer?: number;
  is_exclusive_order?: number;
  video_url?: string;
  show_video_on_site?: number;
  lat_lng?: string;
  show_map_on_site?: number;
  metadata?: string;
  client_contacted_at?: string;
  expires_at?: string;
  fields?: EstateWebPropertyField[];
  sites?: unknown[];
  gateways?: unknown[];
  ads?: EstateWebPropertyAd[];
  foreign_agents?: unknown[];
  history?: unknown[];
  notes?: unknown[];
  price_negotiable?: number;
  note?: string;
}

export interface EstateWebUpdatePropertyPayload
  extends EstateWebCreatePropertyPayload {
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
  scope_id?: number;
  client_id?: number;
  sqm_from?: number;
  sqm_to?: number;
  price_from?: number;
  price_to?: number;
  address?: string;
  is_exclusive_order?: number;
  is_offer?: number;
  status_id?: number;
  types?: string;
  locations?: string;
  site_id?: number;
  gateway_id?: number;
  agent_scope?: number;
  page?: number;
  rpp?: number;
  sort_col?: string;
  sort_way?: 'ASC' | 'DESC';
}

export interface EstateWebUploadImagePayload {
  filename: string;
  show_on_site?: number;
  show_on_groups?: number;
  show_on_foreign_agents?: number;
  zindex?: number;
}

export interface EstateWebPropertyResponse {
  id: number;
  code?: string;
  [key: string]: unknown;
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
