export type ActivityFeedType =
  | "crawl"
  | "crawl_failed"
  | "listing_created"
  | "listing_removed"
  | "scraper_broken"
  | "generation";

export interface DashboardKpis {
  scrapers_total: number;
  scrapers_active: number;
  scrapers_broken: number;
  agencies_total: number;
  agencies_active: number;
  agencies_disabled: number;
  agencies_archived: number;
  running_crawls: number;
  failed_crawls_24h: number;
  last_crawl_at: string | null;
  properties_imported_today: number;
  properties_updated_today: number;
  properties_removed_today: number;
  failed_properties_today: number;
  properties_total: number;
  queue_waiting: number;
  queue_active: number;
  queue_failed: number;
  active_generation_runs: number;
  active_integrations: number;
  total_integrations: number;
  unread_notifications: number;
}

export interface ActivityFeedItem {
  type: ActivityFeedType;
  timestamp: string;
  summary: string;
  crawl_run_id?: string;
  generation_run_id?: string;
  scraper_id?: string;
  property_id?: string;
  source_agency_id?: string;
}

export interface DashboardResponse {
  kpis: DashboardKpis;
  activity: ActivityFeedItem[];
}
