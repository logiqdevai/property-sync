import type { Locator, Page } from "playwright-core";
import type { DesktopCrawlJob, PaginationConfig } from "../api/api.interfaces";
import { clearBlock, type BlockContext } from "../browser/block-handling";
import { randomBetween, sleep } from "../utils/async.utils";
import type { CheckpointItem } from "./checkpoint-store";

/**
 * Walks the agency's listing (search result) pages per the scraper config, the way the server's
 * CrawlerService does: extract every card on a page with the shared page-side extractor, then
 * follow the configured pagination until it ends or stops yielding new listings.
 */

export class ListingsNotFoundError extends Error {
  constructor() {
    super(
      "No listings were found on the agency's website. The website may have changed; ask a developer to check this agency.",
    );
  }
}

export interface ListingWalkContext extends BlockContext {
  onListingPage(pages: number, listingsFound: number): void;
}

const SELECTOR_TIMEOUT_MS = 20_000;
const GROWTH_TIMEOUT_MS = 15_000;
const POLL_MS = 500;

type ExtractedCard = { source_url: string; raw: Record<string, unknown> };

export async function walkListingPages(
  page: Page,
  job: DesktopCrawlJob,
  ctx: ListingWalkContext,
  collected: Map<string, CheckpointItem>,
): Promise<number> {
  const { config, pacing } = job;
  const pagination = normalizePagination(config.pagination);
  const accumulating = pagination.type === "load_more" || pagination.type === "infinite_scroll";

  await gotoWithRetry(page, config.start_url, pacing.page_timeout_ms);
  await clearBlock(page, ctx);
  await dismissCookieConsent(page);

  if (!(await waitForCards(page, config.listing_selector))) {
    // A wall that appeared late, or a slow page: one more full try before giving up.
    await clearBlock(page, ctx);
    await gotoWithRetry(page, config.start_url, pacing.page_timeout_ms);
    await clearBlock(page, ctx);
    if (!(await waitForCards(page, config.listing_selector))) throw new ListingsNotFoundError();
  }

  let pages = 0;
  while (pages < pacing.max_listing_pages) {
    ctx.throwIfStopped();
    await settleCardCount(page, config.listing_selector);

    const cards = (await page.evaluate(
      `(${job.scripts.listing})(${JSON.stringify({
        listingSelector: config.listing_selector,
        fields: config.fields ?? {},
      })})`,
    )) as ExtractedCard[];

    let added = 0;
    for (const card of cards) {
      if (!collected.has(card.source_url)) added++;
      const existing = collected.get(card.source_url);
      collected.set(card.source_url, { ...existing, source_url: card.source_url, raw: card.raw });
    }
    pages++;
    ctx.onListingPage(pages, collected.size);
    ctx.log(`listing page ${pages}: ${cards.length} cards, ${added} new`);

    // A page that adds nothing new means pagination is looping or past the end.
    if (added === 0 && pages > 1 && !accumulating) break;
    if (pagination.type === "none") break;

    await sleep(randomBetween(pacing.page_delay_min_ms, pacing.page_delay_max_ms));
    const advanced = await advance(page, pagination, config.listing_selector, pages, pacing.page_timeout_ms);
    if (!advanced) break;
    await clearBlock(page, ctx);
    if (!accumulating && !(await waitForCards(page, config.listing_selector))) break;
  }
  return pages;
}

function normalizePagination(p?: PaginationConfig): PaginationConfig & { type: string } {
  return { ...p, type: (p?.type ?? "none").toLowerCase() };
}

async function gotoWithRetry(page: Page, url: string, timeout: number): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });
      return;
    } catch (error) {
      lastError = error;
      await sleep(2_000 * (attempt + 1));
    }
  }
  throw lastError;
}

async function waitForCards(page: Page, selector: string): Promise<boolean> {
  return page
    .waitForSelector(selector, { timeout: SELECTOR_TIMEOUT_MS, state: "attached" })
    .then(() => true)
    .catch(() => false);
}

const countCards = (page: Page, selector: string) =>
  page.locator(selector).count().catch(() => 0);

/** Waits until the number of cards stops changing (lazy grids render in batches). */
async function settleCardCount(page: Page, selector: string): Promise<void> {
  let previous = -1;
  for (let i = 0; i < 10; i++) {
    const current = await countCards(page, selector);
    if (current === previous) return;
    previous = current;
    await sleep(600);
  }
}

async function dismissCookieConsent(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const labels = ["agree", "accept", "accept all", "allow all", "i agree", "ok", "got it", "αποδοχή", "συμφωνώ"];
      for (const button of Array.from(document.querySelectorAll("button"))) {
        const text = (button.textContent ?? "").trim().toLowerCase();
        if (labels.some((label) => text === label || text.startsWith(label))) {
          button.click();
          return;
        }
      }
    })
    .catch(() => undefined);
  await sleep(300);
}

async function advance(
  page: Page,
  pagination: PaginationConfig & { type: string },
  listingSelector: string,
  pagesSoFar: number,
  timeout: number,
): Promise<boolean> {
  switch (pagination.type) {
    case "url_param": {
      const param = pagination.url_param ?? "page";
      const url = new URL(page.url());
      const current = Number.parseInt(url.searchParams.get(param) ?? "", 10);
      url.searchParams.set(param, String((Number.isFinite(current) && current >= 1 ? current : pagesSoFar) + 1));
      await gotoWithRetry(page, url.href, timeout);
      return true;
    }
    case "next_button": {
      const control = pagination.selector
        ? page.locator(pagination.selector).first()
        : await numberedNextPageLink(page);
      if (!control) return false;
      return clickAndWaitForNewPage(page, control, listingSelector, timeout);
    }
    case "load_more": {
      if (!pagination.selector) return false;
      const button = page.locator(pagination.selector).first();
      if (!(await button.isVisible().catch(() => false))) return false;
      const before = await countCards(page, listingSelector);
      const clicked = await button.click({ timeout: 8_000 }).then(() => true).catch(() => false);
      return clicked && (await waitForCardGrowth(page, listingSelector, before));
    }
    case "infinite_scroll": {
      const before = await countCards(page, listingSelector);
      const deadline = Date.now() + GROWTH_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await page.evaluate(() => window.scrollBy(0, Math.max(window.innerHeight * 0.8, 200))).catch(() => undefined);
        await page.locator(listingSelector).last().scrollIntoViewIfNeeded({ timeout: 1_000 }).catch(() => undefined);
        await sleep(POLL_MS * 2);
        if ((await countCards(page, listingSelector)) > before) return true;
      }
      return false;
    }
    default:
      return false;
  }
}

/** Without a configured selector: the numbered pagination link after the active one. */
async function numberedNextPageLink(page: Page): Promise<Locator | null> {
  const active = await page
    .evaluate(() => {
      const el = document.querySelector(".page-item.active .page-link, .pagination .active a, .page-item.active a");
      return el ? parseInt(el.textContent?.trim() ?? "", 10) : 1;
    })
    .catch(() => Number.NaN);
  if (Number.isNaN(active)) return null;
  const link = page
    .locator(".page-item .page-link, .pagination a")
    .filter({ hasText: new RegExp(`^${active + 1}$`) })
    .first();
  return (await link.count().catch(() => 0)) ? link : null;
}

async function clickAndWaitForNewPage(
  page: Page,
  control: Locator,
  listingSelector: string,
  timeout: number,
): Promise<boolean> {
  if (!(await control.count().catch(() => 0))) return false;
  const visible = await control.isVisible().catch(() => false);
  const disabled = await control.isDisabled().catch(() => false);
  if (!visible || disabled) return false;

  const urlBefore = page.url();
  const fingerprintBefore = await fingerprint(page, listingSelector);
  const clicked = await control.click({ timeout: 8_000 }).then(() => true).catch(() => false);
  if (!clicked) return false;
  await page.waitForLoadState("domcontentloaded", { timeout }).catch(() => undefined);

  const deadline = Date.now() + GROWTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (page.url() !== urlBefore) return true;
    const now = await fingerprint(page, listingSelector);
    if (now && now !== fingerprintBefore) return true;
    await sleep(POLL_MS);
  }
  return false;
}

/** First and last card's text + link: changes when a new page of results is shown. */
function fingerprint(page: Page, selector: string): Promise<string | null> {
  return page
    .evaluate((sel) => {
      const cards = Array.from(document.querySelectorAll(sel));
      if (cards.length === 0) return null;
      const describe = (el: Element) =>
        `${(el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120)}|${el.querySelector("a")?.getAttribute("href") ?? ""}`;
      return `${cards.length}:${describe(cards[0])}:${describe(cards[cards.length - 1])}`;
    }, selector)
    .catch(() => null);
}

async function waitForCardGrowth(page: Page, selector: string, before: number): Promise<boolean> {
  const deadline = Date.now() + GROWTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    if ((await countCards(page, selector)) > before) return true;
  }
  return false;
}
