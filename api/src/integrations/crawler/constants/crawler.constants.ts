export const DEFAULT_MAX_PAGES = 50;
export const DEFAULT_PAGE_TIMEOUT_MS = 30_000;
export const DEFAULT_SELECTOR_TIMEOUT_MS = 15_000;
export const DEFAULT_SCROLL_PAUSE_MS = 1_500;
// Some infinite-scroll sites take a couple seconds to fetch/render the next
// batch after the scroll event fires -- polling repeatedly (instead of a single
// fixed wait) lets fast sites finish early while still giving slow ones enough
// time to actually load more cards before we give up on pagination.
export const INFINITE_SCROLL_MAX_WAIT_MS = 20_000;
export const INFINITE_SCROLL_POLL_INTERVAL_MS = 400;
export const INFINITE_SCROLL_STEP_VIEWPORT_RATIO = 0.75;
export const DEFAULT_DETAIL_CONCURRENCY = 2;
export const DEFAULT_DETAIL_DELAY_MS = 1_500;
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
// Some sites render a fallback graphic (the agency's own header logo, a "no photo
// available" banner, ...) inside a photo-less listing's image slot, using an opaque
// CDN URL that gives no textual hint it isn't a real photo (unlike "logo.png"). A
// genuine property photo essentially never repeats verbatim across unrelated
// listings, so any image URL seen this many times or more across one crawl's items
// is treated as a shared placeholder and stripped from every item, not just filtered
// by URL keyword matching.
export const SHARED_PLACEHOLDER_IMAGE_MIN_OCCURRENCES = 3;
