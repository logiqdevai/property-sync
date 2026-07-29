export const DEFAULT_MAX_PAGES = 50;
export const DEFAULT_PAGE_TIMEOUT_MS = 30_000;
export const DEFAULT_SELECTOR_TIMEOUT_MS = 15_000;
export const DEFAULT_SCROLL_PAUSE_MS = 1_500;
export const DEFAULT_DETAIL_CONCURRENCY = 3;
export const DEFAULT_DETAIL_DELAY_MS = 500;
export const DEFAULT_CRAWL_WORKER_CONCURRENCY = 5;
export const DEFAULT_CRAWL_JOB_TIMEOUT_MS = 30 * 60_000;
// A crashed worker (OOM kill, restart) leaves its job's BullMQ lock unrenewed, so
// BullMQ's stalled-job check hands it to the next available worker for a fresh
// attempt -- this is what actually recovers a run within ~30-60s instead of waiting
// on CrawlRunWatchdogCron's 35-minute DB-timestamp fallback. See CrawlProcessor's
// reclaimableStatuses logic, which is what makes a retry of an already-RUNNING run
// safe instead of a silent no-op.
export const DEFAULT_CRAWL_JOB_ATTEMPTS = 3;
export const DEFAULT_CRAWL_JOB_BACKOFF_MS = 60_000;
export const DEFAULT_CHROMIUM_MAX_CONTEXTS_BEFORE_RESTART = 250;
export const CONTEXT_CLOSE_TIMEOUT_MS = 10_000;
export const DETAIL_ENRICHMENT_SOFT_STOP_BUFFER_MS = 15_000;
export const DETAIL_HTML_UPLOAD_TIMEOUT_MS = 30_000;
