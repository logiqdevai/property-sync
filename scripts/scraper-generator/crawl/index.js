import fs from 'fs';
import path from 'path';
import { ROOT_DIR, OUTPUT_DIR, NORMALIZATION_CACHE_PATH } from './config.js';
import { uuid, now, contentHash } from './utils.js';
import { runCrawl } from './crawler.js';
import { enrichDetailPages } from './detail.js';
import { normalizeWithAI, buildPropertyRecord } from './normalize.js';
import { detectDuplicates } from './duplicates.js';
import { buildCostReport, emptyUsage } from './cost.js';

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  const versionPath = process.argv[2] ?? path.join(ROOT_DIR, 'output', 'version.json');
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

  const sourceAgencyId = uuid();
  const scraperId = uuid();
  const crawlRunId = uuid();
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

  console.log('[ Phase 1: Crawl ]');
  const { items, steps, success, errorSummary } = await runCrawl(config);
  console.log(`  Extracted ${items.length} raw listings\n`);

  console.log('[ Phase 1b: Detail Page Enrichment ]');
  await enrichDetailPages(items, config.detail_page ?? null);
  console.log();

  console.log('[ Phase 2: SourceProperty ]');
  const seenUrls = new Set();
  const sourceProperties = [];

  for (const item of items) {
    if (seenUrls.has(item.source_url)) continue;
    seenUrls.add(item.source_url);
    const raw = item.raw ?? {};
    const externalId = raw._external_id
      ?? item.source_url.split('/').filter(Boolean).pop()
      ?? null;

    sourceProperties.push({
      id: uuid(),
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

  console.log('[ Phase 3: Normalization (AI) ]');

  let normalizationCache = {};
  if (fs.existsSync(NORMALIZATION_CACHE_PATH)) {
    try {
      normalizationCache = JSON.parse(fs.readFileSync(NORMALIZATION_CACHE_PATH, 'utf8'));
    } catch {
      normalizationCache = {};
    }
  }

  const cacheHits = [];
  const needsAI = [];
  for (const sp of sourceProperties) {
    const cached = normalizationCache[sp.source_url];
    if (cached && cached.content_hash === sp.content_hash) {
      cacheHits.push(sp);
    } else {
      needsAI.push(sp);
    }
  }
  if (sourceProperties.length > 0) {
    console.log(`  ${cacheHits.length} unchanged (cache hit), ${needsAI.length} new/changed (needs AI)`);
  }

  const properties = [];
  const propertySourceLinks = [];
  const propertyHistory = [];

  const rawNormalizedByUrl = new Map();
  let normalizationUsage = emptyUsage();
  try {
    const normalization = await normalizeWithAI(needsAI);
    normalizationUsage = normalization.usage;
    for (let i = 0; i < needsAI.length; i++) {
      if (normalization.results[i]) {
        rawNormalizedByUrl.set(needsAI[i].source_url, normalization.results[i]);
      }
    }
  } catch (err) {
    console.error(`  AI normalization failed: ${err.message}`);
    crawlRun.total_failed += needsAI.length;
  }
  for (const sp of cacheHits) {
    rawNormalizedByUrl.set(sp.source_url, normalizationCache[sp.source_url].normalized);
  }

  for (let i = 0; i < sourceProperties.length; i++) {
    const sp = sourceProperties[i];
    const rawFields = rawNormalizedByUrl.get(sp.source_url);
    if (!rawFields) {
      crawlRun.total_failed++;
      continue;
    }

    const prop = {
      id: uuid(),
      ...buildPropertyRecord(rawFields, sp),
    };

    properties.push(prop);
    normalizationCache[sp.source_url] = {
      content_hash: sp.content_hash,
      normalized: rawFields,
      updated_at: now(),
    };

    propertySourceLinks.push({
      id: uuid(),
      property_id: prop.id,
      source_property_id: sp.id,
      confidence_score: 1.0,
      is_primary_source: true,
      created_at: now(),
      updated_at: now(),
    });

    propertyHistory.push({
      id: uuid(),
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
  fs.writeFileSync(NORMALIZATION_CACHE_PATH, JSON.stringify(normalizationCache, null, 2));

  const costReport = buildCostReport(normalizationUsage, {
    totalProperties: properties.length,
    totalSourceProperties: sourceProperties.length,
    aiNormalizedCount: needsAI.length,
    cacheHitCount: cacheHits.length,
  });
  fs.writeFileSync(path.join(OUTPUT_DIR, 'cost.json'), JSON.stringify(costReport, null, 2));

  console.log(`\n  Properties:          ${properties.length}`);
  console.log(`  PropertySourceLinks: ${propertySourceLinks.length}`);
  console.log(`  PropertyHistory:     ${propertyHistory.length} events`);
  const dups = properties.filter(p => p.duplicate_group_id).length;
  if (dups) console.log(`  Duplicates grouped:  ${dups}`);
  console.log(`  AI normalized:       ${costReport.ai_normalized_count} (${costReport.cache_hit_count} cache hits)`);
  console.log(`  AI cost:             $${costReport.total_cost.toFixed(6)} (${costReport.input_tokens} in / ${costReport.output_tokens} out)`);

  console.log('\n[ Phase 4: Finalize ]');
  const executionTrace = {
    id: uuid(),
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
  console.log('    output/crawl/cost.json');
  console.log('    output/normalization_cache.json');

  if (!success) process.exit(1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
