export type FieldType = 'text' | 'href' | 'src' | 'background_image';

export interface FieldDef {
  selector: string;
  type: FieldType;
}

export type PaginationType =
  | 'next_button'
  | 'load_more'
  | 'infinite_scroll'
  | 'url_param'
  | 'none'
  | 'NEXT_BUTTON'
  | 'LOAD_MORE'
  | 'INFINITE_SCROLL'
  | 'URL_PARAM'
  | 'NONE';

export interface PaginationConfig {
  type: PaginationType;
  selector?: string;
  url_param?: string;
}

export interface DetailPageConfig {
  image_selector?: string;
  image_type?: 'src' | 'background_image';
  description_selector?: string;
  specs_selector?: string;
  features_selector?: string;
  external_id_source?: 'url_path' | 'selector';
  external_id_selector?: string;
  // When set, overrides raw.title / raw.price with the (usually more complete/clean)
  // text found on the detail page, since listing cards often have shorter/dirtier text.
  title_selector?: string;
  price_selector?: string;
  location_selector?: string;
}

export interface ScraperConfig {
  start_url: string;
  listing_selector: string;
  fields?: Record<string, string | FieldDef>;
  pagination?: PaginationConfig;
  detail_page?: DetailPageConfig;
  // When true, a property about to be marked REMOVED (missing from the current crawl) is first
  // checked for a "SOLD" stamp baked into the pixels of its primary image (agencies that don't
  // expose sold status as page text/markup, only as a burned-in watermark on the cover photo) —
  // see property-normalization.service.ts#detectRemovalsAndReappearances.
  sold_watermark_check?: boolean;
}

export interface CrawlItem {
  source_url: string;
  raw: Record<string, unknown>;
}

export interface CrawlStep {
  ts: string;
  msg: string;
  [key: string]: unknown;
}

export interface CrawlResult {
  items: CrawlItem[];
  steps: CrawlStep[];
  success: boolean;
  errorSummary?: string | null;
  networkError?: boolean;
  zeroListingsPage0?: boolean;
}
