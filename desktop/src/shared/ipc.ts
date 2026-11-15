/**
 * Contract between the Electron main process (which drives Chrome and talks to the API for the
 * crawl itself) and the React UI. The preload script exposes it as `window.desktop`.
 */

export const IpcChannels = {
  SET_SESSION: "auth:set-session",
  APP_INFO: "app:info",
  OPEN_EXTERNAL: "app:open-external",
  BROWSER_CHECK: "browser:check",
  CRAWL_START: "crawl:start",
  CRAWL_STOP: "crawl:stop",
  CRAWL_STATE: "crawl:state",
  CRAWL_CHECKPOINT: "crawl:checkpoint",
  CRAWL_DISMISS: "crawl:dismiss",
  PHOTOS_START: "photos:start",
  PHOTOS_STOP: "photos:stop",
  PHOTOS_STATE: "photos:state",
  PHOTOS_DISMISS: "photos:dismiss",
} as const;

export interface DesktopSession {
  access_token: string;
  /** API base url without a trailing slash. */
  api_url: string;
}

export interface AppInfo {
  version: string;
  platform: string;
}

export type BrowserChannel = "chrome" | "msedge";

export interface BrowserCheck {
  /** The installed browser the crawler will drive, or null when neither Chrome nor Edge is found. */
  channel: BrowserChannel | null;
}

export const CrawlPhases = {
  IDLE: "IDLE",
  PREPARING: "PREPARING",
  LISTING: "LISTING",
  DETAILS: "DETAILS",
  UPLOADING: "UPLOADING",
  SAVING: "SAVING",
  DONE: "DONE",
  STOPPED: "STOPPED",
  FAILED: "FAILED",
} as const;
export type CrawlPhase = (typeof CrawlPhases)[keyof typeof CrawlPhases];

export const BlockStates = {
  NONE: "NONE",
  SOLVING: "SOLVING",
  NEEDS_USER: "NEEDS_USER",
} as const;
export type BlockState = (typeof BlockStates)[keyof typeof BlockStates];

export interface CrawlResult {
  crawl_run_id: string;
  total_found: number;
  total_new_listings: number;
  total_refreshed_listings: number;
  total_removed: number;
  held_for_review: number | null;
  held_without_photos: number | null;
}

export interface CrawlState {
  scraper_id: string | null;
  agency_id: string | null;
  agency_name: string | null;
  phase: CrawlPhase;
  block: BlockState;
  /** Listing (search result) pages read so far. */
  listing_pages: number;
  /** Listings found on those pages. */
  listings_found: number;
  details_done: number;
  details_total: number;
  details_failed: number;
  captcha_solves: number;
  started_at: string | null;
  /** True when this run continued from a saved, unfinished crawl. */
  resumed: boolean;
  result: CrawlResult | null;
  /** Plain-language error for the user. */
  error: string | null;
  /** Short technical lines, newest last (shown under "Details"). */
  log: string[];
}

export interface CrawlCheckpointInfo {
  scraper_id: string;
  saved_at: string;
  listings: number;
  details_done: number;
  listing_walk_finished: boolean;
}

export interface StartCrawlRequest {
  scraper_id: string;
  agency_id: string;
  agency_name: string;
  /** Continue the saved, unfinished crawl of this agency instead of starting over. */
  resume: boolean;
}

export const PhotoPhases = {
  IDLE: "IDLE",
  CHECKING: "CHECKING",
  FIXING: "FIXING",
  DONE: "DONE",
  STOPPED: "STOPPED",
  FAILED: "FAILED",
} as const;
export type PhotoPhase = (typeof PhotoPhases)[keyof typeof PhotoPhases];

export interface PhotoState {
  agency_id: string | null;
  agency_name: string | null;
  phase: PhotoPhase;
  block: BlockState;
  /** Listings already pushed to the CRM. */
  total: number;
  checked: number;
  /** Listings found with no photos in the CRM. */
  missing: number;
  fixed: number;
  /** Listings whose photos could not be fixed (ids, for support). */
  still_missing: string[];
  check_errors: number;
  error: string | null;
  log: string[];
}

export interface StartPhotosRequest {
  agency_id: string;
  agency_name: string;
}

/** What the preload script exposes on `window.desktop`. */
export interface DesktopBridge {
  auth: {
    setSession(session: DesktopSession | null): Promise<void>;
  };
  app: {
    info(): Promise<AppInfo>;
    openExternal(url: string): Promise<void>;
    checkBrowser(): Promise<BrowserCheck>;
  };
  crawl: {
    start(request: StartCrawlRequest): Promise<void>;
    stop(): Promise<void>;
    dismiss(): Promise<void>;
    getState(): Promise<CrawlState>;
    onState(listener: (state: CrawlState) => void): () => void;
    getCheckpoint(scraperId: string): Promise<CrawlCheckpointInfo | null>;
  };
  photos: {
    start(request: StartPhotosRequest): Promise<void>;
    stop(): Promise<void>;
    dismiss(): Promise<void>;
    getState(): Promise<PhotoState>;
    onState(listener: (state: PhotoState) => void): () => void;
  };
}
