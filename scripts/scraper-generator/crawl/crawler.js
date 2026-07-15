import fs from 'fs';
import path from 'path';
import {
  MAX_PAGES,
  PAGE_TIMEOUT_MS,
  SELECTOR_TIMEOUT_MS,
  SCROLL_PAUSE_MS,
  OUTPUT_DIR,
} from './config.js';
import { now } from './utils.js';
import { launchBrowser, newStealthPage } from './browser.js';
import { extractField } from './extract.js';
import { dumpDebugInfo } from './debug.js';

export async function runCrawl(config) {
  const steps = [];
  const items = [];
  let success = false;
  let errorSummary = null;

  const browser = await launchBrowser();
  const page = await newStealthPage(browser);

  function log(msg, data = {}) {
    steps.push({ ts: now(), msg, ...data });
    console.log(`  [trace] ${msg}`, Object.keys(data).length ? data : '');
  }

  try {
    log('navigate', { url: config.start_url });
    await page.goto(config.start_url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(2000);

    let pageNum = 0;
    let prevUrl = null;
    let prevItemCount = -1;

    while (pageNum < MAX_PAGES) {
      const currentUrl = page.url();

      if (currentUrl === prevUrl && items.length === prevItemCount) {
        log('pagination_end', { reason: 'no_change_detected' });
        break;
      }
      prevUrl = currentUrl;
      prevItemCount = items.length;

      log(`page_${pageNum}`, { url: currentUrl });

      try {
        await page.waitForSelector(config.listing_selector, { timeout: SELECTOR_TIMEOUT_MS });
      } catch {
        log('selector_timeout', { selector: config.listing_selector, page: pageNum });
        if (pageNum === 0) {
          errorSummary = `listing_selector "${config.listing_selector}" not found on page 0`;
          await dumpDebugInfo(page, config.listing_selector);
        }
        break;
      }

      const cards = await page.locator(config.listing_selector).all();
      log('cards_found', { count: cards.length, page: pageNum });

      if (cards.length === 0 && pageNum === 0) {
        errorSummary = `Zero listings found on page 0 with selector "${config.listing_selector}"`;
        break;
      }

      if (pageNum === 0 && cards.length > 0) {
        const cardHtml = await cards[0].evaluate(el => el.outerHTML);
        const debugDir = path.join(OUTPUT_DIR, 'debug');
        fs.mkdirSync(debugDir, { recursive: true });
        fs.writeFileSync(path.join(debugDir, 'first_card.html'), cardHtml);
      }

      for (let i = 0; i < cards.length; i++) {
        const raw = {};
        for (const [fieldName, fieldDef] of Object.entries(config.fields ?? {})) {
          raw[fieldName] = await extractField(cards[i], fieldDef);
        }

        raw._all_images = await cards[i].evaluate(el => {
          const imgs = [];
          el.querySelectorAll('[style]').forEach(node => {
            const m = (node.getAttribute('style') || '').match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
            if (m && m[1]) imgs.push(m[1]);
          });
          el.querySelectorAll('img').forEach(node => {
            if (node.src) imgs.push(node.src);
          });
          return [...new Set(imgs)];
        });

        let sourceUrl = raw.url ?? raw.href ?? null;
        if (sourceUrl && !sourceUrl.startsWith('http')) {
          try { sourceUrl = new URL(sourceUrl, currentUrl).href; } catch { /* keep as-is */ }
        }
        if (!sourceUrl) sourceUrl = currentUrl;
        items.push({ source_url: sourceUrl, raw });
        process.stdout.write(`\r  [trace] extracted ${items.length} items...`);
      }
      process.stdout.write('\n');

      const pagination = config.pagination;
      if (!pagination || pagination.type === 'none' || pagination.type === 'NONE') break;

      let advanced = false;

      if (pagination.type === 'next_button' || pagination.type === 'NEXT_BUTTON') {
        // Prefer the AI-verified selector for the persistent "next" control. It was
        // confirmed during generation to still resolve after advancing at least once,
        // so it generalizes to sites with many pages (unlike matching page numbers by
        // literal text, which breaks once the current page scrolls out of a windowed
        // pagination widget).
        if (pagination.selector) {
          const nextControl = page.locator(pagination.selector).first();
          const exists = await nextControl.count().catch(() => 0);
          if (!exists) { log('pagination_end', { reason: 'next_selector_not_found' }); break; }
          const visible = await nextControl.isVisible().catch(() => false);
          const disabled = await nextControl.isDisabled().catch(() => false);
          if (!visible || disabled) { log('pagination_end', { reason: 'next_selector_not_clickable' }); break; }

          await nextControl.click({ timeout: 8000 });
          await page.waitForLoadState('domcontentloaded', { timeout: PAGE_TIMEOUT_MS }).catch(() => {});
          await page.waitForTimeout(2000);

          log('clicked_next', { url: page.url() });
          advanced = true;
        } else {
          // Legacy fallback for configs generated before pagination.selector was
          // required: guess a Bootstrap-style numbered pagination widget.
          const activePage = await page.evaluate(() => {
            const el = document.querySelector('.page-item.active .page-link, .pagination .active a, .page-item.active a');
            return el ? parseInt(el.textContent.trim(), 10) : 1;
          });
          const nextPageNum = isNaN(activePage) ? null : activePage + 1;

          if (!nextPageNum) { log('pagination_end', { reason: 'cannot_detect_active_page' }); break; }

          const nextPageLink = page.locator('.page-item .page-link, .pagination a').filter({ hasText: new RegExp(`^${nextPageNum}$`) }).first();
          const exists = await nextPageLink.count().catch(() => 0);
          if (!exists) { log('pagination_end', { reason: `no_page_link_for_page_${nextPageNum}` }); break; }

          await nextPageLink.click({ timeout: 8000 });
          await page.waitForLoadState('domcontentloaded', { timeout: PAGE_TIMEOUT_MS }).catch(() => {});
          await page.waitForTimeout(2000);

          log('clicked_page', { page: nextPageNum, url: page.url() });
          advanced = true;
        }
      } else if (pagination.type === 'load_more' || pagination.type === 'LOAD_MORE') {
        const btn = page.locator(pagination.selector).first();
        const visible = await btn.isVisible().catch(() => false);
        if (!visible) { log('pagination_end', { reason: 'load_more_not_visible' }); break; }
        await btn.click({ timeout: 8000 });
        await page.waitForTimeout(SCROLL_PAUSE_MS);
        advanced = true;
      } else if (pagination.type === 'infinite_scroll' || pagination.type === 'INFINITE_SCROLL') {
        const prevHeight = await page.evaluate(() => document.body.scrollHeight);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(SCROLL_PAUSE_MS);
        const newHeight = await page.evaluate(() => document.body.scrollHeight);
        if (newHeight === prevHeight) { log('pagination_end', { reason: 'scroll_height_unchanged' }); break; }
        advanced = true;
      } else if (pagination.type === 'url_param' || pagination.type === 'URL_PARAM') {
        const paramName = pagination.url_param ?? 'page';
        const url = new URL(page.url());
        url.searchParams.set(paramName, String(pageNum + 2));
        await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
        await page.waitForTimeout(2000);
        advanced = true;
      }

      if (!advanced) break;
      pageNum++;
    }

    success = items.length > 0;
    log('done', { total_items: items.length, pages: pageNum + 1, success });
  } catch (err) {
    errorSummary = err.message;
    log('error', { message: err.message });
  } finally {
    await browser.close();
  }

  return { items, steps, success, errorSummary };
}
