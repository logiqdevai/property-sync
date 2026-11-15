import {
  BlockStates,
  CrawlPhases,
  IpcChannels,
  type CrawlState,
  type StartCrawlRequest,
} from "@shared/ipc";
import { api, ApiError } from "../api/api-client";
import type { CrawlUploadItem, DesktopCrawlJob } from "../api/api.interfaces";
import type { BlockContext } from "../browser/block-handling";
import { openCrawlerBrowser, type CrawlerBrowser } from "../browser/browser-launcher";
import { notifyUser } from "../utils/attention";
import { errorMessage, sleep, StoppedError } from "../utils/async.utils";
import { StateChannel } from "../utils/state-channel";
import { checkpointStore, type CheckpointItem, type CrawlCheckpoint } from "./checkpoint-store";
import { walkDetailPages } from "./detail-walk";
import { ListingsNotFoundError, walkListingPages } from "./listing-walk";

const POLL_INTERVAL_MS = 5_000;
/** After this long the app stops watching; the server keeps going on its own. */
const MAX_POLL_MS = 2 * 60 * 60 * 1000;

const initialState = (): CrawlState => ({
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
});

/**
 * One crawl of one agency, end to end: listing pages and detail pages in the visible browser
 * (saved to disk as it goes, so Stop or a crash can resume), then the upload, then watching the
 * server save and process it. Nothing here touches the CRM; the server holds new/changed listings
 * for review.
 */
class CrawlSessionManager {
  private readonly state = new StateChannel<CrawlState>(IpcChannels.CRAWL_STATE, initialState);
  private running = false;
  private stopRequested = false;

  getState(): CrawlState {
    return this.state.get();
  }

  isRunning(): boolean {
    return this.running;
  }

  start(request: StartCrawlRequest): void {
    if (this.running) throw new Error("A crawl is already running.");
    this.running = true;
    this.stopRequested = false;
    this.state.reset({
      scraper_id: request.scraper_id,
      agency_id: request.agency_id,
      agency_name: request.agency_name,
      phase: CrawlPhases.PREPARING,
      started_at: new Date().toISOString(),
    });
    void this.run(request).finally(() => {
      this.running = false;
      this.state.flush();
    });
  }

  stop(): void {
    if (this.running) {
      this.stopRequested = true;
      this.state.log("stopping…");
    }
  }

  dismiss(): void {
    if (!this.running) this.state.reset();
  }

  private async run(request: StartCrawlRequest): Promise<void> {
    let browser: CrawlerBrowser | null = null;
    let checkpoint: CrawlCheckpoint | null = null;
    const save = () => checkpoint && checkpointStore.save(checkpoint);

    try {
      const job = await api.getJob(request.scraper_id);
      this.state.log(`scraper "${job.scraper_name}" loaded`);

      checkpoint = request.resume ? checkpointStore.load(request.scraper_id) : null;
      if (!request.resume) checkpointStore.discard(request.scraper_id);
      checkpoint ??= {
        version: 1,
        scraper_id: request.scraper_id,
        agency_id: request.agency_id,
        saved_at: new Date().toISOString(),
        listing_walk_finished: false,
        listing_pages: 0,
        items: [],
      };
      const current = checkpoint;
      this.state.patch({
        resumed: current.items.length > 0,
        listings_found: current.items.length,
        listing_pages: current.listing_pages,
      });

      browser = await openCrawlerBrowser();
      const page = browser.page;
      const blockContext = this.blockContext(job);

      if (!current.listing_walk_finished) {
        this.state.patch({ phase: CrawlPhases.LISTING });
        const collected = new Map<string, CheckpointItem>(
          current.items.map((item) => [item.source_url, item]),
        );
        current.listing_pages = await walkListingPages(page, job, {
          ...blockContext,
          onListingPage: (pages, found) =>
            this.state.patch({ listing_pages: pages, listings_found: found }),
        }, collected);
        current.items = [...collected.values()];
        current.listing_walk_finished = true;
        save();
      }

      this.state.patch({
        phase: CrawlPhases.DETAILS,
        details_total: current.items.length,
        details_done: current.items.filter((i) => i.detail_done).length,
      });
      await walkDetailPages(page, job, {
        ...blockContext,
        onDetail: (done, failed) => this.state.patch({ details_done: done, details_failed: failed }),
        save,
      }, current.items);

      await browser.close();
      browser = null;

      this.state.patch({ phase: CrawlPhases.UPLOADING });
      const { crawl_run_id } = await api.uploadCrawl(request.scraper_id, {
        complete: true,
        items: current.items.map(toUploadItem),
        stats: {
          listing_pages: current.listing_pages,
          details_failed: current.items.filter((i) => i.detail_error).length,
          captcha_solves: this.state.get().captcha_solves,
        },
      });
      // The server has the crawl now; nothing left to resume.
      checkpointStore.discard(request.scraper_id);
      checkpoint = null;
      this.state.log(`uploaded as crawl ${crawl_run_id}`);

      this.state.patch({ phase: CrawlPhases.SAVING });
      await this.watchServer(crawl_run_id, request.agency_name);
    } catch (error) {
      if (error instanceof StoppedError) {
        save();
        this.state.patch({ phase: CrawlPhases.STOPPED, block: BlockStates.NONE });
        return;
      }
      if (checkpoint && checkpoint.items.length > 0) save();
      this.state.log(`error: ${errorMessage(error)}`);
      this.state.patch({
        phase: CrawlPhases.FAILED,
        block: BlockStates.NONE,
        error: this.friendlyError(error),
      });
      notifyUser("Crawl stopped", `${request.agency_name}: ${this.friendlyError(error)}`);
    } finally {
      await browser?.close();
    }
  }

  private async watchServer(crawlRunId: string, agencyName: string): Promise<void> {
    const deadline = Date.now() + MAX_POLL_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const status = await api.getRun(crawlRunId).catch((error: unknown) => {
        this.state.log(`status check failed: ${errorMessage(error)}`);
        return null;
      });
      if (!status) continue;
      if (status.phase === "DONE" || status.phase === "FAILED") {
        const result = {
          crawl_run_id: status.crawl_run_id,
          total_found: status.total_found,
          total_new_listings: status.total_new_listings,
          total_refreshed_listings: status.total_refreshed_listings,
          total_removed: status.total_removed,
          held_for_review: status.held_for_review,
          held_without_photos: status.held_without_photos,
        };
        if (status.phase === "FAILED") {
          this.state.patch({
            phase: CrawlPhases.FAILED,
            result,
            error:
              "The listings were read, but Property Sync could not finish processing them. Tell a developer (crawl " +
              `${crawlRunId.slice(0, 8)}).`,
          });
          return;
        }
        this.state.patch({ phase: CrawlPhases.DONE, result });
        notifyUser(
          "Crawl finished",
          `${agencyName}: ${status.held_for_review ?? 0} listings are waiting for your review.`,
        );
        return;
      }
    }
    this.state.patch({
      phase: CrawlPhases.DONE,
      error: "Property Sync is still processing this crawl. You can close the app; it finishes on its own.",
    });
  }

  private blockContext(job: DesktopCrawlJob): BlockContext {
    let notified = false;
    return {
      scraperId: job.scraper_id,
      captchaSolverAvailable: job.captcha_solver_available,
      setBlock: (block) => {
        if (block === BlockStates.NONE) notified = false;
        this.state.patch({ block });
      },
      log: (line) => this.state.log(line),
      throwIfStopped: () => {
        if (this.stopRequested) throw new StoppedError();
      },
      onNeedsUser: () => {
        if (notified) return;
        notified = true;
        notifyUser(
          "Your help is needed",
          "The website wants to check you're a person. Complete the check in the Chrome window.",
        );
      },
      onSolved: () => this.state.patch({ captcha_solves: this.state.get().captcha_solves + 1 }),
    };
  }

  private friendlyError(error: unknown): string {
    if (error instanceof ApiError || error instanceof ListingsNotFoundError) return error.message;
    const message = errorMessage(error);
    if (/Target page, context or browser has been closed|browser has disconnected/i.test(message)) {
      return "The Chrome window was closed. Press Continue to pick up where it stopped.";
    }
    if (/net::ERR_INTERNET_DISCONNECTED|net::ERR_NAME_NOT_RESOLVED/i.test(message)) {
      return "The internet connection dropped. Press Continue when it's back.";
    }
    if (/not installed|already in use|still open/i.test(message)) return message;
    return "Something went wrong while reading the website. Press Continue to try again.";
  }
}

function toUploadItem(item: CheckpointItem): CrawlUploadItem {
  return {
    source_url: item.source_url,
    raw: item.raw,
    detail: item.detail ?? null,
    detail_error: item.detail_error ?? null,
    detail_final_url: item.detail_final_url ?? null,
    detail_body_text_length: item.detail_body_text_length ?? null,
  };
}

export const crawlSession = new CrawlSessionManager();
