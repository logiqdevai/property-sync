/**
 * Scraper Executor — Production Crawl Pipeline (MVP)
 *
 * Mirrors the production flow from:
 *   Feature 05 (crawl-playwright-pipeline)  → CrawlRun + SourceProperty + ScraperExecutionTrace
 *   Feature 06 (properties-normalization)   → Property + PropertySourceLink + PropertyHistory
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

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Constants (mirrors Feature 05 crawler.service.ts configurable limits) ---
const MAX_PAGES = 50;
const PAGE_TIMEOUT_MS = 30_000;
const SELECTOR_TIMEOUT_MS = 15_000;
const SCROLL_PAUSE_MS = 1_500;
const OUTPUT_DIR = path.join(__dirname, 'output', 'crawl');

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

function parsePrice(raw) {
  if (!raw) return null;
  // Strip Greek currency symbols and separators: "350.000 €" / "1.200 €/μήνα" / "€250,000"
  const digits = raw.replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}(?:[,.]|$))/g, '').replace(',', '.');
  const val = parseFloat(digits);
  return isNaN(val) ? null : val;
}

function detectListingType(raw) {
  const text = (raw || '').toLowerCase();
  if (/ενοικ|μίσθωσ|rent|ενοίκιο/.test(text)) return 'RENT';
  if (/πώλησ|αγορ|sale|sell|πωλείται/.test(text)) return 'SALE';
  if (/βραχ|short.?term|airbnb/.test(text)) return 'SHORT_TERM_RENT';
  return 'UNKNOWN';
}

function detectPropertyType(raw) {
  const text = (raw || '').toLowerCase();
  if (/διαμέρισμ|apartment|flat/.test(text)) return 'APARTMENT';
  if (/μεζονέτ|maisonette/.test(text)) return 'MAISONETTE';
  if (/βίλα|villa/.test(text)) return 'VILLA';
  if (/στούντιο|studio/.test(text)) return 'STUDIO';
  if (/μονοκατοικ|house|κατοικ|οικί/.test(text)) return 'HOUSE';
  if (/οικόπεδ|γη|land|αγρ/.test(text)) return 'LAND';
  if (/γραφε|office/.test(text)) return 'OFFICE';
  if (/αποθήκ|warehouse/.test(text)) return 'WAREHOUSE';
  if (/κατάστημ|commercial|επαγγ/.test(text)) return 'COMMERCIAL';
  if (/parking|θέση στάθμ/.test(text)) return 'PARKING';
  return 'UNKNOWN';
}

function detectCity(raw) {
  if (!raw) return null;
  // Common Greek cities
  const cities = ['αθήνα', 'θεσσαλονίκη', 'πάτρα', 'ηράκλειο', 'λάρισα', 'βόλος', 'ιωάννινα', 'χανιά'];
  const lower = raw.toLowerCase();
  for (const city of cities) {
    if (lower.includes(city)) return city.charAt(0).toUpperCase() + city.slice(1);
  }
  // Return first token that looks like a place name
  const parts = raw.split(/[,\-–|]/);
  return parts[0]?.trim() || null;
}

function extractBedrooms(raw) {
  if (!raw) return null;
  const m = raw.match(/(\d+)\s*(?:υπνοδωμάτ|bed|δωμάτ|υδ)/i);
  return m ? parseInt(m[1], 10) : null;
}

function extractSquareMeters(raw) {
  if (!raw) return null;
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:τ\.?μ\.?|m²|sqm)/i);
  if (!m) return null;
  return parseFloat(m[1].replace(',', '.'));
}

// --- Scraper config field extraction ---
// Supports both formats:
//   { selector: "...", type: "text|href|src" }   (generate.js output)
//   "CSS selector string"                          (legacy flat format)
function normalizeFieldDef(def) {
  if (typeof def === 'string') return { selector: def, type: 'text' };
  return { selector: def.selector ?? def, type: def.type ?? 'text' };
}

async function extractField(element, def) {
  const { selector, type } = normalizeFieldDef(def);
  try {
    const el = selector ? await element.locator(selector).first() : element;
    if (type === 'href') return await el.getAttribute('href') ?? null;
    if (type === 'src') return await el.getAttribute('src') ?? null;
    return (await el.textContent())?.trim() || null;
  } catch {
    return null;
  }
}

// --- Main crawl function (mirrors CrawlerService.runCrawl) ---
async function runCrawl(config, crawlRunId) {
  const steps = [];
  const items = [];
  let success = false;
  let errorSummary = null;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  function log(msg, data = {}) {
    const entry = { ts: now(), msg, ...data };
    steps.push(entry);
    console.log(`  [trace] ${msg}`, Object.keys(data).length ? data : '');
  }

  try {
    log('navigate', { url: config.start_url });
    await page.goto(config.start_url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(2000);

    let pageNum = 0;

    while (pageNum < MAX_PAGES) {
      const currentUrl = page.url();
      log(`page_${pageNum}`, { url: currentUrl });

      // Wait for listing cards
      try {
        await page.waitForSelector(config.listing_selector, { timeout: SELECTOR_TIMEOUT_MS });
      } catch {
        log('selector_timeout', { selector: config.listing_selector, page: pageNum });
        if (pageNum === 0) {
          errorSummary = `listing_selector "${config.listing_selector}" not found on page 0`;
        }
        break;
      }

      const cards = await page.locator(config.listing_selector).all();
      log('cards_found', { count: cards.length, page: pageNum });

      if (cards.length === 0 && pageNum === 0) {
        errorSummary = `Zero listings found on page 0 with selector "${config.listing_selector}"`;
        break;
      }

      for (const card of cards) {
        const raw = {};
        for (const [fieldName, fieldDef] of Object.entries(config.fields ?? {})) {
          raw[fieldName] = await extractField(card, fieldDef);
        }

        // Resolve absolute URL for the property detail page
        let sourceUrl = raw.url ?? raw.href ?? null;
        if (sourceUrl && !sourceUrl.startsWith('http')) {
          try { sourceUrl = new URL(sourceUrl, currentUrl).href; } catch { /* keep as-is */ }
        }
        if (!sourceUrl) sourceUrl = currentUrl;

        items.push({ source_url: sourceUrl, raw });
      }

      // Pagination
      const pagination = config.pagination;
      if (!pagination || pagination.type === 'none' || pagination.type === 'NONE') break;

      let advanced = false;

      if (pagination.type === 'next_button' || pagination.type === 'NEXT_BUTTON') {
        const nextBtn = page.locator(pagination.selector).first();
        const visible = await nextBtn.isVisible().catch(() => false);
        if (!visible) { log('pagination_end', { reason: 'next_button_not_visible' }); break; }
        const disabled = await nextBtn.isDisabled().catch(() => false);
        if (disabled) { log('pagination_end', { reason: 'next_button_disabled' }); break; }
        await nextBtn.click({ timeout: 8000 });
        await page.waitForLoadState('domcontentloaded', { timeout: PAGE_TIMEOUT_MS }).catch(() => {});
        await page.waitForTimeout(2000);
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

// --- Normalization (mirrors PropertyNormalizationService) ---
function normalizeSourceProperty(sp, existingProperty) {
  const raw = sp.raw_data ?? {};
  const rawTitle = sp.raw_title ?? raw.title ?? '';
  const rawPrice = sp.raw_price ?? raw.price ?? '';
  const rawLocation = sp.raw_location ?? raw.location ?? '';
  const rawAll = [rawTitle, rawPrice, rawLocation].join(' ');

  const price = parsePrice(rawPrice);
  const listingType = detectListingType(rawAll);
  const propertyType = detectPropertyType(rawTitle);
  const city = detectCity(rawLocation);
  const bedrooms = extractBedrooms(rawTitle);
  const sqm = extractSquareMeters(rawTitle);

  const now_ = now();

  if (!existingProperty) {
    // New Property
    return {
      id: `prop_${uid()}`,
      title: rawTitle || sp.source_url,
      description: null,
      listing_type: listingType,
      property_type: propertyType,
      status: 'ACTIVE',
      price: price,
      currency: 'EUR',
      city: city,
      district: null,
      address: rawLocation || null,
      postal_code: null,
      country: 'GR',
      latitude: null,
      longitude: null,
      square_meters: sqm,
      bedrooms: bedrooms,
      bathrooms: null,
      floor: null,
      construction_year: null,
      renovation_year: null,
      features: null,
      images: raw.image ? [raw.image] : null,
      normalized_data: raw,
      duplicate_group_id: null,
      created_at: now_,
      updated_at: now_,
      _is_new: true,
    };
  }

  // Update existing — compute changes for PropertyHistory
  const changes = [];
  const updated = { ...existingProperty, updated_at: now_ };

  if (price !== null && price !== existingProperty.price) {
    changes.push({ event_type: 'PRICE_CHANGED', field: 'price', old_value: existingProperty.price, new_value: price });
    updated.price = price;
  }

  const newStatus = 'ACTIVE';
  if (existingProperty.status !== newStatus) {
    const eventType = existingProperty.status === 'REMOVED' ? 'REAPPEARED' : 'STATUS_CHANGED';
    changes.push({ event_type: eventType, field: 'status', old_value: existingProperty.status, new_value: newStatus });
    updated.status = newStatus;
  }

  if (rawTitle && rawTitle !== existingProperty.title) {
    changes.push({ event_type: 'UPDATED', field: 'title', old_value: existingProperty.title, new_value: rawTitle });
    updated.title = rawTitle;
  }

  updated._changes = changes;
  updated._is_new = false;
  return updated;
}

// Simple duplicate detection: same title + city + price within ±1%
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

// --- Main ---
async function main() {
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

  // --- CrawlRun record ---
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

  // --- Execute crawl ---
  console.log('[ Phase 1: Crawl ]');
  const { items, steps, success, errorSummary } = await runCrawl(config, crawlRunId);
  console.log(`  Extracted ${items.length} raw listings\n`);

  // --- Build SourceProperty records ---
  console.log('[ Phase 2: SourceProperty ]');
  const seenUrls = new Set();
  const sourceProperties = [];

  for (const item of items) {
    if (seenUrls.has(item.source_url)) continue; // unique constraint: (agency, url)
    seenUrls.add(item.source_url);

    const raw = item.raw ?? {};
    const sp = {
      id: `sp_${uid()}`,
      source_agency_id: sourceAgencyId,
      external_id: null,
      source_url: item.source_url,
      canonical_url: null,
      raw_title: raw.title ?? null,
      raw_description: null,
      raw_price: raw.price ?? null,
      raw_location: raw.location ?? null,
      raw_data: raw,
      raw_html_path: null,
      content_hash: contentHash({ url: item.source_url, title: raw.title, price: raw.price }),
      first_seen_at: startedAt,
      last_seen_at: now(),
      status: 'ACTIVE',
      created_at: startedAt,
      updated_at: now(),
    };
    sourceProperties.push(sp);
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'source_properties.json'), JSON.stringify(sourceProperties, null, 2));
  console.log(`  Written ${sourceProperties.length} SourceProperty records\n`);

  // --- Normalize: SourceProperty → Property + PropertySourceLink + PropertyHistory ---
  console.log('[ Phase 3: Normalization ]');

  const properties = [];
  const propertySourceLinks = [];
  const propertyHistory = [];

  for (const sp of sourceProperties) {
    try {
      const prop = normalizeSourceProperty(sp, null); // all new in MVP (no DB to look up)
      const isNew = prop._is_new;
      const changes = prop._changes ?? [];
      delete prop._is_new;
      delete prop._changes;

      properties.push(prop);

      // PropertySourceLink
      propertySourceLinks.push({
        id: `psl_${uid()}`,
        property_id: prop.id,
        source_property_id: sp.id,
        confidence_score: 1.0,
        is_primary_source: true,
        created_at: now(),
        updated_at: now(),
      });

      // PropertyHistory: CREATED for new, field changes for updates
      if (isNew) {
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
      for (const change of changes) {
        propertyHistory.push({
          id: `ph_${uid()}`,
          property_id: prop.id,
          event_type: change.event_type,
          field: change.field,
          old_value: change.old_value,
          new_value: change.new_value,
          crawl_run_id: crawlRunId,
          created_at: now(),
        });
      }
    } catch (err) {
      console.error(`  Normalization failed for ${sp.source_url}: ${err.message}`);
      crawlRun.total_failed++;
    }
  }

  // Duplicate detection across all normalized properties
  detectDuplicates(properties);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'properties.json'), JSON.stringify(properties, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'property_source_links.json'), JSON.stringify(propertySourceLinks, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'property_history.json'), JSON.stringify(propertyHistory, null, 2));

  console.log(`  Properties:          ${properties.length}`);
  console.log(`  PropertySourceLinks: ${propertySourceLinks.length}`);
  console.log(`  PropertyHistory:     ${propertyHistory.length} events`);
  const dups = properties.filter(p => p.duplicate_group_id).length;
  if (dups) console.log(`  Duplicates grouped:  ${dups}`);

  // --- ScraperExecutionTrace ---
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

  // --- Finalize CrawlRun ---
  crawlRun.status = success ? 'SUCCESS' : 'FAILED';
  crawlRun.finished_at = now();
  crawlRun.total_found = items.length;
  crawlRun.total_created = properties.length - crawlRun.total_failed;
  crawlRun.total_updated = 0;
  crawlRun.total_removed = 0;
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
