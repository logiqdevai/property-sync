/**
 * Desktop crawls are recorded with the same `metadata.source` as the `mcp-crawl` skill's runs, so
 * everything that tells a browser-driven crawl apart from a scheduled server crawl (the skill's
 * "latest normal crawl" query, the admin pages) treats both the same. `transport` tells them apart.
 */
export const DESKTOP_CRAWL_SOURCE = 'mcp-crawl';
export const DESKTOP_CRAWL_TRANSPORT = 'desktop-app';

/** Hard cap on paid captcha solves per scraper per rolling hour, so a looping page cannot run up a bill. */
export const DESKTOP_CRAWL_MAX_CAPTCHA_SOLVES_PER_HOUR = 120;

/**
 * The crawl's finalization reads `auto_update_to_crm` when it runs, after normalization has
 * completed. Auto-update is restored only once normalization is done AND the run and its
 * cms_sync_runs rows have stopped changing for this long (mcp-crawl skill §2 step 4).
 */
export const AUTO_UPDATE_RESTORE_SETTLE_MS = 60_000;

/** Upload limits. The items arrive gzipped; the unpacked JSON is capped separately. */
export const DESKTOP_CRAWL_UPLOAD_MAX_GZIP_BYTES = 60 * 1024 * 1024;
export const DESKTOP_CRAWL_UPLOAD_MAX_JSON_BYTES = 400 * 1024 * 1024;
export const DESKTOP_CRAWL_UPLOAD_CONTENT_TYPE = 'application/gzip';

/** Photo repair limits (one request per listing). */
export const PHOTO_CHECK_BATCH_MAX = 25;
export const PHOTO_UPLOAD_MAX_FILES = 60;
export const PHOTO_UPLOAD_MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Pause between live EstateWeb reads, same as scripts/check-estateweb-images.ts. */
export const PHOTO_CHECK_DELAY_MS = 200;

/** Pacing the desktop app uses between page loads (mcp-crawl skill §3b). */
export const DESKTOP_CRAWL_PACING = {
  page_delay_min_ms: 250,
  page_delay_max_ms: 650,
  backoff_delay_min_ms: 1_500,
  backoff_delay_max_ms: 3_000,
  page_timeout_ms: 60_000,
  max_listing_pages: 500,
} as const;

/** How far back a new desktop run looks for an earlier run's still-pending auto-update restore. */
export const PENDING_RESTORE_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

/** The published desktop app: `<GcsFolders.desktopCrawler>/latest.json` points at the newest installer. */
export const DESKTOP_APP_MANIFEST_FILE = 'latest.json';
/** Lifetime of the download link handed to the admin page. */
export const DESKTOP_APP_DOWNLOAD_LINK_MINUTES = 15;

/**
 * Files the auto-updater may fetch through `GET /desktop-crawl/app/update/:file`: electron-builder's
 * `latest.yml` and the installers. Nothing else in the folder (no path separators) is reachable.
 */
export const DESKTOP_APP_UPDATE_FILE_PATTERN = /^(latest\.yml|[\w.-]+\.exe)$/;
