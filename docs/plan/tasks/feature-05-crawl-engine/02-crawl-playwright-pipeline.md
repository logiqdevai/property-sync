# Task: Real Playwright crawl pipeline + broken-scraper detection

## Feature group

`docs/plan/PROGRESS.md` → **Feature 05: Crawl Execution Engine & Job Queue**

## Objective

Replace the stub `api/src/background/crawl.processor.ts` from the previous task with a real
Playwright pipeline that reads `Scraper.active_version.config`, visits the
target site, extracts listings into `SourceProperty` rows, records a
`ScraperExecutionTrace`, and detects broken scrapers to trigger self-heal.

## Context — read this before touching anything

**Primary reference implementation:** `scraper-generator/crawl/` — port this
logic into NestJS; the CLI entrypoint `crawl/index.js` shows the full
pipeline order (crawl → detail enrichment → SourceProperty upsert → hand off
to normalization in Feature 06).

| Reference file | Production target |
| --- | --- |
| `scraper-generator/crawl/crawler.js` | `CrawlerService.runCrawl()` |
| `scraper-generator/crawl/extract.js` | `FieldExtractionService` (or inline in crawler) |
| `scraper-generator/crawl/detail.js` | `DetailEnrichmentService.enrichDetailPages()` |
| `scraper-generator/crawl/browser.js` | `StealthBrowserService` (shared launch + stealth page) |
| `scraper-generator/crawl/debug.js` | `CrawlerDebugService.dumpDebugInfo()` on selector failure |
| `scraper-generator/crawl/config.js` | constants (`MAX_PAGES`, timeouts, concurrency) |
| `scraper-generator/crawl/index.js` | orchestration order in `crawl.processor.ts` |

Also read `docs/scraping-generation-computer-use-architecture.md` sections 4, 10,
11. Config shape (from `ScraperVersion.config`, produced by Feature 04's
generation loop or a manual admin edit in Feature 03):

```json
{
  "start_url": "https://example.com/listings",
  "listing_selector": ".card",
  "fields": {
    "title": { "selector": "h2", "type": "text" },
    "price": { "selector": ".price", "type": "text" },
    "url": { "selector": "a", "type": "href" }
  },
  "pagination": { "type": "next_button", "selector": ".next" },
  "detail_page": {
    "image_selector": ".gallery img",
    "image_type": "src",
    "description_selector": ".description",
    "external_id_source": "url_path"
  }
}
```

`fields` values may also be plain strings (legacy/manual configs) — treat as
`{ selector: string, type: 'text' }` (see `extract.js` `normalizeFieldDef`).

This is a **loosely-typed JSON contract**, not a Prisma model — define a
TypeScript interface mirroring the reference (see below) but treat unknown/missing
fields defensively (e.g. no `pagination` = single page only).

Key invariants:

- Normalization into canonical `Property` is **out of scope** here — this
  task only writes `SourceProperty` (per `docs/plan/directions/03-domain-model.md`,
  normalization is Feature 06's job, hooked in as a follow-up call at the end
  of a successful crawl — same order as `crawl/index.js` Phase 3)
- After listing extraction, run **detail page enrichment** when `detail_page` is
  present (reference Phase 1b): visit each `source_url`, merge gallery images +
  description + external id into `raw_data` (`_all_images`, `_detail_text`,
  `_external_id`)
- `SourceProperty` has a unique constraint on `(source_agency_id,
  source_url)` — always `upsert`, never blind `create`, and set `last_seen_at:
  now()` on every visit so Feature 06 can detect removals (rows with a stale
  `last_seen_at` after a full crawl = removed)
- `ScraperExecutionTrace.steps` is a `Json` field holding a step-by-step log
  (page navigations, selector waits, extraction counts) — mirror the `{ ts, msg,
  ...data }` objects from `crawler.js`; this is NOT the same as
  `ComputerUseStep` (that's the AI generation loop, Feature 04); do not reuse
  generation integration code
- Self-heal trigger condition (spec-driven, from
  `docs/plan/directions/01-product-spec.md` §19 "broken scraper detection
  signals"): mark `Scraper.status = BROKEN` and call
  `ScraperGenerationService.trigger(sourceAgencyId, scraperId, 'SELF_HEAL')`
  (the internal method Feature 04 task 01 exposed) when **any** of: zero
  listings found on a page where `listing_selector` previously matched
  content, the page returns a non-2xx/network error, or
  `consecutive_failures` (after incrementing for this run) reaches `3`. Only
  auto-trigger self-heal if `Scraper.self_healing_enabled` is `true`;
  otherwise still set `status: BROKEN` and rely on the Feature 08
  notification for a human to act.
- Success/failure must update `Scraper.consecutive_failures` (reset to `0`
  on success, increment on failure), `last_success_at`/`last_failure_at`

## Requirements

1. **`api/src/integrations/crawler/`** (new integration — third-party
   Playwright usage stays out of `modules/`, per architecture rules):
   - `interfaces/scraper-config.interface.ts` — port the config types implied
     by `generate/prompt.js` + `crawl/crawler.js`:
     - `FieldDef`: `{ selector: string; type: 'text' | 'href' | 'src' | 'background_image' }`
     - `ScraperConfig`: `start_url`, `listing_selector`,
       `fields: Record<string, string | FieldDef>`, optional `pagination`:
       `{ type: 'next_button' | 'load_more' | 'infinite_scroll' | 'url_param' | 'none'; selector?: string; url_param?: string }`,
       optional `detail_page`: `{ image_selector?, image_type?, description_selector?, external_id_source?: 'url_path' | 'selector', external_id_selector? }`
   - `services/stealth-browser.service.ts` — port `crawl/browser.js`
     (`launchBrowser`, `newStealthPage` with anti-automation flags)
   - `services/field-extraction.service.ts` — port `crawl/extract.js`
   - `services/detail-enrichment.service.ts` — port `crawl/detail.js`
     (`enrichDetailPages(items, detailConfig)` with `DETAIL_CONCURRENCY` /
     `DETAIL_DELAY_MS` from reference config)
   - `services/crawler.service.ts` — port `crawl/crawler.js`:
     `runCrawl(config: ScraperConfig): Promise<{ items: Array<{ source_url:
     string; raw: Record<string, unknown> }>; steps: unknown[]; success:
     boolean; error_summary?: string }>` — includes pagination handling for
     all four types, `MAX_PAGES` cap (default 50), per-card image collection
     (`_all_images`), debug dump of first card HTML on page 0
   - `crawler.module.ts` exporting the above services
2. **Rewrite `api/src/background/crawl.processor.ts`** (mirror `crawl/index.js`
   Phases 1–2 + trace finalize; Phase 3 normalization is Feature 06):
   - Load the `CrawlRun` with `scraper.active_version`
   - If no `scraper` or no `active_version`, fail the run immediately
     (`status: FAILED`, `error_message`) — do not call the crawler
   - Call `CrawlerService.runCrawl(activeVersion.config as ScraperConfig)`
   - Call `DetailEnrichmentService.enrichDetailPages(items, config.detail_page)`
   - For each returned item, `prisma.sourceProperty.upsert(...)` keyed on
     `(source_agency_id, source_url)`, mapping `raw.title` → `raw_title`,
     `raw.price` → `raw_price`, `raw.location` → `raw_location`,
     `raw._detail_text` → `raw_description`, full `raw` → `raw_data` (include
     `_all_images`, `_external_id`), `content_hash` per reference
     `crawl/utils.js`, `last_seen_at: now()`, `status: ACTIVE`
   - Create the `ScraperExecutionTrace` row (`scraper_id`, `crawl_run_id`,
     `steps`, `success`, `error_summary?`)
   - Update `CrawlRun` totals (`total_found`, `total_created`,
     `total_updated`) and final `status`
   - Run broken-scraper detection per the invariants above; on trigger,
     write a stub `Notification` row directly for now (`type:
     BROKEN_SCRAPER`) — Feature 08 will replace this with the real
     notifications service, this task just needs `prisma.notification.create()`
     inline so the signal isn't lost
   - Update `Scraper` health-adjacent fields (`consecutive_failures`,
     `last_success_at`/`last_failure_at`) — do **not** recompute
     `health`/`success_rate`/`avg_runtime_ms` here, that's the separate
     `background/scraper-health.cron.ts` job (see checklist below)
3. **`api/src/background/scraper-health.cron.ts`** — `@Cron` (hourly is
   fine, e.g. `CronExpression.EVERY_HOUR`) job that recomputes, for every
   `Scraper`, `success_rate` (successful `CrawlRun`s / total in trailing 7
   days), `avg_runtime_ms` (avg `finished_at - started_at` over the same
   window), and `health` using the actual `ScraperHealth` enum members
   (`EXCELLENT`, `GOOD`, `WARNING`, `CRITICAL`, `BROKEN`) — e.g. `status ===
   'BROKEN' → BROKEN`, `success_rate >= 95 → EXCELLENT`, `>= 80 → GOOD`, `>=
   50 → WARNING`, else `CRITICAL`. Do not overwrite `health: BROKEN` back to
   a numeric-derived value while `Scraper.status` is still `BROKEN`.

## Files to create or modify

### API (`api/`)

- `api/src/integrations/crawler/crawler.module.ts`
- `api/src/integrations/crawler/interfaces/scraper-config.interface.ts`
- `api/src/integrations/crawler/services/stealth-browser.service.ts`
- `api/src/integrations/crawler/services/field-extraction.service.ts`
- `api/src/integrations/crawler/services/detail-enrichment.service.ts`
- `api/src/integrations/crawler/services/crawler.service.ts`
- `api/src/background/crawl.processor.ts` (rewrite)
- `api/src/modules/crawl-runs/crawl-runs.module.ts` (import `CrawlerModule`)
- `api/src/background/scraper-health.cron.ts`
- `api/app.module.ts` (register the health cron provider if `background/`
  providers aren't auto-registered elsewhere — check how Feature 05 task 01's
  `crawl-scheduler.cron.ts` was registered and follow the same pattern)

### Reference (read-only — do not import at runtime)

- `scraper-generator/crawl/` — run `npm run crawl` (after `npm run generate`)
  to validate end-to-end before wiring NestJS

## Subtasks

- [ ] Port `StealthBrowserService` from `crawl/browser.js`
- [ ] Port `FieldExtractionService` from `crawl/extract.js`
- [ ] Port `CrawlerService.runCrawl` from `crawl/crawler.js` (all pagination types + trace log)
- [ ] Port `DetailEnrichmentService` from `crawl/detail.js`
- [ ] Rewrite the crawl processor to match `crawl/index.js` Phases 1–2, upsert `SourceProperty`, write `ScraperExecutionTrace`
- [ ] Implement broken-scraper detection + self-heal trigger + stub notification
- [ ] Update `Scraper.consecutive_failures`/`last_success_at`/`last_failure_at` per run
- [ ] Build the hourly scraper-health cron recomputing `health`/`success_rate`/`avg_runtime_ms`
- [ ] Smoke test: point NestJS crawl at a config produced by `scraper-generator/output/version.json` and compare `source_properties` shape to `scraper-generator/output/crawl/source_properties.json`

## Technical Notes

- Follow `.cursor/rules/api-code-structure-and-best-practices.mdc` — third-party
  browser automation stays in `integrations/`, never imported directly by a
  controller
- Keep `MAX_PAGES`, `PAGE_TIMEOUT_MS`, `SELECTOR_TIMEOUT_MS`,
  `DETAIL_CONCURRENCY`, `DETAIL_DELAY_MS` as named constants (defaults from
  `crawl/config.js`), configurable via env if desired
- Listing-card image extraction and detail-page merge logic must match the
  reference — normalization (Feature 06) reads `_all_images` and
  `_detail_text` from `raw_data`

## Acceptance Criteria

- Running a scraper (via `run-now`) against a config from Feature 04 /
  `scraper-generator` produces `SourceProperty` rows with correct
  `raw_title`/`raw_price`/`raw_description` and `raw_data._all_images`
  matching the reference CLI output
- Re-running the same crawl updates `last_seen_at` on existing
  `SourceProperty` rows rather than duplicating them
- Pointing a scraper's config at a non-existent selector causes the run to
  fail, `Scraper.status` becomes `BROKEN`, `consecutive_failures` increments,
  and (if `self_healing_enabled`) a new `ScraperGenerationRun` with `trigger:
  SELF_HEAL` is created
- The hourly cron updates `Scraper.health`/`success_rate`/`avg_runtime_ms` based on real `CrawlRun` history
- `tsc --noEmit` passes in `api/`
