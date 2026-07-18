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
}

export interface ScraperConfig {
  start_url: string;
  listing_selector: string;
  fields?: Record<string, string | FieldDef>;
  pagination?: PaginationConfig;
  detail_page?: DetailPageConfig;
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
