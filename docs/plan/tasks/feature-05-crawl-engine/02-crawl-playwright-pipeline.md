# Task: Real Playwright crawl pipeline + broken-scraper detection

## Feature group

`docs/plan/PROGRESS.md` → **Feature 05: Crawl Execution Engine & Job Queue**

## Objective

Replace the stub `api/src/background/crawl.processor.ts` from the previous task with a real
Playwright pipeline that reads `Scraper.active_version.config`, visits the
target site, extracts listings into `SourceProperty` rows, records a
`ScraperExecutionTrace`, and detects broken scrapers to trigger self-heal.

## Context — read this before touching anything

Read `docs/scraping-generation-computer-use-architecture.md` sections 4, 10,
11 in full. Config shape (from `ScraperVersion.config`, produced by Feature
04's AI loop or a manual admin edit in Feature 03):

```json
{
  "start_url": "https://example.com/listings",
  "listing_selector": ".card",
  "fields": { "title": "h2", "price": ".price" },
  "pagination": { "type": "next_button", "selector": ".next" }
}
```

This is a **loosely-typed JSON contract**, not a Prisma model — define a
TypeScript interface for it in the new integration (see below) but treat
unknown/missing fields defensively (e.g. no `pagination` = single page only).

Key invariants:

- Normalization into canonical `Property` is **out of scope** here — this
  task only writes `SourceProperty` (per `docs/plan/directions/03-domain-model.md`,
  normalization is Feature 06's job, hooked in as a follow-up call at the end
  of a successful crawl)
- `SourceProperty` has a unique constraint on `(source_agency_id,
  source_url)` — always `upsert`, never blind `create`, and set `last_seen_at:
  now()` on every visit so Feature 06 can detect removals (rows with a stale
  `last_seen_at` after a full crawl = removed)
- `ScraperExecutionTrace.steps` is a `Json` field holding a step-by-step log
  (page navigations, selector waits, extraction counts) — this is NOT the
  same as `ComputerUseStep` (that's the AI generation loop, already built in
  Feature 04); do not reuse or import anything from
  `api/src/integrations/computer-use/`
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
   - `interfaces/scraper-config.interface.ts` — `ScraperConfig` (`start_url`,
     `listing_selector`, `fields: Record<string, string>`, `pagination?: {
     type: 'next_button' | 'none'; selector?: string }`)
   - `services/crawler.service.ts` — `runCrawl(config: ScraperConfig): Promise<{
     items: Array<{ source_url: string; raw_title?: string; raw_price?: string;
     raw_data: Record<string, string> }>; steps: unknown[]; success: boolean;
     error_summary?: string }>` — launches Playwright (reuse the same
     `chromium.launch()` pattern Feature 04's computer-use engine uses if one
     was established there; otherwise a plain headless launch is fine here,
     no computer-use/AI involved), navigates `start_url`, waits for
     `listing_selector`, extracts each field's `textContent` per the
     `fields` map for every matched element, follows pagination up to a
     sane hard cap (e.g. 50 pages) if `pagination.type === 'next_button'`,
     and returns the collected raw items + a step log array for
     `ScraperExecutionTrace.steps`
   - `crawler.module.ts` exporting `CrawlerService`
2. **Rewrite `api/src/background/crawl.processor.ts`**:
   - Load the `CrawlRun` with `scraper.active_version`
   - If no `scraper` or no `active_version`, fail the run immediately
     (`status: FAILED`, `error_message`) — do not call the crawler
   - Call `CrawlerService.runCrawl(activeVersion.config as ScraperConfig)`
   - For each returned item, `prisma.sourceProperty.upsert(...)` keyed on
     `(source_agency_id, source_url)`, updating `raw_title`, `raw_price`,
     `raw_data`, `last_seen_at: now()`, `status: ACTIVE`
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
- `api/src/integrations/crawler/services/crawler.service.ts`
- `api/src/background/crawl.processor.ts` (rewrite)
- `api/src/modules/crawl-runs/crawl-runs.module.ts` (import `CrawlerModule`)
- `api/src/background/scraper-health.cron.ts`
- `api/app.module.ts` (register the health cron provider if `background/`
  providers aren't auto-registered elsewhere — check how Feature 05 task 01's
  `crawl-scheduler.cron.ts` was registered and follow the same pattern)

## Subtasks

- [ ] Build `CrawlerService.runCrawl` with real Playwright extraction + pagination cap
- [ ] Rewrite the crawl processor to use it, upsert `SourceProperty`, write `ScraperExecutionTrace`
- [ ] Implement broken-scraper detection + self-heal trigger + stub notification
- [ ] Update `Scraper.consecutive_failures`/`last_success_at`/`last_failure_at` per run
- [ ] Build the hourly scraper-health cron recomputing `health`/`success_rate`/`avg_runtime_ms`

## Technical Notes

- Follow `.cursor/rules/api-code-structure-and-best-practices.mdc` — third-party
  browser automation stays in `integrations/`, never imported directly by a
  controller
- Keep the pagination hard cap and per-page timeout configurable via a
  constant at the top of `crawler.service.ts`, not hardcoded inline

## Acceptance Criteria

- Running a scraper (via `run-now`) against a real or local test HTML page
  produces `SourceProperty` rows with correct `raw_title`/`raw_price`
  matching the page content, and a `ScraperExecutionTrace` row
- Re-running the same crawl updates `last_seen_at` on existing
  `SourceProperty` rows rather than duplicating them
- Pointing a scraper's config at a non-existent selector causes the run to
  fail, `Scraper.status` becomes `BROKEN`, `consecutive_failures` increments,
  and (if `self_healing_enabled`) a new `ScraperGenerationRun` with `trigger:
  SELF_HEAL` is created
- The hourly cron updates `Scraper.health`/`success_rate`/`avg_runtime_ms` based on real `CrawlRun` history
- `tsc --noEmit` passes in `api/`
