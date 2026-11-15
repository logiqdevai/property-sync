export const AttentionReasons = {
  BLOCKED: "BLOCKED",
  FAILED: "FAILED",
  EMPTY: "EMPTY",
  BROKEN: "BROKEN",
} as const;
export type AttentionReason = (typeof AttentionReasons)[keyof typeof AttentionReasons];

export interface CrawlRunSummary {
  id: string;
  status: string;
  created_at: string;
  total_found: number;
  error_message: string | null;
}

export interface CrawlableAgency {
  scraper_id: string;
  scraper_name: string;
  scraper_status: string;
  agency_id: string;
  agency_name: string;
  agency_url: string;
  /** Why the agency needs a crawl from this app; null when its scheduled crawl works. */
  attention: AttentionReason | null;
  last_server_crawl: CrawlRunSummary | null;
  last_desktop_crawl: CrawlRunSummary | null;
  has_config: boolean;
}

export interface CrawlableAgenciesQuery {
  search?: string;
  only_attention?: boolean;
}
