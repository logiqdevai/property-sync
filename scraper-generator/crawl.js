/**
 * Scraper Executor — Production Crawl Pipeline (MVP)
 *
 * Mirrors the production flow from:
 *   Feature 05 (crawl-playwright-pipeline)  → CrawlRun + SourceProperty + ScraperExecutionTrace
 *   Feature 06 (properties-normalization)   → Property + PropertySourceLink + PropertyHistory
 *
 * Normalization uses Claude (haiku) — not regex — so it handles any language,
 * format variation, or site-specific quirk automatically.
 *
 * Usage:
 *   node crawl.js                    # reads output/version.json
 *   node crawl.js path/to/version.json
 *
 * Outputs (all in output/crawl/):
 *   crawl_run.json              → CrawlRun
 *   execution_trace.json        → ScraperExecutionTrace
 *   source_properties.json      → SourceProperty[]
 *   properties.json             → Property[]
 *   property_source_links.json  → PropertySourceLink[]
 *   property_history.json       → PropertyHistory[]
 */

import Anthropic from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// --- Constants ---
const MAX_PAGES = 50;
const PAGE_TIMEOUT_MS = 30_000;
const SELECTOR_TIMEOUT_MS = 15_000;
const SCROLL_PAUSE_MS = 1_500;
const NORMALIZATION_BATCH_SIZE = 10;
const OUTPUT_DIR = path.join(__dirname, 'output', 'crawl');

// --- Enum values passed verbatim to the AI ---
const LISTING_TYPES = ['SALE', 'RENT', 'SHORT_TERM_RENT', 'UNKNOWN'];
const PROPERTY_TYPES = ['APARTMENT', 'HOUSE', 'VILLA', 'MAISONETTE', 'STUDIO', 'LAND', 'COMMERCIAL', 'OFFICE', 'WAREHOUSE', 'PARKING', 'OTHER', 'UNKNOWN'];
const PROPERTY_STATUSES = ['ACTIVE', 'INACTIVE', 'REMOVED', 'SOLD', 'RENTED', 'UNKNOWN'];

// --- Anthropic client ---
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- Browser helpers ---
// CloudFront and similar CDNs block the default headless Playwright fingerprint.
// This helper launches with args that remove automation indicators.
const STEALTH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function launchBrowser() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });
  return browser;
}

async function newStealthPage(browser) {
  const ctx = await browser.newContext({
    userAgent: STEALTH_UA,
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    },
  });
  // Remove the webdriver flag that sites check via JS
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  return ctx.newPage();
}

// --- Helpers ---
function uid() {
  return crypto.randomBytes(6).toString('hex');
}

function now() {
  return new Date().toISOString();
}

function contentHash(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
}

// --- Scraper config field extraction ---
function normalizeFieldDef(def) {
  if (typeof def === 'string') return { selector: def, type: 'text' };
  return { selector: def.selector ?? def, type: def.type ?? 'text' };
}

async function extractField(element, def) {
  const { selector, type } = normalizeFieldDef(def);
  const FIELD_TIMEOUT = 2000;
  try {
    const el = selector ? element.locator(selector).first() : element;
    if (type === 'href') return await el.getAttribute('href', { timeout: FIELD_TIMEOUT }) ?? null;
    if (type === 'src') return await el.getAttribute('src', { timeout: FIELD_TIMEOUT }) ?? null;
    if (type === 'background_image') {
      const style = await el.getAttribute('style', { timeout: FIELD_TIMEOUT }) ?? '';
      const m = style.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
      return m ? m[1] : null;
    }
    return (await el.textContent({ timeout: FIELD_TIMEOUT }))?.trim() || null;
  } catch {
    return null;
  }
}

// --- Debug helpers ---
async function dumpDebugInfo(page, selector) {
  const debugDir = path.join(OUTPUT_DIR, 'debug');
  fs.mkdirSync(debugDir, { recursive: true });

  await page.screenshot({ path: path.join(debugDir, 'page.png'), fullPage: true });

  const outline = await page.evaluate(() => {
    function describeEl(el, depth) {
      if (depth > 4) return '';
      const tag = el.tagName.toLowerCase();
      const cls = el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
      const id = el.id ? `#${el.id}` : '';
      const children = Array.from(el.children).map(c => describeEl(c, depth + 1)).filter(Boolean);
      return `${'  '.repeat(depth)}<${tag}${id}${cls}>${children.length ? '\n' + children.join('\n') + '\n' + '  '.repeat(depth) : ''}</${tag}>`;
    }
    return describeEl(document.body, 0).slice(0, 20000);
  });
  fs.writeFileSync(path.join(debugDir, 'outline.txt'), outline);

  const candidates = await page.evaluate(() => {
    const counts = {};
    document.querySelectorAll('*').forEach(el => {
      const cls = el.className && typeof el.className === 'string'
        ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      if (!cls) return;
      const key = `.${cls}`;
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return Object.entries(counts)
      .filter(([, c]) => c >= 3 && c <= 100)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([sel, count]) => ({ selector: sel, count }));
  });

  const report = { url: page.url(), failed_selector: selector, candidate_selectors: candidates };
  fs.writeFileSync(path.join(debugDir, 'selector_candidates.json'), JSON.stringify(report, null, 2));

  console.log('\n  [DEBUG] Selector failed → output/crawl/debug/');
  candidates.slice(0, 10).forEach(c => console.log(`    ${String(c.count).padStart(3)}x  ${c.selector}`));
}

// --- AI normalization (replaces all regex/heuristic helpers) ---
// Sends raw SourceProperty data to Claude with the exact DB enum values.
// Returns Property-shaped objects ready to be written to JSON.
async function normalizeBatch(sourceProperties) {
  // Images are copied directly in buildPropertyRecord — don't send them to the AI
  // to avoid blowing the output token budget with hundreds of URLs.
  const input = sourceProperties.map((sp, i) => ({
    index: i,
    source_url: sp.source_url,
    external_id: sp.external_id,
    raw_title: sp.raw_title,
    raw_price: sp.raw_price,
    raw_location: sp.raw_location,
    raw_description: sp.raw_description
      ? sp.raw_description.split('').filter(c => { const code = c.charCodeAt(0); return code >= 32 && code !== 127; }).join('').slice(0, 1200)
      : null,
  }));

  const prompt = `You are normalizing raw property listings scraped from a Greek real estate website into a structured database schema.

Return a JSON array with one object per input listing (same order, same length).

## Accepted enum values — use ONLY these exact strings:

listing_type: ${LISTING_TYPES.join(' | ')}
property_type: ${PROPERTY_TYPES.join(' | ')}
status: ${PROPERTY_STATUSES.join(' | ')} (use ACTIVE for all fresh listings)

## Output schema per property (every field required, use null if unknown):

{
  "index": <same as input index>,
  "title": string (clean title: property type + size, no agency codes or extra whitespace),
  "description": string | null (1-3 sentence property description extracted from raw_description),
  "listing_type": ListingType,
  "property_type": PropertyType,
  "status": PropertyStatus,
  "price": number | null (numeric value only, no symbols — "100.000€" → 100000, "450 €/μήνα" → 450),
  "currency": "EUR",
  "city": string | null,
  "district": string | null,
  "address": string | null,
  "country": "GR",
  "square_meters": number | null,
  "bedrooms": number | null,
  "bathrooms": number | null,
  "floor": string | null,
  "construction_year": number | null,
  "features": string[] | null (notable attributes like "sea view", "parking", "garden"),
  "images": null
}

## Notes:
- The site is Greek. Infer listing_type from labels like "ΠΩΛΕΙΤΑΙ" (SALE), "ΕΝΟΙΚΙΑΖΕΤΑΙ" (RENT), "Αγγελία Προς Πώληση" (SALE), "Αγγελία Ενοικίασης" (RENT)
- raw_location may contain "Κωδικός <code>  <city>" — extract just the city name. raw_description has Υποπεριοχή (sub-region=city) and Γειτονιά (neighborhood=district) for more precise location
- Prices use Greek thousand separators: "100.000" = 100000, not 100
- description: extract a clean 1-3 sentence property description from raw_description text (strip navigation/label noise)
- city/district: prefer values from raw_description (Υποπεριοχή/Γειτονιά) over raw_location when available
- Always return images as null — images are populated separately by the pipeline
- Return ONLY the JSON array, no prose

## Input listings:
${JSON.stringify(input, null, 2)}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text ?? '';

  // Extract JSON array — try full array first, then recover with individual objects
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (!arrayMatch) throw new Error(`AI returned no JSON array. Response: ${text.slice(0, 300)}`);

  try {
    return JSON.parse(arrayMatch[0]);
  } catch {
    // JSON parse failed — try extracting individual objects and reconstruct the array
    const objectMatches = arrayMatch[0].match(/\{[\s\S]*?\}(?=\s*[,\]])/g);
    if (!objectMatches) throw new Error('Could not parse AI response as JSON');
    return objectMatches.map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
  }
}

function buildPropertyRecord(n, sp) {
  const now_ = now();
  const allImages = sp.raw_data?.all_images ?? [];
  return {
    title: n.title ?? sp.raw_title ?? sp.source_url,
    description: n.description ?? null,
    listing_type: n.listing_type ?? 'UNKNOWN',
    property_type: n.property_type ?? 'UNKNOWN',
    status: n.status ?? 'ACTIVE',
    price: n.price ?? null,
    currency: n.currency ?? 'EUR',
    city: n.city ?? null,
    district: n.district ?? null,
    address: n.address ?? null,
    postal_code: null,
    country: n.country ?? 'GR',
    latitude: null,
    longitude: null,
    square_meters: n.square_meters ?? null,
    bedrooms: n.bedrooms ?? null,
    bathrooms: n.bathrooms ?? null,
    floor: n.floor ?? null,
    construction_year: n.construction_year ?? null,
    renovation_year: null,
    features: n.features ?? null,
    images: allImages.length > 0 ? allImages : null,
    normalized_data: sp.raw_data,
    duplicate_group_id: null,
    created_at: now_,
    updated_at: now_,
  };
}

async function normalizeWithAI(sourceProperties) {
  const results = new Array(sourceProperties.length);
  let failedCount = 0;

  for (let i = 0; i < sourceProperties.length; i += NORMALIZATION_BATCH_SIZE) {
    const batch = sourceProperties.slice(i, i + NORMALIZATION_BATCH_SIZE);
    const end = Math.min(i + batch.length, sourceProperties.length);
    process.stdout.write(`  Normalizing ${i + 1}–${end} of ${sourceProperties.length}...`);

    let normalized = null;
    try {
      normalized = await normalizeBatch(batch);
    } catch (batchErr) {
      process.stdout.write(` batch failed (${batchErr.message.slice(0, 80)}), retrying individually...\n`);
      // Retry each item in the failed batch individually
      for (let j = 0; j < batch.length; j++) {
        const sp = batch[j];
        try {
          const [singleResult] = await normalizeBatch([sp]);
          results[i + j] = buildPropertyRecord(singleResult, sp);
          process.stdout.write(`    [${i + j + 1}] ok\n`);
        } catch (singleErr) {
          failedCount++;
          console.error(`    [${i + j + 1}] FAILED (${sp.source_url}): ${singleErr.message.slice(0, 120)}`);
        }
      }
      continue;
    }

    for (const n of normalized) {
      if (n == null || n.index == null) continue;
      const sp = sourceProperties[i + n.index];
      if (!sp) continue;
      results[i + n.index] = buildPropertyRecord(n, sp);
    }
    process.stdout.write(' done\n');
  }

  if (failedCount > 0) {
    console.log(`  Warning: ${failedCount} properties failed normalization and will be skipped`);
  }
  return results;
}

// --- Detail page enrichment ---
// Visits each property's detail page to collect full images, description,
// and structured attributes not available on the listing page.
// Runs with limited concurrency to avoid overloading the server.
const DETAIL_CONCURRENCY = 3;
const DETAIL_DELAY_MS = 500;

async function enrichOneDetailPage(browser, item, detailConfig) {
  const page = await newStealthPage(browser);
  try {
    await page.goto(item.source_url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(1000);

    return await page.evaluate((cfg) => {
      const images = [];

      if (cfg && cfg.image_selector) {
        // Use generated config selector
        const type = cfg.image_type ?? 'src';
        document.querySelectorAll(cfg.image_selector).forEach(el => {
          if (type === 'background_image') {
            const m = (el.getAttribute('style') || '').match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
            if (m && m[1]) images.push(m[1]);
          } else {
            if (el.src) images.push(el.src);
          }
        });
      } else {
        // Generic fallback: collect all background-image + img src values (skip SVGs / icons)
        document.querySelectorAll('[style]').forEach(el => {
          const m = (el.getAttribute('style') || '').match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
          if (m && m[1] && !m[1].endsWith('.svg')) images.push(m[1]);
        });
        document.querySelectorAll('img').forEach(el => {
          if (el.src && !el.src.endsWith('.svg') && !el.src.includes('logo') && !el.src.includes('icon')) {
            images.push(el.src);
          }
        });
      }

      let descText = null;
      if (cfg && cfg.description_selector) {
        const el = document.querySelector(cfg.description_selector);
        descText = el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
      } else {
        // Generic fallback: try common description class patterns
        const patterns = [
          '.description', '[class*="description"]', '.property-description',
          '[class*="detail-info"]', '.property-details', '[class*="property-text"]',
        ];
        for (const sel of patterns) {
          const el = document.querySelector(sel);
          if (el) { descText = el.innerText.replace(/\s+/g, ' ').trim(); break; }
        }
      }

      let externalId = null;
      if (cfg && cfg.external_id_source === 'selector' && cfg.external_id_selector) {
        const el = document.querySelector(cfg.external_id_selector);
        externalId = el ? el.textContent.trim() : null;
      }

      return {
        images: [...new Set(images)],
        raw_detail_text: descText,
        external_id: externalId,
      };
    }, detailConfig ?? null);
  } catch (err) {
    return { images: [], raw_detail_text: null, external_id: null, error: err.message };
  } finally {
    await page.close();
  }
}

async function enrichDetailPages(items, detailConfig) {
  console.log(`  Enriching ${items.length} detail pages (concurrency: ${DETAIL_CONCURRENCY})...`);
  const browser = await launchBrowser();

  try {
    let done = 0;
    for (let i = 0; i < items.length; i += DETAIL_CONCURRENCY) {
      const batch = items.slice(i, i + DETAIL_CONCURRENCY);
      const results = await Promise.all(batch.map(item => enrichOneDetailPage(browser, item, detailConfig)));

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const detail = results[j];
        const listingImages = item.raw._all_images ?? [];
        const allImages = [...new Set([...detail.images, ...listingImages])];
        item.raw._all_images = allImages;
        item.raw._detail_text = detail.raw_detail_text;
        if (detail.external_id) item.raw._external_id = detail.external_id;
        done++;
        process.stdout.write(`\r  ${done}/${items.length} detail pages enriched...`);
      }

      if (i + DETAIL_CONCURRENCY < items.length) {
        await new Promise(r => setTimeout(r, DETAIL_DELAY_MS));
      }
    }
    process.stdout.write('\n');
  } finally {
    await browser.close();
  }
}

// Duplicate detection: same title + city + price within ±1%
function detectDuplicates(properties) {
  for (let i = 0; i < properties.length; i++) {
    for (let j = i + 1; j < properties.length; j++) {
      const a = properties[i];
      const b = properties[j];
      if (!a.title || !b.title) continue;
      const sameTitle = a.title.toLowerCase().trim() === b.title.toLowerCase().trim();
      const sameCity = a.city && b.city && a.city.toLowerCase() === b.city.toLowerCase();
      const priceClose = a.price && b.price && Math.abs(a.price - b.price) / Math.max(a.price, b.price) <= 0.01;
      if (sameTitle && sameCity && priceClose) {
        const groupId = a.duplicate_group_id ?? b.duplicate_group_id ?? `dup_${uid()}`;
        a.duplicate_group_id = groupId;
        b.duplicate_group_id = groupId;
      }
    }
  }
}

// --- Main crawl function (mirrors CrawlerService.runCrawl) ---
async function runCrawl(config) {
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

        // Collect ALL images from the card (background-image CSS + <img> src)
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
        // JS-driven pagination: clicking the "Next" button can misbehave.
        // Instead, read the currently active page number from the DOM and click
        // the numbered link directly ("2", "3", etc.) — reliable regardless of
        // the site's JS implementation.
        const activePage = await page.evaluate(() => {
          const el = document.querySelector('.page-item.active .page-link, .pagination .active a, .page-item.active a');
          return el ? parseInt(el.textContent.trim(), 10) : 1;
        });
        const nextPageNum = isNaN(activePage) ? null : activePage + 1;

        if (!nextPageNum) { log('pagination_end', { reason: 'cannot_detect_active_page' }); break; }

        // Find a page-link whose text is exactly the next page number
        const nextPageLink = page.locator('.page-item .page-link, .pagination a').filter({ hasText: new RegExp(`^${nextPageNum}$`) }).first();
        const exists = await nextPageLink.count().catch(() => 0);
        if (!exists) { log('pagination_end', { reason: `no_page_link_for_page_${nextPageNum}` }); break; }

        const urlBefore = page.url();
        await nextPageLink.click({ timeout: 8000 });
        await page.waitForLoadState('domcontentloaded', { timeout: PAGE_TIMEOUT_MS }).catch(() => {});
        await page.waitForTimeout(2000);

        // Some sites update the URL; others stay on same URL but update content.
        // We already handle the "same URL, same item count" case at the top of the loop.
        log('clicked_page', { page: nextPageNum, url: page.url() });
        advanced = true;
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

// --- Main ---
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  const versionPath = process.argv[2] ?? path.join(__dirname, 'output', 'version.json');
  if (!fs.existsSync(versionPath)) {
    console.error(`ERROR: version file not found: ${versionPath}`);
    console.error('Run "npm run generate" first to produce output/version.json');
    process.exit(1);
  }

  const versionFile = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
  const config = versionFile.config ?? versionFile;

  if (!config.start_url || !config.listing_selector) {
    console.error('ERROR: version.json missing required fields: start_url, listing_selector');
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const sourceAgencyId = `agency_${uid()}`;
  const scraperId = `scraper_${uid()}`;
  const crawlRunId = `crawlrun_${uid()}`;
  const startedAt = now();

  const crawlRun = {
    id: crawlRunId,
    source_agency_id: sourceAgencyId,
    scraper_id: scraperId,
    status: 'RUNNING',
    started_at: startedAt,
    finished_at: null,
    total_found: 0,
    total_created: 0,
    total_updated: 0,
    total_removed: 0,
    total_failed: 0,
    error_message: null,
    metadata: { version_file: versionPath, config },
    created_at: startedAt,
    updated_at: startedAt,
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'crawl_run.json'), JSON.stringify(crawlRun, null, 2));

  console.log('\n=== Scraper Executor ===');
  console.log(`  CrawlRun:   ${crawlRunId}`);
  console.log(`  Start URL:  ${config.start_url}`);
  console.log(`  Selector:   ${config.listing_selector}`);
  console.log(`  Pagination: ${config.pagination?.type ?? 'none'}`);
  console.log(`  Output:     ${OUTPUT_DIR}\n`);

  // Phase 1: Crawl
  console.log('[ Phase 1: Crawl ]');
  const { items, steps, success, errorSummary } = await runCrawl(config);
  console.log(`  Extracted ${items.length} raw listings\n`);

  // Phase 1b: Enrich from detail pages
  console.log('[ Phase 1b: Detail Page Enrichment ]');
  await enrichDetailPages(items, config.detail_page ?? null);
  console.log();

  // Phase 2: SourceProperty
  console.log('[ Phase 2: SourceProperty ]');
  const seenUrls = new Set();
  const sourceProperties = [];

  for (const item of items) {
    if (seenUrls.has(item.source_url)) continue;
    seenUrls.add(item.source_url);
    const raw = item.raw ?? {};
    // external_id: prefer what was extracted from the detail page DOM (selector source),
    // otherwise fall back to the last path segment of the detail URL (url_path source).
    const externalId = raw._external_id
      ?? item.source_url.split('/').filter(Boolean).pop()
      ?? null;

    sourceProperties.push({
      id: `sp_${uid()}`,
      source_agency_id: sourceAgencyId,
      external_id: externalId,
      source_url: item.source_url,
      canonical_url: null,
      raw_title: raw.title ?? null,
      raw_description: raw._detail_text ?? null,
      raw_price: raw.price ?? null,
      raw_location: raw.location ?? null,
      raw_data: { ...raw, all_images: raw._all_images ?? [], detail_text: raw._detail_text ?? null },
      raw_html_path: null,
      content_hash: contentHash({ url: item.source_url, title: raw.title, price: raw.price }),
      first_seen_at: startedAt,
      last_seen_at: now(),
      status: 'ACTIVE',
      created_at: startedAt,
      updated_at: now(),
    });
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'source_properties.json'), JSON.stringify(sourceProperties, null, 2));
  console.log(`  Written ${sourceProperties.length} SourceProperty records\n`);

  // Phase 3: AI Normalization
  console.log('[ Phase 3: Normalization (AI) ]');
  const properties = [];
  const propertySourceLinks = [];
  const propertyHistory = [];

  let normalizedFields;
  try {
    normalizedFields = await normalizeWithAI(sourceProperties);
  } catch (err) {
    console.error(`  AI normalization failed: ${err.message}`);
    crawlRun.total_failed = sourceProperties.length;
    normalizedFields = [];
  }

  for (let i = 0; i < sourceProperties.length; i++) {
    const sp = sourceProperties[i];
    const fields = normalizedFields[i];
    if (!fields) {
      crawlRun.total_failed++;
      continue;
    }

    const prop = {
      id: `prop_${uid()}`,
      ...fields,
    };

    properties.push(prop);

    propertySourceLinks.push({
      id: `psl_${uid()}`,
      property_id: prop.id,
      source_property_id: sp.id,
      confidence_score: 1.0,
      is_primary_source: true,
      created_at: now(),
      updated_at: now(),
    });

    propertyHistory.push({
      id: `ph_${uid()}`,
      property_id: prop.id,
      event_type: 'CREATED',
      field: null,
      old_value: null,
      new_value: null,
      crawl_run_id: crawlRunId,
      created_at: now(),
    });
  }

  detectDuplicates(properties);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'properties.json'), JSON.stringify(properties, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'property_source_links.json'), JSON.stringify(propertySourceLinks, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'property_history.json'), JSON.stringify(propertyHistory, null, 2));

  console.log(`\n  Properties:          ${properties.length}`);
  console.log(`  PropertySourceLinks: ${propertySourceLinks.length}`);
  console.log(`  PropertyHistory:     ${propertyHistory.length} events`);
  const dups = properties.filter(p => p.duplicate_group_id).length;
  if (dups) console.log(`  Duplicates grouped:  ${dups}`);

  // Phase 4: Finalize
  console.log('\n[ Phase 4: Finalize ]');
  const executionTrace = {
    id: `trace_${uid()}`,
    scraper_id: scraperId,
    crawl_run_id: crawlRunId,
    steps,
    success,
    error_summary: errorSummary ?? null,
    created_at: now(),
    updated_at: now(),
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'execution_trace.json'), JSON.stringify(executionTrace, null, 2));

  crawlRun.status = success ? 'SUCCESS' : 'FAILED';
  crawlRun.finished_at = now();
  crawlRun.total_found = items.length;
  crawlRun.total_created = properties.length;
  crawlRun.error_message = errorSummary ?? null;
  crawlRun.updated_at = now();
  fs.writeFileSync(path.join(OUTPUT_DIR, 'crawl_run.json'), JSON.stringify(crawlRun, null, 2));

  console.log('\n=== Done ===');
  console.log(`  Status:      ${crawlRun.status}`);
  console.log(`  Total found: ${crawlRun.total_found}`);
  if (errorSummary) console.log(`  Error:       ${errorSummary}`);
  console.log('\n  Output files:');
  console.log('    output/crawl/crawl_run.json');
  console.log('    output/crawl/execution_trace.json');
  console.log('    output/crawl/source_properties.json');
  console.log('    output/crawl/properties.json');
  console.log('    output/crawl/property_source_links.json');
  console.log('    output/crawl/property_history.json');

  if (!success) process.exit(1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
