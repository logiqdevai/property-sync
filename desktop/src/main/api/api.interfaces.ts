/** Shapes of the `desktop-crawl` API (api/src/modules/desktop-crawl). */

export type FieldDef = string | { selector: string; type?: "text" | "href" | "src" | "background_image" };

export interface PaginationConfig {
  type: string;
  selector?: string;
  url_param?: string;
}

export interface DetailPageConfig {
  url_query?: Record<string, string>;
  [key: string]: unknown;
}

export interface ScraperConfig {
  start_url: string;
  listing_selector: string;
  fields?: Record<string, FieldDef>;
  pagination?: PaginationConfig;
  detail_page?: DetailPageConfig;
}

export interface CrawlPacing {
  page_delay_min_ms: number;
  page_delay_max_ms: number;
  backoff_delay_min_ms: number;
  backoff_delay_max_ms: number;
  page_timeout_ms: number;
  max_listing_pages: number;
}

export interface DesktopCrawlJob {
  scraper_id: string;
  scraper_name: string;
  agency_id: string;
  agency_name: string;
  config: ScraperConfig;
  scripts: { listing: string; detail: string };
  pacing: CrawlPacing;
  captcha_solver_available: boolean;
}

export interface CrawlUploadItem {
  source_url: string;
  raw: Record<string, unknown>;
  detail?: Record<string, unknown> | null;
  detail_error?: string | null;
  detail_final_url?: string | null;
  detail_body_text_length?: number | null;
}

export interface CrawlUpload {
  complete: boolean;
  items: CrawlUploadItem[];
  stats?: Record<string, number>;
}

export type ServerCrawlPhase = "SAVING" | "NORMALIZING" | "DONE" | "FAILED";

export interface DesktopCrawlRunStatus {
  crawl_run_id: string;
  agency_id: string;
  phase: ServerCrawlPhase;
  status: string;
  total_found: number;
  total_new_listings: number;
  total_refreshed_listings: number;
  total_removed: number;
  held_for_review: number | null;
  held_without_photos: number | null;
  auto_update_restored: boolean;
  error_message: string | null;
}

export type CaptchaKind = "hcaptcha" | "turnstile" | "recaptcha2";

export interface CaptchaSolveResponse {
  token: string;
  task_id: number;
}

export interface PhotoCheckTarget {
  user_property_id: string;
  title: string | null;
}

export interface PhotoCheckResult {
  user_property_id: string;
  crm_images: number | null;
  missing: boolean;
  error: string | null;
  source_image_urls: string[];
}
