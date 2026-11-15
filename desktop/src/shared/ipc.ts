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
  CRAWL_CHECKPOINTS: "crawl:checkpoints",
  CRAWL_DISMISS: "crawl:dismiss",
  PHOTOS_START: "photos:start",
  PHOTOS_STOP: "photos:stop",
  PHOTOS_STATE: "photos:state",
  PHOTOS_DISMISS: "photos:dismiss",
  UPDATE_STATE: "update:state",
  UPDATE_INSTALL: "update:install",
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

/** Every crawl the app knows about this session, by scraper id (running, finished, stopped). */
export type CrawlStates = Record<string, CrawlState>;

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

/** EstateWeb's page for a listing: `${ESTATEWEB_PROPERTY_URL}/<integration_property_id>`. */
export const ESTATEWEB_PROPERTY_URL = "https://app.estateweb.gr/app/property";

export const StillMissingReasons = {
  /** The listing has no photos in Property Sync either (often the website has none). */
  NO_SOURCE_PHOTOS: "NO_SOURCE_PHOTOS",
  /** None of its photos could be downloaded from the website. */
  DOWNLOAD_FAILED: "DOWNLOAD_FAILED",
  /** Downloaded, but uploading to EstateWeb failed or EstateWeb still shows none. */
  UPLOAD_FAILED: "UPLOAD_FAILED",
} as const;
export type StillMissingReason = (typeof StillMissingReasons)[keyof typeof StillMissingReasons];

/** A listing whose photos could not be fixed, with what's needed to check it by hand. */
export interface StillMissingListing {
  user_property_id: string;
  title: string | null;
  /** The listing's page on the agency's website. */
  source_url: string | null;
  /** The listing in EstateWeb. */
  crm_url: string | null;
  /** Login email of the EstateWeb account it is in. */
  crm_account_email: string | null;
  reason: StillMissingReason;
}

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
  /** Listings whose photos could not be fixed. */
  still_missing: StillMissingListing[];
  check_errors: number;
  error: string | null;
  log: string[];
}

export interface StartPhotosRequest {
  agency_id: string;
  agency_name: string;
}

export const UpdateStatuses = {
  /** Not checked yet, or running from source (updates only apply to the installed app). */
  IDLE: "IDLE",
  CHECKING: "CHECKING",
  UP_TO_DATE: "UP_TO_DATE",
  DOWNLOADING: "DOWNLOADING",
  /** Downloaded; installs on restart (or when the app is next closed). */
  READY: "READY",
  ERROR: "ERROR",
} as const;
export type UpdateStatus = (typeof UpdateStatuses)[keyof typeof UpdateStatuses];

export interface UpdateState {
  status: UpdateStatus;
  current_version: string;
  /** The version being downloaded or ready to install. */
  new_version: string | null;
  percent: number;
  error: string | null;
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
    /** Starts one agency's crawl in its own Chrome tab; several can run at once. */
    start(request: StartCrawlRequest): Promise<void>;
    stop(scraperId: string): Promise<void>;
    /** Forgets a finished/stopped/failed crawl's result (its saved progress stays). */
    dismiss(scraperId: string): Promise<void>;
    getStates(): Promise<CrawlStates>;
    onStates(listener: (states: CrawlStates) => void): () => void;
    getCheckpoint(scraperId: string): Promise<CrawlCheckpointInfo | null>;
    /** Saved, unfinished crawls of every agency, by scraper id. */
    listCheckpoints(): Promise<Record<string, CrawlCheckpointInfo>>;
  };
  update: {
    getState(): Promise<UpdateState>;
    onState(listener: (state: UpdateState) => void): () => void;
    /** Restarts the app into the downloaded version. Refused while a crawl or photo check runs. */
    install(): Promise<void>;
  };
  photos: {
    start(request: StartPhotosRequest): Promise<void>;
    stop(): Promise<void>;
    dismiss(): Promise<void>;
    getState(): Promise<PhotoState>;
    onState(listener: (state: PhotoState) => void): () => void;
  };
}
