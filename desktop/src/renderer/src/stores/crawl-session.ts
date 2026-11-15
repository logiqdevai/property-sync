import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { BlockStates, CrawlPhases, type CrawlState } from "@shared/ipc";

/**
 * Mirror of the crawl running in the Electron main process (kept in sync by TaskStateSync).
 * Not persisted: the main process is the source of truth and re-sends it on start-up.
 */
interface CrawlSessionStore {
  state: CrawlState;
  setState(state: CrawlState): void;
}

export const initialCrawlState: CrawlState = {
  scraper_id: null,
  agency_id: null,
  agency_name: null,
  phase: CrawlPhases.IDLE,
  block: BlockStates.NONE,
  listing_pages: 0,
  listings_found: 0,
  details_done: 0,
  details_total: 0,
  details_failed: 0,
  captcha_solves: 0,
  started_at: null,
  resumed: false,
  result: null,
  error: null,
  log: [],
};

const STORE_KEY = "crawl-session";

export const useCrawlSessionStore = create<CrawlSessionStore>()(
  devtools(
    (set) => ({
      state: initialCrawlState,
      setState: (state) => set({ state }),
    }),
    { name: STORE_KEY },
  ),
);

export const getCrawlSessionStoreState = () => useCrawlSessionStore.getState();
