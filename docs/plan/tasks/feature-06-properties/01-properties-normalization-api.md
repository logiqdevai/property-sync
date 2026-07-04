# Task: Property normalization, dedup, history + admin API

## Feature group

`docs/plan/PROGRESS.md` → **Feature 06: Property Normalization & Admin Properties**

## Objective

Turn raw `SourceProperty` rows (written by Feature 05's crawl pipeline) into
normalized, deduplicated `Property` records, write `PropertyHistory` for
every detected change, detect removals/reappearances, and expose an admin
API for listing/inspecting/merging/splitting properties.

## Context — read this before touching anything

Read `docs/plan/directions/03-domain-model.md` in full — this task owns the
invariants: **`PropertyHistory` is append-only**, `field` is `null` for
`CREATED`/`REMOVED`/`REAPPEARED`, and duplicate grouping is a flat
`Property.duplicate_group_id` string (no separate table).

This task **hooks into the end of Feature 05's crawl pipeline** — do not
build a separate cron/queue for normalization; it must run synchronously
(or as a chained step) right after `CrawlerService.runCrawl` finishes
upserting `SourceProperty` rows in `api/src/background/crawl.processor.ts`,
so a single `CrawlRun` produces both raw and normalized data.

`PropertyHistoryEventType` enum (reuse, do not redeclare): `CREATED`,
`UPDATED`, `PRICE_CHANGED`, `IMAGE_ADDED`, `IMAGE_REMOVED`,
`STATUS_CHANGED`, `REMOVED`, `REAPPEARED`.

## Requirements

1. **`api/src/modules/properties/services/property-normalization.service.ts`**
   — exported and injected into `CrawlRunsModule`'s processor (add
   `PropertiesModule` to `CrawlRunsModule`'s imports, export this service
   from `PropertiesModule`). Public method:
   `normalizeForCrawlRun(crawlRunId: string, sourceAgencyId: string): Promise<void>`
   that:
   - Loads all `SourceProperty` rows for the agency with `last_seen_at`
     matching this crawl's run window (i.e. rows just upserted by the
     processor — pass the crawl's `started_at` timestamp in, and select
     `last_seen_at >= started_at`)
   - For each: find or create a matching `Property` via its
     `PropertySourceLink` (a `SourceProperty` already linked → update the
     canonical `Property`; a new `SourceProperty` → create a new `Property`
     + `PropertySourceLink` with `is_primary_source: true`)
   - Map raw fields (`raw_title` → `title`, `raw_price` → parse into
     `Decimal` `price`, `raw_data` → merge into `normalized_data`) — keep
     this mapping simple and defensive (missing/unparseable price = leave
     `price` untouched, don't throw)
   - Diff old vs new `Property` state and write `PropertyHistory` rows:
     `CREATED` on first creation, `PRICE_CHANGED` (`field: 'price'`,
     `old_value`, `new_value`) when price differs, `IMAGE_ADDED`/
     `IMAGE_REMOVED` when the `images` array grows/shrinks, `STATUS_CHANGED`
     when `status` differs, generic `UPDATED` for any other field change (do
     not spam an `UPDATED` row when nothing actually changed)
   - Simple duplicate detection: if a new `Property` has the same
     normalized `title` + `city` + `price` (within a small tolerance, e.g.
     ±1%) as an existing `Property` from a **different** `SourceProperty`,
     assign both the same `duplicate_group_id` (generate one if neither has
     one yet, reuse the existing one if one already does) — this is a
     best-effort heuristic, not exact matching; document this limitation in
     a code comment
   - Removal detection: any `Property` whose **every** linked
     `SourceProperty` now has `last_seen_at` older than this crawl's
     `started_at` (i.e. none were seen in the latest full crawl for that
     agency) → set `Property.status = REMOVED` + write `PropertyHistory`
     (`event_type: REMOVED`, `crawl_run_id`)
   - Reappearance detection: a `Property` currently `status: REMOVED` whose
     linked `SourceProperty` was just re-upserted with a fresh
     `last_seen_at` → set `status` back to `ACTIVE` + write
     `PropertyHistory` (`event_type: REAPPEARED`)
2. **Wire into the crawl pipeline**: in `api/src/background/crawl.processor.ts` (Feature 05),
   after the `SourceProperty` upserts and `ScraperExecutionTrace` write,
   call `propertyNormalizationService.normalizeForCrawlRun(crawlRun.id,
   crawlRun.source_agency_id)` inside the same try block (a normalization
   failure should not silently swallow the crawl's own success/failure
   status — log and continue, this is additive, not required for the crawl
   run itself to be `SUCCESS`)
3. **`api/src/modules/properties/`** admin controller per
   `docs/plan/directions/04-api-design.md` → "Feature 06 — Properties":
   - `GET /admin/properties` — `PropertyQuerySchema` (Zod: `page`, `limit`,
     `status?`, `listing_type?`, `property_type?`, `city?`, `price_min?`,
     `price_max?`, `duplicate_group_id?`, `search?`)
   - `GET /admin/properties/:id` — includes `source_links` (with nested
     `source_property`) + `history` ordered by `created_at desc`
   - `POST /admin/properties/merge` — body `{ property_ids: string[] }`
     (min 2), assigns a shared `duplicate_group_id` (reuse one member's
     existing group id if present, else generate a new uuid)
   - `POST /admin/properties/:id/split` — clears `duplicate_group_id` on
     that property only, leaving the rest of the group intact
   - `@Roles('ADMIN','SUPER_ADMIN')` for merge/split, `SUPPORT` allowed on
     GETs

## Files to create or modify

### API (`api/`)

- `api/src/modules/properties/properties.module.ts`
- `api/src/modules/properties/properties.controller.ts`
- `api/src/modules/properties/properties.service.ts`
- `api/src/modules/properties/services/property-normalization.service.ts`
- `api/src/modules/properties/dto/property-query.schema.ts`
- `api/src/modules/properties/dto/merge-properties.dto.ts`
- `api/src/modules/properties/entities/property.entity.ts`
- `api/src/modules/crawl-runs/crawl-runs.module.ts` (import `PropertiesModule`)
- `api/src/background/crawl.processor.ts` (call normalization)
- `api/src/app.module.ts` (import `PropertiesModule`)

## Subtasks

- [ ] Build `PropertyNormalizationService` with create/update/history/dedup/removal/reappearance logic
- [ ] Wire it into `api/src/background/crawl.processor.ts`
- [ ] Build the admin `properties` CRUD-read + merge/split API
- [ ] Verify `PropertyHistory` is genuinely append-only (no update/delete calls anywhere in this task's code)

## Technical Notes

- Follow `.cursor/rules/api-code-structure-and-best-practices.mdc`
- `{ data, pagination }` for the list endpoint
- Business logic lives in services, not the controller

## Acceptance Criteria

- Running a crawl (Feature 05) against a page produces both `SourceProperty`
  and normalized `Property` rows, with a `CREATED` history entry
- Running the same crawl again after the source price changes writes a
  `PRICE_CHANGED` history row and updates `Property.price`
- Removing a listing from the source page and re-crawling sets that
  `Property.status` to `REMOVED` with a `REMOVED` history row; adding it
  back sets it to `ACTIVE` with a `REAPPEARED` row
- `POST /admin/properties/merge` and `.../split` correctly group/ungroup by
  `duplicate_group_id`, verified via `GET /admin/properties?duplicate_group_id=...`
- `tsc --noEmit` passes in `api/`
