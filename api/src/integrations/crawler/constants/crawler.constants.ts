export const MAX_PAGES = Number(process.env.CRAWL_MAX_PAGES ?? 50);
export const PAGE_TIMEOUT_MS = Number(process.env.CRAWL_PAGE_TIMEOUT_MS ?? 30_000);
export const SELECTOR_TIMEOUT_MS = Number(
  process.env.CRAWL_SELECTOR_TIMEOUT_MS ?? 15_000,
);
export const SCROLL_PAUSE_MS = Number(process.env.CRAWL_SCROLL_PAUSE_MS ?? 1_500);
export const DETAIL_CONCURRENCY = Number(process.env.CRAWL_DETAIL_CONCURRENCY ?? 3);
export const DETAIL_DELAY_MS = Number(process.env.CRAWL_DETAIL_DELAY_MS ?? 500);
export const CRAWL_WORKER_CONCURRENCY = Number(
  process.env.CRAWL_WORKER_CONCURRENCY ?? 5,
);
export const CRAWL_JOB_TIMEOUT_MS = Number(
  process.env.CRAWL_JOB_TIMEOUT_MS ?? 30 * 60_000,
);
export const CHROMIUM_MAX_CONTEXTS_BEFORE_RESTART = Number(
  process.env.CRAWL_CHROMIUM_MAX_CONTEXTS_BEFORE_RESTART ?? 250,
);
