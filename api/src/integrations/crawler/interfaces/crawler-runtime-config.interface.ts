export interface ResolvedCrawlerConfig {
  max_pages: number;
  page_timeout_ms: number;
  selector_timeout_ms: number;
  scroll_pause_ms: number;
  detail_concurrency: number;
  detail_delay_ms: number;
  crawl_worker_concurrency: number;
  crawl_job_timeout_ms: number;
  chromium_max_contexts_before_restart: number;
}
