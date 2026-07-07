# Task: Crawl runs + jobs API, and the cron scheduler

## Feature group

`docs/plan/PROGRESS.md` → **Feature 05: Crawl Execution Engine & Job Queue**

## Objective

Build the `CrawlRun`/`JobLog` HTTP surface, register the `crawl` BullMQ
queue, wire `Scraper.run-now` (Feature 03 stub) to actually enqueue a run,
and add a cron scheduler that enqueues one `CrawlRun` per matching enabled
`UserTrackedAgency` (with `user_tracked_agency_id` set). Stub the actual
Playwright execution as a `// TODO(next task)` in the processor so this task
is independently verifiable. Task 02 replaces the stub by porting
`scraper-generator/crawl/`.

## Context — read this before touching anything

- `docs/plan/directions/04-api-design.md` → "Feature 05 — Crawl Runs & Jobs"
- Schema: `api/prisma/schema.prisma` → `CrawlRun` (incl. optional
  `user_tracked_agency_id`), `JobLog`, `ScraperExecutionTrace`, `UserTrackedAgency`
- `CrawlRun.status` lifecycle: `QUEUED` → `RUNNING` → `SUCCESS` /
  `PARTIAL_SUCCESS` / `FAILED` / `CANCELLED`
- `UserTrackedAgency.crawl_interval` is a **cron expression string** (default
  `"0 */6 * * *"`) on each tracker row — `SourceAgency` has no schedule field.
  Do not reinterpret it as an interval in minutes
- `JobLog` is a generic queue-activity log, not specific to crawling —
  `queue_name` + `job_id` link it back to the actual BullMQ job; write one
  row per job attempt (create on `active`, update on `completed`/`failed`)
  so retries are visible as separate `attempt` numbers on the same row (increment `attempt`, don't create new rows per retry)
- `api/src/core/queues/queues.module.ts` already sets up BullMQ with
  `ioredis` and is `@Global()`, but **is not yet imported in
  `app.module.ts`** — Feature 04 task 01 should already have added this
  import; if it's missing, add it here (don't duplicate the registration)
- Register a new queue named `crawl` the same way Feature 04 registered
  `generation` (via `BullModule.registerQueue({ name: 'crawl' })` inside
  `CrawlRunsModule`)

## Requirements

1. **Prisma**: run a migration for `CrawlRun.user_tracked_agency_id` (optional
   FK → `UserTrackedAgency`, `onDelete: SetNull`) plus AI cost columns
   (`ai_model`, `ai_input_tokens`, `ai_output_tokens`, `ai_input_cost`,
   `ai_output_cost`, `ai_total_cost`, `ai_average_cost_per_property`) — see
   `api/prisma/schema.prisma`. Populated by Feature 06 normalization, not this
   task.
2. **`api/src/modules/crawl-runs/`**:
   - `crawl-runs.module.ts` — registers `BullModule.registerQueue({ name: 'crawl' })`
   - `crawl-runs.controller.ts`:
     - `GET /admin/crawl-runs` — `CrawlRunQuerySchema` (Zod: `page`, `limit`,
       `status?`, `agency_id?`, `scraper_id?`, `date_from?`, `date_to?`) via
       `ZodValidationPipe`; `@Roles('ADMIN','SUPER_ADMIN','SUPPORT')`
     - `GET /admin/crawl-runs/:id` — includes `execution_traces`, `job_logs`
       ordered by `created_at`
     - `POST /admin/crawl-runs/:id/rerun` — reads the existing run's
       `source_agency_id`/`scraper_id`/`user_tracked_agency_id`, delegates to
       the same `CrawlRunsService.enqueue(...)` method used by `run-now`
   - `crawl-runs.service.ts`:
     - `enqueue(sourceAgencyId: string, scraperId?: string, userTrackedAgencyId?: string): Promise<CrawlRun>`
       — creates a `CrawlRun` row (`status: QUEUED`, `user_tracked_agency_id`
       when provided), adds a job to the `crawl` queue with `{ crawlRunId }`,
       returns the row. This is the **single entry point** used by `run-now`,
       `rerun`, and the cron scheduler — do not duplicate this logic anywhere
       else.
     - `findAll(query)`, `findOne(id)`
   - `dto/create-crawl-run-query.schema.ts` (Zod)
   - `entities/crawl-run.entity.ts` — include nullable `ai_*` cost fields
     (returned on detail; list may omit or include summary `ai_total_cost`)
   - `api/src/background/crawl.processor.ts` (same convention as Feature
     04's `generation.processor.ts` — queue processors live in
     `api/src/background/`, not inside the feature module) — `@Processor('crawl')`, `@Process()`
     handler that: sets `status: RUNNING`, `started_at: now()`, then
     `// TODO(next task): replace with real Playwright pipeline` sets
     `status: SUCCESS`, `finished_at: now()` after a no-op delay — this stub
     must still create a `JobLog` row transitioning `WAITING` → `ACTIVE` →
     `COMPLETED` so the Jobs UI has real data to show
3. **`api/src/modules/jobs/`**:
   - `jobs.controller.ts`:
     - `GET /admin/jobs` — `JobLogQuerySchema` (`status?`, `queue_name?`)
     - `GET /admin/jobs/:id`
     - `POST /admin/jobs/:id/retry` — reads `JobLog.queue_name` +
       `JobLog.payload`, re-adds a job to that queue via `@InjectQueue`
       lookups for both `generation` and `crawl` queues (inject both, pick by
       `queue_name`), increments `attempt` on the existing `JobLog` row
       rather than creating a new one
   - `jobs.service.ts`, DTO, entity
4. **Wire `Scraper.run-now`** (Feature 03 stub controller method): inject
   `CrawlRunsService` into `ScrapersModule`'s imports (export
   `CrawlRunsService` from `CrawlRunsModule`) and replace the stub body with
   `this.crawlRunsService.enqueue(scraper.source_agency_id, scraper.id)` —
   no `userTrackedAgencyId` (manual run; `user_tracked_agency_id` stays null).
5. **Cron scheduler**: `api/src/background/crawl-scheduler.cron.ts` —
   `@Injectable()` with a `@Cron(CronExpression.EVERY_MINUTE)` method
   (`@nestjs/schedule` is already an `api/package.json` dependency, and
   `cron-parser` is already available transitively via it — do not add either
   as a new direct dependency, just import `CronExpressionParser`/`parseExpression`
   from `cron-parser` and `@Cron`/`CronExpression` from `@nestjs/schedule`)
   that: queries all `UserTrackedAgency` where `enabled: true` and the related
   `SourceAgency.status` is `ACTIVE`; for **each** tracker whose
   `crawl_interval` cron expression matches "now" (parse with `cron-parser`,
   compare `prev().toDate()` against a 1-minute window) and which has no
   `CrawlRun` currently `QUEUED` or `RUNNING` with the same
   `user_tracked_agency_id` (overlap prevention per tracker, not per agency),
   calls `crawlRunsService.enqueue(tracker.source_agency_id, undefined,
   tracker.id)`.
   Register this provider in `CrawlRunsModule` and ensure
   `ScheduleModule.forRoot()` is imported once in `app.module.ts` — search
   `app.module.ts` first, it is likely not yet imported even though the
   package is installed.

## Files to create or modify

### API (`api/`)

- `api/src/modules/crawl-runs/crawl-runs.module.ts`
- `api/src/modules/crawl-runs/crawl-runs.controller.ts`
- `api/src/modules/crawl-runs/crawl-runs.service.ts`
- `api/src/modules/crawl-runs/dto/crawl-run-query.schema.ts`
- `api/src/modules/crawl-runs/entities/crawl-run.entity.ts`
- `api/src/background/crawl.processor.ts`
- `api/src/modules/jobs/jobs.module.ts`
- `api/src/modules/jobs/jobs.controller.ts`
- `api/src/modules/jobs/jobs.service.ts`
- `api/src/modules/jobs/dto/job-log-query.schema.ts`
- `api/src/modules/jobs/entities/job-log.entity.ts`
- `api/src/background/crawl-scheduler.cron.ts`
- `api/src/modules/scrapers/scrapers.controller.ts` (wire `run-now`)
- `api/src/modules/scrapers/scrapers.module.ts` (import `CrawlRunsModule`)
- `api/src/app.module.ts` (import `CrawlRunsModule`, `JobsModule`;
  confirm/add `ScheduleModule.forRoot()`)

## Subtasks

- [ ] Confirm `QueuesModule` is imported in `app.module.ts` (add if missing)
- [ ] Build `crawl-runs` module with stub processor + `JobLog` writes
- [ ] Build `jobs` module with retry logic spanning both queues
- [ ] Wire `run-now` in `ScrapersController` to `CrawlRunsService.enqueue`
- [ ] Build the cron scheduler with overlap prevention
- [ ] Confirm `ScheduleModule.forRoot()` registered exactly once

## Technical Notes

- Follow `.cursor/rules/api-code-structure-and-best-practices.mdc`
- `{ data, pagination }` for all list endpoints
- `JwtGuard` + `RolesGuard`; `SUPPORT` gets `GET` only on both modules
- Leave the `@Processor('crawl')` concurrency at BullMQ's default here — this
  task's processor is a no-op stub. Task 02 (`02-crawl-playwright-pipeline.md`)
  sets an explicit bounded `concurrency` once real Playwright/browser
  resource usage exists (see `docs/playwright-scraping-worker-architecture.md`
  "Concurrency Management"); don't tune it prematurely against a stub

## Acceptance Criteria

- `POST /admin/scrapers/:id/run-now` creates a `CrawlRun`, a `JobLog`
  transitions through the stub lifecycle, and the run reaches `SUCCESS`
  within seconds
- `GET /admin/crawl-runs` and `GET /admin/jobs` return real data with
  working filters and pagination
- `POST /admin/jobs/:id/retry` re-enqueues and increments `attempt`
- The cron scheduler enqueues a run for each enabled tracker whose interval
  matches, sets `user_tracked_agency_id`, and does **not** double-enqueue while
  a run is already `QUEUED`/`RUNNING` for that tracker
- `tsc --noEmit` passes in `api/`
