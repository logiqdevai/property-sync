import type { Page } from "playwright-core";
import type { DesktopCrawlJob } from "../api/api.interfaces";
import { clearBlock, isBlocked, type BlockContext } from "../browser/block-handling";
import { errorMessage, randomBetween, sleep, StoppedError, withQueryParams } from "../utils/async.utils";
import type { CheckpointItem } from "./checkpoint-store";

/**
 * Opens every listing's own page and runs the shared detail extractor on it. Only the raw
 * extraction is sent to the server: checking the result (bot wall, redirect away, truncated page)
 * and merging it into the listing happens there, with the same code a scheduled crawl uses.
 */

export interface DetailWalkContext extends BlockContext {
  onDetail(done: number, failed: number): void;
  /** Persist progress (called every few listings). */
  save(): void;
}

const SAVE_EVERY = 10;
const LOAD_WAIT_MS = 8_000;

export async function walkDetailPages(
  page: Page,
  job: DesktopCrawlJob,
  ctx: DetailWalkContext,
  items: CheckpointItem[],
): Promise<void> {
  const detailConfig = job.config.detail_page ?? null;
  const pacing = job.pacing;
  let done = items.filter((i) => i.detail_done).length;
  let failed = items.filter((i) => i.detail_done && i.detail_error).length;
  let consecutiveBlocks = 0;

  for (const item of items) {
    if (item.detail_done) continue;
    ctx.throwIfStopped();

    const result = await readDetailPage(page, job, ctx, item, detailConfig);
    Object.assign(item, result, { detail_done: true });
    done++;
    if (result.detail_error) failed++;
    ctx.onDetail(done, failed);
    if (done % SAVE_EVERY === 0) ctx.save();

    // Back off a little after a wall, so the site doesn't immediately put up another.
    consecutiveBlocks = result.hitWall ? consecutiveBlocks + 1 : 0;
    const [min, max] =
      consecutiveBlocks > 0
        ? [pacing.backoff_delay_min_ms, pacing.backoff_delay_max_ms]
        : [pacing.page_delay_min_ms, pacing.page_delay_max_ms];
    await sleep(randomBetween(min, max));
  }
  ctx.save();
}

async function readDetailPage(
  page: Page,
  job: DesktopCrawlJob,
  ctx: DetailWalkContext,
  item: CheckpointItem,
  detailConfig: unknown,
): Promise<Partial<CheckpointItem> & { hitWall: boolean }> {
  const url = withQueryParams(item.source_url, job.config.detail_page?.url_query);
  let hitWall = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: job.pacing.page_timeout_ms });
      await page.waitForLoadState("load", { timeout: LOAD_WAIT_MS }).catch(() => undefined);

      if (await isBlocked(page)) {
        hitWall = true;
        await clearBlock(page, ctx);
        // After a wall the site usually lands back on the listing; if not, open it again.
        if (attempt === 0 && !samePage(page.url(), url)) continue;
      }

      const detail = (await page.evaluate(
        `(${job.scripts.detail})(${JSON.stringify(detailConfig)})`,
      )) as Record<string, unknown>;

      // Some walls reveal themselves only after a timer; never keep a wall's text as the listing.
      if (await isBlocked(page)) {
        hitWall = true;
        await clearBlock(page, ctx);
        continue;
      }

      const bodyTextLength = (await page
        .evaluate(() => document.body?.innerText.trim().length ?? 0)
        .catch(() => 0)) as number;

      return {
        detail,
        detail_error: null,
        detail_final_url: page.url(),
        detail_body_text_length: bodyTextLength,
        hitWall,
      };
    } catch (error) {
      if (error instanceof StoppedError) throw error;
      if (attempt === 1) {
        ctx.log(`could not read ${item.source_url}: ${errorMessage(error)}`);
        return { detail: null, detail_error: errorMessage(error).slice(0, 500), hitWall };
      }
      await sleep(2_500);
    }
  }
  return { detail: null, detail_error: "access barrier: challenge", hitWall: true };
}

function samePage(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.host === y.host && x.pathname.replace(/\/$/, "") === y.pathname.replace(/\/$/, "");
  } catch {
    return a === b;
  }
}
