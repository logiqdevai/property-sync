# Domain Model — Property Sync

`api/prisma/schema.prisma` defines every model needed for the in-scope current phase. The outstanding migration action is running migrations when schema fields change (`api/prisma/migrations/`) and writing a seed script (`api/prisma/seed.ts`) for local development — both handled in Feature 01.

## Entity map (which feature owns which model)

| Feature | Models owned | Notes |
| --- | --- | --- |
| 01 — Foundation | `User` | Auth already implemented against this model; verify it works once migrated. |
| 02 — Agencies | `SourceAgency` | Root of the pipeline. |
| 03 — Scraper Management | `Scraper`, `ScraperVersion` | `Scraper` holds **no config** — always read `active_version.config`. |
| 04 — AI Generation | `ScraperGenerationRun`, `ComputerUseStep`, `Document` (screenshots) | `staged_config` lives only on the run until approved into a `ScraperVersion`. |
| 05 — Crawl Engine | `CrawlRun`, `ScraperExecutionTrace`, `JobLog` | Production execution. `CrawlRun` also stores AI normalization cost totals once Feature 06 finishes (or when a deferred batch completes). |
| 06 — Properties | `SourceProperty`, `Property`, `PropertySourceLink`, `PropertyHistory` | Normalization/dedup/history layer. Writes `CrawlRun` AI cost fields after normalization. |
| 07 — User Tracking | `UserTrackedAgency`, `UserProperty` | Per-user copy + preferences. |
| 08 — Notifications | `Notification` | Read by dashboard unread count. |
| 09 — Integrations Config | `IntegrationTarget`, `UserIntegration` | **`CmsSyncRun` is NOT used in this phase** — do not write to it. |
| 10 — Dashboard & Users | (aggregation only, no new writes) | Reads across all of the above. |

## Key invariants to respect in every task

- **Single source of truth for scraper config**: `Scraper.active_version_id` → `ScraperVersion.config`. Never add a `config` field to `Scraper`. Every config change (AI or human) is a **new** `ScraperVersion` row; never mutate an existing version's `config`. Config JSON shape matches `scraper-generator` (`fields` with `{ selector, type }` defs, optional `detail_page`, pagination types: `next_button` | `load_more` | `infinite_scroll` | `url_param` | `none`) — see `scraper-generator/generate/prompt.js` and `scraper-generator/crawl/crawler.js`.
- **`ComputerUseStep` vs `ScraperExecutionTrace`**: the former logs the AI's exploratory generation-time loop; the latter logs a production Playwright run. Do not conflate them or write one from the other's code path.
- **`PropertyHistory` is append-only.** Every detected change (create, price, image add/remove, status change, removed, reappeared) writes a new row; never update or delete existing rows. `field` is `null` for `CREATED` / `REMOVED` / `REAPPEARED`.
- **`UserProperty` divergence rule**: when a crawl updates canonical `Property` data, the matching `UserProperty` is updated from canonical **unless** `is_modified` is `true` (user has local edits) — in that case, leave the copy untouched and do not silently overwrite; only a manual re-sync action may overwrite it. Always set `last_synced_at` when a copy is written from canonical.
- **`UserTrackedAgency.use_ai_batching` routing rule**: AI property normalization (raw `SourceProperty` → canonical `Property`) can run either synchronously (Chat Completions) or via the OpenAI Batch API (50% cost discount, up to 24h turnaround). After a crawl upserts `SourceProperty` rows, inspect all **enabled** `UserTrackedAgency` rows for that `source_agency_id`:
  - **Sync path** — use when there are **no** enabled trackers, **or** when **any** enabled tracker has `use_ai_batching: false`. Normalize immediately inside the crawl pipeline (Feature 06) and proceed to `UserProperty` sync in the same run.
  - **Batch path** — use only when there is at least one enabled tracker **and every** enabled tracker has `use_ai_batching: true`. Build a `.jsonl` batch input (`/v1/chat/completions`, one request per source listing with a stable `custom_id`), upload via Files API (`purpose: "batch"`), create the batch (`completion_window: "24h"`), persist the OpenAI batch id + pending source-property ids on `CrawlRun.metadata`, and return without blocking the crawl worker. When OpenAI sends `batch.completed` (verified webhook), download the output file, map results back via `custom_id`, finish normalization + history + `UserProperty` sync. Handle `batch.failed` / `batch.expired` / `batch.cancelled` by writing a `Notification` and storing the error on `CrawlRun.metadata` — never leave a crawl stuck silently.
  - Admin canonical data and user copies for batch-deferred listings must not appear until the batch completes; the crawl run itself may finish `SUCCESS` while `metadata.ai_batch_status` is `pending`.
- **`UserTrackedAgency.ai_provider` / `ai_model` selection rule**: each tracker row stores the user's preferred AI vendor (`AiProvider`: `OPENAI`, `ANTHROPIC`, `GEMINI`) and optional model id (`ai_model`, null = that provider's configured default). After a crawl upserts `SourceProperty` rows, Feature 06 resolves the normalization provider/model from enabled trackers for that `source_agency_id`:
  - **No enabled trackers** — use platform defaults from env/config (e.g. `OPENAI` + `gpt-4o-mini`).
  - **Enabled trackers agree** — all enabled rows share the same `ai_provider` and the same `ai_model` value (including all-null `ai_model` on the same provider) → use that pair for normalization and persist it on `CrawlRun.ai_model`.
  - **Enabled trackers disagree** — fall back to platform defaults for the sync path (same as mixed `use_ai_batching`). Do not block the crawl.
  - **Batch path constraint** — OpenAI Batch API applies only when every enabled tracker has `use_ai_batching: true` **and** the resolved `ai_provider` is `OPENAI`. Trackers with `ai_provider: ANTHROPIC` or `GEMINI` must use the sync path regardless of `use_ai_batching`.
- **`CmsSyncRun` is out of scope.** It exists in the schema for the future sync phase only. No task in this plan creates, updates, or reads it.
- **`CrawlRun` AI normalization cost fields** (`ai_model`, `ai_input_tokens`, `ai_output_tokens`, `ai_input_cost`, `ai_output_cost`, `ai_total_cost`, `ai_average_cost_per_property`): populated by Feature 06 after normalization completes. All monetary fields are USD. `ai_average_cost_per_property = ai_total_cost / total_created` when `total_created > 0`, else `null`. On the batch path, leave these null until the OpenAI webhook worker finishes normalization. Mirror the shape of `scraper-generator/output/crawl/cost.json` (the local CLI also writes that file; production persists the same values on the `CrawlRun` row).
- **Duplicate grouping** is a flat `Property.duplicate_group_id` string shared by all members of a group; there is no separate `DuplicateGroup` table. Merge = assign the same `duplicate_group_id` to multiple properties; split = clear/reassign it on one member.

## Enums already defined (reuse, never redeclare)

`AuthRole`, `DocumentType`, `CrawlType`, `PaginationType`, `AgencyStatus`, `ScraperStatus`, `ScraperHealth`, `CrawlRunStatus`, `GenerationRunStatus`, `GenerationTrigger`, `ComputerActionType`, `JobStatus`, `PropertyStatus`, `ListingType`, `PropertyType`, `IntegrationType` (`ESTATEWEB`, `OPENAI`, `ANTHROPIC`, `GEMINI`, `DEEPSEEK`), `AuthType`, `CmsSyncAction` (unused this phase), `CmsSyncStatus` (unused this phase), `PropertyHistoryEventType`, `NotificationType`, `NotificationSeverity`, `AiProvider`.

**IntegrationTarget visibility rule**: `IntegrationTarget.is_visible` controls whether end users see a target on the Integrations page. Admins and super admins always see every target in admin CRUD regardless of `is_visible`. `UserIntegration.is_active` is separate — it enables/disables an individual user's connection.

Per the API rule file, always import these from `generated/prisma` — never redeclare them as TypeScript unions in DTOs/interfaces.

## Migration & seed plan (Feature 01)

1. `npx prisma migrate dev --name init` against local Postgres to create the first migration from the existing schema.
2. `api/prisma/seed.ts` — seed at minimum: one `SUPER_ADMIN` user, one `ADMIN` user, one `USER`, so every subsequent feature has data to develop against without waiting on the crawl pipeline. Extend the seed incrementally as later features land (e.g. Feature 02 adds a couple of seed `SourceAgency` rows).
3. Wire `prisma.schema`'s `generator client { output = "../src/generated/prisma" }` output — already generated once; regenerate after migration (`npx prisma generate`).
