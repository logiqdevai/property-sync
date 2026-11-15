import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { app } from "electron";
import type { CrawlCheckpointInfo } from "@shared/ipc";
import type { CrawlUploadItem } from "../api/api.interfaces";

/** A listing collected so far; `detail_done` marks that its detail page was visited. */
export interface CheckpointItem extends CrawlUploadItem {
  detail_done?: boolean;
}

export interface CrawlCheckpoint {
  version: 1;
  scraper_id: string;
  agency_id: string;
  saved_at: string;
  listing_walk_finished: boolean;
  listing_pages: number;
  items: CheckpointItem[];
}

/** An unfinished crawl older than this is stale; starting over is cheaper than trusting it. */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

const dir = () => join(app.getPath("userData"), "crawls");
const fileFor = (scraperId: string) => join(dir(), `${scraperId.replace(/[^a-z0-9-]/gi, "")}.json`);

export const checkpointStore = {
  load(scraperId: string): CrawlCheckpoint | null {
    const file = fileFor(scraperId);
    if (!existsSync(file)) return null;
    try {
      const checkpoint = JSON.parse(readFileSync(file, "utf8")) as CrawlCheckpoint;
      if (checkpoint.version !== 1) return null;
      if (Date.now() - Date.parse(checkpoint.saved_at) > MAX_AGE_MS) {
        this.discard(scraperId);
        return null;
      }
      return checkpoint;
    } catch {
      return null;
    }
  },

  /** Written to a temp file first, so a crash mid-write never corrupts the saved crawl. */
  save(checkpoint: CrawlCheckpoint): void {
    mkdirSync(dir(), { recursive: true });
    const file = fileFor(checkpoint.scraper_id);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ ...checkpoint, saved_at: new Date().toISOString() }));
    renameSync(tmp, file);
  },

  discard(scraperId: string): void {
    rmSync(fileFor(scraperId), { force: true });
  },

  /** Every saved, unfinished crawl, by scraper id. */
  listInfo(): Record<string, CrawlCheckpointInfo> {
    if (!existsSync(dir())) return {};
    const result: Record<string, CrawlCheckpointInfo> = {};
    for (const file of readdirSync(dir())) {
      if (!file.endsWith(".json")) continue;
      const info = this.info(file.slice(0, -".json".length));
      if (info) result[info.scraper_id] = info;
    }
    return result;
  },

  info(scraperId: string): CrawlCheckpointInfo | null {
    const checkpoint = this.load(scraperId);
    if (!checkpoint) return null;
    return {
      scraper_id: checkpoint.scraper_id,
      saved_at: checkpoint.saved_at,
      listings: checkpoint.items.length,
      details_done: checkpoint.items.filter((i) => i.detail_done).length,
      listing_walk_finished: checkpoint.listing_walk_finished,
    };
  },
};
