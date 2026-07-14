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
