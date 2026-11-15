import {
  BlockStates,
  CrawlPhases,
  IpcChannels,
  type CrawlState,
  type CrawlStates,
  type StartCrawlRequest,
} from "@shared/ipc";
import { api, ApiError } from "../api/api-client";
import type { CrawlUploadItem, DesktopCrawlJob } from "../api/api.interfaces";
import type { BlockContext } from "../browser/block-handling";
import { openCrawlerPage, type CrawlerPage } from "../browser/browser-launcher";
import { notifyUser } from "../utils/attention";
import { errorMessage, sleep, StoppedError } from "../utils/async.utils";
import { KeyedStateChannel } from "../utils/keyed-state-channel";
import { checkpointStore, type CheckpointItem, type CrawlCheckpoint } from "./checkpoint-store";
import { walkDetailPages } from "./detail-walk";
import { ListingsNotFoundError, walkListingPages } from "./listing-walk";

const POLL_INTERVAL_MS = 5_000;
/** After this long the app stops watching; the server keeps going on its own. */
const MAX_POLL_MS = 2 * 60 * 60 * 1000;

const ACTIVE_PHASES: CrawlState["phase"][] = [
  CrawlPhases.PREPARING,
  CrawlPhases.LISTING,
  CrawlPhases.DETAILS,
  CrawlPhases.UPLOADING,
  CrawlPhases.SAVING,
];

const initialState = (request: StartCrawlRequest): CrawlState => ({
  scraper_id: request.scraper_id,
  agency_id: request.agency_id,
  agency_name: request.agency_name,
  phase: CrawlPhases.PREPARING,
  block: BlockStates.NONE,
  listing_pages: 0,
  listings_found: 0,
  details_done: 0,
  details_total: 0,
  details_failed: 0,
  captcha_solves: 0,
  started_at: new Date().toISOString(),
  resumed: false,
  result: null,
  error: null,
  log: [],
});

/**
 * One crawl of one agency, end to end, in its own tab of the shared Chrome window: listing pages
 * and detail pages (saved to disk as it goes, so Stop or a crash can resume), then the upload, then
 * watching the server save and process it. Nothing here touches the CRM; the server holds
 * new/changed listings for review.
 */
class CrawlSession {
  private stopRequested = false;
  private tab: CrawlerPage | null = null;

  constructor(
    private readonly request: StartCrawlRequest,
    private readonly states: KeyedStateChannel<CrawlState>,
  ) {}

  private get key(): string {
    return this.request.scraper_id;
  }

  private patch(patch: Partial<CrawlState>): void {
    this.states.patch(this.key, patch);
  }

  private log(line: string): void {
    this.states.log(this.key, line);
  }

  stop(): void {
    this.stopRequested = true;
    this.log("stopping…");
  }

  async run(): Promise<void> {
    const { request } = this;
    let checkpoint: CrawlCheckpoint | null = null;
    const save = () => checkpoint && checkpointStore.save(checkpoint);

    try {
      const job = await api.getJob(request.scraper_id);
      this.log(`scraper "${job.scraper_name}" loaded`);

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
      this.patch({
        resumed: current.items.length > 0,
        listings_found: current.items.length,
        listing_pages: current.listing_pages,
      });

      this.throwIfStopped();
      this.tab = await openCrawlerPage();
      const page = this.tab.page;
      const blockContext = this.blockContext(job);

      if (!current.listing_walk_finished) {
        this.patch({ phase: CrawlPhases.LISTING });
        const collected = new Map<string, CheckpointItem>(
          current.items.map((item) => [item.source_url, item]),
        );
        current.listing_pages = await walkListingPages(
          page,
          job,
          {
            ...blockContext,
            onListingPage: (pages, found) => this.patch({ listing_pages: pages, listings_found: found }),
          },
          collected,
        );
        current.items = [...collected.values()];
        current.listing_walk_finished = true;
        save();
      }

      this.patch({
        phase: CrawlPhases.DETAILS,
        details_total: current.items.length,
        details_done: current.items.filter((i) => i.detail_done).length,
      });
      await walkDetailPages(
        page,
        job,
        {
          ...blockContext,
          onDetail: (done, failed) => this.patch({ details_done: done, details_failed: failed }),
          save,
        },
        current.items,
      );

      await this.closeTab();

      this.patch({ phase: CrawlPhases.UPLOADING });
      const { crawl_run_id } = await api.uploadCrawl(request.scraper_id, {
        complete: true,
        items: current.items.map(toUploadItem),
        stats: {
          listing_pages: current.listing_pages,
          details_failed: current.items.filter((i) => i.detail_error).length,
          captcha_solves: this.states.get(this.key)?.captcha_solves ?? 0,
        },
      });
      // The server has the crawl now; nothing left to resume.
      checkpointStore.discard(request.scraper_id);
      checkpoint = null;
      this.log(`uploaded as crawl ${crawl_run_id}`);

      this.patch({ phase: CrawlPhases.SAVING });
      await this.watchServer(crawl_run_id);
    } catch (error) {
      if (error instanceof StoppedError) {
        save();
        this.patch({ phase: CrawlPhases.STOPPED, block: BlockStates.NONE });
        return;
      }
      if (checkpoint && checkpoint.items.length > 0) save();
      this.log(`error: ${errorMessage(error)}`);
      const friendly = friendlyError(error);
      this.patch({ phase: CrawlPhases.FAILED, block: BlockStates.NONE, error: friendly });
      notifyUser("Crawl stopped", `${request.agency_name}: ${friendly}`);
    } finally {
      await this.closeTab();
    }
  }

  private async closeTab(): Promise<void> {
    const tab = this.tab;
    this.tab = null;
    await tab?.close();
  }

  private throwIfStopped(): void {
    if (this.stopRequested) throw new StoppedError();
  }

  private async watchServer(crawlRunId: string): Promise<void> {
    const deadline = Date.now() + MAX_POLL_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const status = await api.getRun(crawlRunId).catch((error: unknown) => {
        this.log(`status check failed: ${errorMessage(error)}`);
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
          this.patch({
            phase: CrawlPhases.FAILED,
            result,
            error:
              "The listings were read, but Property Sync could not finish processing them. Tell a developer (crawl " +
              `${crawlRunId.slice(0, 8)}).`,
          });
          return;
        }
        this.patch({ phase: CrawlPhases.DONE, result });
        notifyUser(
          "Crawl finished",
          `${this.request.agency_name}: ${status.held_for_review ?? 0} listings are waiting for your review.`,
        );
        return;
      }
    }
    this.patch({
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
        this.patch({ block });
      },
      log: (line) => this.log(line),
      throwIfStopped: () => this.throwIfStopped(),
      onNeedsUser: () => {
        if (notified) return;
        notified = true;
        // Several agencies share the window: show this agency's tab.
        void this.tab?.page.bringToFront().catch(() => undefined);
        notifyUser(
          "Your help is needed",
          `${this.request.agency_name}: the website wants to check you're a person. Complete the check in its Chrome tab.`,
        );
      },
      onSolved: () =>
        this.patch({ captcha_solves: (this.states.get(this.key)?.captcha_solves ?? 0) + 1 }),
    };
  }
}

function friendlyError(error: unknown): string {
  if (error instanceof ApiError || error instanceof ListingsNotFoundError) return error.message;
  const message = errorMessage(error);
  if (/Target page, context or browser has been closed|browser has disconnected/i.test(message)) {
    return "The Chrome window or tab was closed. Press Continue to pick up where it stopped.";
  }
  if (/net::ERR_INTERNET_DISCONNECTED|net::ERR_NAME_NOT_RESOLVED/i.test(message)) {
    return "The internet connection dropped. Press Continue when it's back.";
  }
  if (/not installed|already in use|still open/i.test(message)) return message;
  return "Something went wrong while reading the website. Press Continue to try again.";
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

/** All crawls of this app session, one per agency; any number can run at once. */
class CrawlSessionManager {
  private readonly states = new KeyedStateChannel<CrawlState>(IpcChannels.CRAWL_STATE);
  private readonly running = new Map<string, CrawlSession>();

  getStates(): CrawlStates {
    return this.states.getAll();
  }

  isRunning(scraperId?: string): boolean {
    return scraperId ? this.running.has(scraperId) : this.running.size > 0;
  }

  start(request: StartCrawlRequest): void {
    if (this.running.has(request.scraper_id)) {
      throw new Error(`${request.agency_name} is already being crawled.`);
    }
    const session = new CrawlSession(request, this.states);
    this.running.set(request.scraper_id, session);
    this.states.set(request.scraper_id, initialState(request));
    void session.run().finally(() => {
      this.running.delete(request.scraper_id);
      this.states.flush();
    });
  }

  stop(scraperId: string): void {
    this.running.get(scraperId)?.stop();
  }

  dismiss(scraperId: string): void {
    const state = this.states.get(scraperId);
    if (!this.running.has(scraperId) && state && !ACTIVE_PHASES.includes(state.phase)) {
      this.states.remove(scraperId);
    }
  }
}

export const crawlSessions = new CrawlSessionManager();
