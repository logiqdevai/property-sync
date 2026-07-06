# Task: Property normalization, dedup, history + admin API

## Feature group

`docs/plan/PROGRESS.md` → **Feature 06: Property Normalization & Admin Properties**

## Objective

Turn raw `SourceProperty` rows (written by Feature 05's crawl pipeline) into
normalized, deduplicated `Property` records using AI-assisted field mapping,
write `PropertyHistory` for every detected change, detect
removals/reappearances, route normalization through either synchronous OpenAI
Chat Completions or the OpenAI Batch API based on
`UserTrackedAgency.use_ai_batching`, and expose an admin API for
listing/inspecting/merging/splitting properties.

## Context — read this before touching anything

Read `docs/plan/directions/03-domain-model.md` in full — this task owns the
invariants: **`PropertyHistory` is append-only**, `field` is `null` for
`CREATED`/`REMOVED`/`REAPPEARED`, duplicate grouping is a flat
`Property.duplicate_group_id` string (no separate table), and the
**`UserTrackedAgency.use_ai_batching` routing rule** (sync vs batch path).

This task **hooks into the end of Feature 05's crawl pipeline** — do not
build a separate cron/queue for normalization; it must run synchronously
(or as a chained step) right after `CrawlerService.runCrawl` finishes
upserting `SourceProperty` rows in `api/src/background/crawl.processor.ts`,
so a single `CrawlRun` produces both raw and normalized data (batch-deferred
listings finish normalization when the OpenAI webhook fires, not in the crawl
worker).

**AI normalization** maps raw scraped fields into canonical `Property` columns
(title, price, city, listing_type, etc.) — mirror the prompt/schema shape
from `scraper-generator/crawl/normalize.js`. Use the existing
`api/src/integrations/ai/` (`AiService.generateText` / `generateTextWithSchema`)
for the **sync path**. For the **batch path**, use the official `openai` npm
package directly in a new `api/src/integrations/ai-batch/` facade (the Vercel AI
SDK does not expose Batch API file upload / batch lifecycle).

**OpenAI Batch API flow** (see [Batch API guide](https://developers.openai.com/api/docs/guides/batch)):
1. Build a `.jsonl` file — one line per listing:
   `{ "custom_id": "<source_property_id>", "method": "POST", "url": "/v1/chat/completions", "body": { "model": "<normalization model>", "messages": [...] } }`
2. Upload with `openai.files.create({ file, purpose: "batch" })`
3. Create with `openai.batches.create({ input_file_id, endpoint: "/v1/chat/completions", completion_window: "24h", metadata: { crawl_run_id, source_agency_id } })`
4. Persist on `CrawlRun.metadata`: `{ ai_batch_id, ai_batch_status: "pending", pending_source_property_ids: string[] }` and write a `JobLog` row (`queue_name: "openai-batch"`)
5. On webhook `batch.completed` (see [Webhooks guide](https://developers.openai.com/api/docs/guides/webhooks)): verify signature with `openai.webhooks.unwrap()`, enqueue an `ai-batch-complete` BullMQ job with `{ batchId, crawlRunId }`, respond `204` immediately
6. Worker downloads `output_file_id`, parses each line's `custom_id` → normalized JSON, then runs the same create/update/history/dedup logic as the sync path
7. On `batch.failed` / `batch.expired` / `batch.cancelled`: set `metadata.ai_batch_status` accordingly, store `error_message`, leave a `// TODO(Feature 08)` notification stub

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
   - **Routing decision**: load enabled `UserTrackedAgency` rows for
     `sourceAgencyId`. If none exist **or** any has `use_ai_batching: false`
     → **sync path**. If at least one exists **and all** have
     `use_ai_batching: true` → **batch path** (delegate to
     `PropertyAiBatchService.submitForCrawlRun(...)` and return early —
     do not create `Property` rows yet for those listings)
   - **Sync path**: batch source rows (e.g. 10 at a time, same as
     `scraper-generator`) and call `AiService` to normalize; on batch failure
     retry individual rows; map AI output → `Property` fields
   - For each normalized listing: find or create a matching `Property` via its
     `PropertySourceLink` (a `SourceProperty` already linked → update the
     canonical `Property`; a new `SourceProperty` → create a new `Property`
     + `PropertySourceLink` with `is_primary_source: true`)
   - Keep defensive fallbacks: if AI parsing fails for a row, map
     `raw_title` → `title`, `raw_price` → best-effort `Decimal` `price`,
     `raw_data` → `normalized_data` without throwing the whole crawl
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
4. **`api/src/integrations/ai-batch/`** — `AiBatchModule` exporting
   `AiBatchClientService` (official `openai` SDK wrapper: uploadJsonl,
   createBatch, retrieveBatch, downloadOutputFile, cancelBatch) and
   `PropertyAiBatchService` (build normalization `.jsonl` from source rows,
   submit batch, complete batch from output file by delegating back into
   `PropertyNormalizationService.applyNormalizedResults(...)`)
5. **`api/src/modules/openai-webhooks/`** — `POST /webhooks/openai` controller
   (raw body parser — do **not** use global JSON middleware on this route),
   verify with `OPENAI_WEBHOOK_SECRET`, handle `batch.completed` /
   `batch.failed` / `batch.expired` / `batch.cancelled`, dedupe on
   `webhook-id`, enqueue `ai-batch-complete` jobs. Add `OPENAI_WEBHOOK_SECRET`
   to `api/src/shared/config/env/env.validation.ts` (optional in local dev,
   required in staging/production)
6. Register BullMQ queue `'ai-batch-complete'` in `PropertiesModule` (or a
   small `OpenAiWebhooksModule` that imports `PropertiesModule`)

## Files to create or modify

### API (`api/`)

- `api/package.json` (add `openai` if not already present from Feature 04)
- `api/src/integrations/ai-batch/ai-batch.module.ts`
- `api/src/integrations/ai-batch/services/ai-batch-client.service.ts`
- `api/src/integrations/ai-batch/services/property-ai-batch.service.ts`
- `api/src/modules/openai-webhooks/openai-webhooks.module.ts`
- `api/src/modules/openai-webhooks/openai-webhooks.controller.ts`
- `api/src/modules/openai-webhooks/openai-webhooks.service.ts`
- `api/src/background/ai-batch-complete.processor.ts`
- `api/src/modules/properties/properties.module.ts`
- `api/src/modules/properties/properties.controller.ts`
- `api/src/modules/properties/properties.service.ts`
- `api/src/modules/properties/services/property-normalization.service.ts`
- `api/src/modules/properties/dto/property-query.schema.ts`
- `api/src/modules/properties/dto/merge-properties.dto.ts`
- `api/src/modules/properties/entities/property.entity.ts`
- `api/src/modules/crawl-runs/crawl-runs.module.ts` (import `PropertiesModule`)
- `api/src/background/crawl.processor.ts` (call normalization)
- `api/src/shared/config/env/env.validation.ts` (`OPENAI_WEBHOOK_SECRET`)
- `api/src/app.module.ts` (import `PropertiesModule`, `OpenAiWebhooksModule`)

## Subtasks

- [ ] Build `PropertyNormalizationService` with sync AI path + routing decision
- [ ] Build `AiBatchClientService` + `PropertyAiBatchService` (OpenAI Batch API)
- [ ] Build `OpenAiWebhooksController` with signature verification + dedupe
- [ ] Build `ai-batch-complete` BullMQ processor to finish deferred normalization
- [ ] Wire normalization (sync or batch submit) into `api/src/background/crawl.processor.ts`
- [ ] Build the admin `properties` CRUD-read + merge/split API
- [ ] Verify `PropertyHistory` is genuinely append-only (no update/delete calls anywhere in this task's code)
- [ ] Manual test (sync): crawl with a tracker who has `use_ai_batching: false` → properties appear immediately
- [ ] Manual test (batch): all trackers with `use_ai_batching: true` → crawl finishes, `CrawlRun.metadata.ai_batch_status` is `pending`, trigger test webhook → properties appear

## Technical Notes

- Follow `.cursor/rules/api-code-structure-and-best-practices.mdc`
- `{ data, pagination }` for the list endpoint
- Business logic lives in services, not the controller
- Batch output line order may not match input — always map by `custom_id` (= `source_property_id`)
- Webhook handler must respond within a few seconds; never run full normalization inline in the HTTP handler
- Subscribe to batch webhook events in the OpenAI dashboard for the project that owns `OPENAI_API_KEY`

## Acceptance Criteria

- Running a crawl (Feature 05) with sync routing produces both `SourceProperty`
  and normalized `Property` rows immediately, with a `CREATED` history entry
- Running a crawl where all enabled trackers have `use_ai_batching: true`
  submits an OpenAI batch, stores pending state on `CrawlRun.metadata`, and
  completes normalization only after a verified `batch.completed` webhook
- Running the same crawl again after the source price changes writes a
  `PRICE_CHANGED` history row (sync path immediately; batch path after webhook)
- Removing a listing from the source page and re-crawling sets that
  `Property.status` to `REMOVED` with a `REMOVED` history row; adding it
  back sets it to `ACTIVE` with a `REAPPEARED` row
- `batch.failed` / `batch.expired` surfaces error state on the crawl run
  metadata without crashing the webhook endpoint
- `POST /admin/properties/merge` and `.../split` correctly group/ungroup by
  `duplicate_group_id`, verified via `GET /admin/properties?duplicate_group_id=...`
- `tsc --noEmit` passes in `api/`
