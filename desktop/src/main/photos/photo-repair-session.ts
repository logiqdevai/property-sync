import { readFile } from "fs/promises";
import type { Page } from "playwright-core";
import {
  BlockStates,
  ESTATEWEB_PROPERTY_URL,
  IpcChannels,
  PhotoPhases,
  StillMissingReasons,
  type PhotoState,
  type StartPhotosRequest,
  type StillMissingListing,
  type StillMissingReason,
} from "@shared/ipc";
import { api, ApiError } from "../api/api-client";
import type { PhotoCheckResult } from "../api/api.interfaces";
import { clearBlock, type BlockContext } from "../browser/block-handling";
import { openCrawlerPage, type CrawlerPage } from "../browser/browser-launcher";
import { notifyUser } from "../utils/attention";
import { errorMessage, sleep, StoppedError } from "../utils/async.utils";
import { StateChannel } from "../utils/state-channel";

const CHECK_BATCH = 25;
/** Upload in several requests when a listing has many large photos (the API caps request size). */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 60;

const initialState = (): PhotoState => ({
  agency_id: null,
  agency_name: null,
  phase: PhotoPhases.IDLE,
  block: BlockStates.NONE,
  total: 0,
  checked: 0,
  missing: 0,
  fixed: 0,
  still_missing: [],
  check_errors: 0,
  error: null,
  log: [],
});

/**
 * The mcp-crawl skill's photo gate (§9): reads every pushed listing of the agency live from the
 * CRM, and for the ones with no photos, downloads the photos through the visible browser (the
 * agency's site blocks the server's own download) and uploads them through the API. Only listings
 * with zero photos in the CRM are touched, so photos are never duplicated.
 */
class PhotoRepairSessionManager {
  private readonly state = new StateChannel<PhotoState>(IpcChannels.PHOTOS_STATE, initialState);
  private running = false;
  private stopRequested = false;

  getState(): PhotoState {
    return this.state.get();
  }

  isRunning(): boolean {
    return this.running;
  }

  start(request: StartPhotosRequest): void {
    if (this.running) throw new Error("Photos are already being checked.");
    this.running = true;
    this.stopRequested = false;
    this.state.reset({
      agency_id: request.agency_id,
      agency_name: request.agency_name,
      phase: PhotoPhases.CHECKING,
    });
    void this.run(request).finally(() => {
      this.running = false;
      this.state.flush();
    });
  }

  stop(): void {
    if (this.running) this.stopRequested = true;
  }

  dismiss(): void {
    if (!this.running) this.state.reset();
  }

  private throwIfStopped(): void {
    if (this.stopRequested) throw new StoppedError();
  }

  private async run(request: StartPhotosRequest): Promise<void> {
    let browser: CrawlerPage | null = null;
    try {
      const targets = await api.getPhotoTargets(request.agency_id);
      this.state.patch({ total: targets.length });
      this.state.log(`${targets.length} listings in the CRM`);

      const missing: PhotoCheckResult[] = [];
      let errors = 0;
      for (let i = 0; i < targets.length; i += CHECK_BATCH) {
        this.throwIfStopped();
        const batch = targets.slice(i, i + CHECK_BATCH).map((t) => t.user_property_id);
        const results = await api.checkPhotos(request.agency_id, batch);
        missing.push(...results.filter((r) => r.missing));
        errors += results.filter((r) => r.error && r.error !== "not pushed yet").length;
        this.state.patch({
          checked: Math.min(i + batch.length, targets.length),
          missing: missing.length,
          check_errors: errors,
        });
      }

      if (missing.length === 0) {
        this.state.patch({ phase: PhotoPhases.DONE });
        return;
      }

      this.state.patch({ phase: PhotoPhases.FIXING });
      browser = await openCrawlerPage();
      const warmed = new Set<string>();
      const stillMissing: StillMissingListing[] = [];
      let fixed = 0;

      for (const listing of missing) {
        this.throwIfStopped();
        const failure = await this.fixListing(browser.page, listing, warmed);
        if (!failure) fixed++;
        else stillMissing.push(toStillMissing(listing, failure));
        this.state.patch({ fixed, still_missing: stillMissing });
      }

      this.state.patch({ phase: PhotoPhases.DONE });
      notifyUser(
        "Photos checked",
        stillMissing.length === 0
          ? `${request.agency_name}: added photos to ${fixed} listings.`
          : `${request.agency_name}: ${stillMissing.length} listings still have no photos.`,
      );
    } catch (error) {
      if (error instanceof StoppedError) {
        this.state.patch({ phase: PhotoPhases.STOPPED, block: BlockStates.NONE });
        return;
      }
      this.state.log(`error: ${errorMessage(error)}`);
      this.state.patch({
        phase: PhotoPhases.FAILED,
        block: BlockStates.NONE,
        error:
          error instanceof ApiError
            ? error.message
            : "Something went wrong while fixing photos. Press Check photos to try again.",
      });
    } finally {
      await browser?.close();
    }
  }

  /**
   * Downloads the listing's photos in the browser, uploads them, then re-checks the CRM.
   * Returns null when the listing has photos in the CRM now, else why it still has none.
   */
  private async fixListing(
    page: Page,
    listing: PhotoCheckResult,
    warmed: Set<string>,
  ): Promise<StillMissingReason | null> {
    if (listing.source_image_urls.length === 0) {
      this.state.log(`${listing.user_property_id}: the website has no photos for this listing`);
      return StillMissingReasons.NO_SOURCE_PHOTOS;
    }

    const photos: Array<{ url: string; bytes: Buffer }> = [];
    for (const url of listing.source_image_urls) {
      this.throwIfStopped();
      const bytes = await this.download(page, url, warmed);
      if (bytes) photos.push({ url, bytes });
    }
    if (photos.length === 0) {
      this.state.log(`${listing.user_property_id}: no photo could be downloaded`);
      return StillMissingReasons.DOWNLOAD_FAILED;
    }

    try {
      for (const chunk of chunkBySize(photos)) {
        await api.uploadPhotos(listing.user_property_id, chunk);
      }
      const [after] = await api.checkPhotos(this.state.get().agency_id!, [listing.user_property_id]);
      const ok = !!after && (after.crm_images ?? 0) > 0;
      this.state.log(`${listing.user_property_id}: ${ok ? `${photos.length} photos added` : "still no photos"}`);
      return ok ? null : StillMissingReasons.UPLOAD_FAILED;
    } catch (error) {
      this.state.log(`${listing.user_property_id}: upload failed: ${errorMessage(error)}`);
      return StillMissingReasons.UPLOAD_FAILED;
    }
  }

  /** Opens the photo in the browser itself (same approach as push-images-via-local-chrome.ts). */
  private async download(page: Page, url: string, warmed: Set<string>): Promise<Buffer | null> {
    try {
      const origin = new URL(url).origin;
      if (!warmed.has(origin)) {
        warmed.add(origin);
        await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => undefined);
        await clearBlock(page, this.blockContext());
        await sleep(2_000);
      }

      const downloadPromise = page.waitForEvent("download", { timeout: 30_000 }).catch(() => null);
      let response = null;
      try {
        response = await page.goto(url, { waitUntil: "commit", timeout: 30_000 });
      } catch (error) {
        if (!/download is starting/i.test(errorMessage(error))) throw error;
      }
      if (response) {
        if (!response.ok()) {
          this.state.log(`HTTP ${response.status()} for ${url}`);
          return null;
        }
        return await response.body();
      }
      const download = await downloadPromise;
      const path = download ? await download.path() : null;
      return path ? await readFile(path) : null;
    } catch (error) {
      if (error instanceof StoppedError) throw error;
      this.state.log(`download failed for ${url}: ${errorMessage(error)}`);
      return null;
    }
  }

  private blockContext(): BlockContext {
    return {
      scraperId: null,
      captchaSolverAvailable: false,
      setBlock: (block) => this.state.patch({ block }),
      log: (line) => this.state.log(line),
      throwIfStopped: () => this.throwIfStopped(),
      onNeedsUser: () =>
        notifyUser(
          "Your help is needed",
          "The website wants to check you're a person. Complete the check in the Chrome window.",
        ),
      onSolved: () => undefined,
    };
  }
}

function toStillMissing(listing: PhotoCheckResult, reason: StillMissingReason): StillMissingListing {
  return {
    user_property_id: listing.user_property_id,
    title: listing.title,
    source_url: listing.source_url,
    crm_url: listing.integration_property_id
      ? `${ESTATEWEB_PROPERTY_URL}/${listing.integration_property_id}`
      : null,
    crm_account_email: listing.crm_account_email,
    reason,
  };
}

function chunkBySize<T extends { bytes: Buffer }>(items: T[]): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const item of items) {
    if (current.length > 0 && (size + item.bytes.length > MAX_UPLOAD_BYTES || current.length >= MAX_FILES_PER_UPLOAD)) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += item.bytes.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export const photoRepairSession = new PhotoRepairSessionManager();
