import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { CrawlStates } from "@shared/ipc";

/**
 * Mirror of every crawl in the Electron main process, by scraper id (kept in sync by
 * TaskStateSync). Not persisted: the main process is the source of truth and re-sends it.
 */
interface CrawlSessionStore {
  states: CrawlStates;
  setStates(states: CrawlStates): void;
}

const STORE_KEY = "crawl-session";

export const useCrawlSessionStore = create<CrawlSessionStore>()(
  devtools(
    (set) => ({
      states: {},
      setStates: (states) => set({ states }),
    }),
    { name: STORE_KEY },
  ),
);

export const getCrawlSessionStoreState = () => useCrawlSessionStore.getState();
