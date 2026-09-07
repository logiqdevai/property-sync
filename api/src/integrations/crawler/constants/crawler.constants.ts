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
// A single connection-level blip (net::ERR_HTTP2_PROTOCOL_ERROR, a timed-out
// handshake, ...) on the initial page.goto is often just that site having one
// bad moment, not it actually being down -- retrying in-process a couple times
// before giving up on the whole crawl attempt avoids inflating a scraper's
// consecutive_failures (and eventually marking it BROKEN) over pure flakiness.
export const START_PAGE_GOTO_MAX_ATTEMPTS = 3;
export const START_PAGE_GOTO_RETRY_DELAY_MS = 3_000;
// Same reasoning as above, applied to the "click the next/load-more control and
// wait for the page to change" step -- a click that resolves but whose resulting
// navigation stalls (locator.click: Timeout ...ms exceeded) is the same kind of
// one-off site slowness, not evidence pagination has actually ended.
export const PAGINATION_CLICK_MAX_ATTEMPTS = 3;
export const PAGINATION_CLICK_RETRY_DELAY_MS = 3_000;
// Bright Data's own docs and code examples set page.goto() timeouts to 2
// minutes for the Scraping Browser specifically: "Default timeouts (30s) are
// too short -- complex anti-bot procedures take time," with "anything below
// 60 seconds risks premature timeouts on difficult sites." The platform-wide
// page_timeout_ms default (30s) is fine for the local Chromium; every
// managed-browser navigation should use at least this floor instead.
export const MANAGED_BROWSER_MIN_PAGE_TIMEOUT_MS = 120_000;
// Confirmed via a real production capture: Cloudflare's challenge can report
// "Verification successful. Waiting for <site> to respond" in the page body
// while its <title> is still "Just a moment..." -- our classifier correctly
// still reads that as 'challenge', but the redirect to real content is
// already in flight and normally completes within seconds. The platform
// default challenge-wait ceiling (20s/15s, independent of page_timeout_ms)
// is tuned for a local browser's fast redirect; Bright Data's extra network
// hops need more real time for that same sequence to finish.
export const MANAGED_BROWSER_CHALLENGE_WAIT_MS = 60_000;
