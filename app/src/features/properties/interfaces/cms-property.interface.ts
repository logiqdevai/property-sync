export interface CmsPropertyFieldEntry {
  id: number;
  value: string | number;
}

export interface CmsPropertyMetadata {
  guarantee?: string | null;
  stamp?: string | null;
  inc_type?: number | null;
  inc_value?: string | null;
  inc_period?: number | null;
  inc_2years?: string | null;
  contract_period?: string | null;
  terms?: string | null;
  has_keys?: string | null;
}

export interface PropertyCmsFields {
  estateweb_type_id: number | null;
  estateweb_location_id: number | null;
  cms_fields: CmsPropertyFieldEntry[] | null;
  cms_metadata: CmsPropertyMetadata | null;
  video_url: string | null;
  distance_airport: string | null;
  distance_port: string | null;
  distance_beach: string | null;
  price_start: string | null;
  price_web: string | null;
}
