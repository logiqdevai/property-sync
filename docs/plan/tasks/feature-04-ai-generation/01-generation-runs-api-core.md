# Task: Generation Runs CRUD, review & approval API (no AI loop yet)

## Feature group

`docs/plan/PROGRESS.md` → **Feature 04: AI Computer-Use Scraper Generation**

## Objective

Build the `ScraperGenerationRun` + `ComputerUseStep` data layer, the
list/detail/create/approve/reject/cancel HTTP surface, and the BullMQ queue
registration — but stub the actual computer-use loop as a `// TODO(next
task)` so this task can be verified independently before the harder AI/
Playwright integration (next task) is attempted.

## Context — read this before touching anything

Read `docs/scraping-generation-computer-use-architecture.md` in full and
`docs/plan/directions/03-domain-model.md`. For the generation loop behaviour
that task 02 will implement, see the working reference in
`scraper-generator/generate/` (CLI: `npm run generate`). Key invariants:

- `ScraperGenerationRun.status` lifecycle: `QUEUED` → `RUNNING` →
  `AWAITING_REVIEW` → `SUCCESS` / `FAILED` / `CANCELLED`
- `staged_config` holds the draft result while `AWAITING_REVIEW`; it is
  **not** copied into a `ScraperVersion` until an admin calls `approve`
- `produced_version_id` is set only on approval
- If `scraper_id` is null on creation, `approve` must also **create** the
  `Scraper` row (not just a version) — this is how a brand-new agency gets
  its first scraper via AI. If `scraper_id` is set, `approve` creates a new
  `ScraperVersion` on that existing scraper and activates it (same
  transaction pattern as Feature 03's `activateVersion`)
- `BullMQ` (`@nestjs/bullmq`, already installed) is registered in
  `api/src/core/queues/queues.module.ts` (`QueuesModule`, marked `@Global()`)
  but **is not yet imported anywhere** — this task must add `QueuesModule`
  to `api/src/app.module.ts` for the first time and register a
  `'generation'` queue via `BullModule.registerQueue({ name: 'generation' })`
  in this module

## Requirements

1. `api/src/modules/scraper-generation/scraper-generation.module.ts` —
   imports `PrismaModule`, `BullModule.registerQueue({ name: 'generation' })`
2. `dto/create-generation-run.dto.ts` — `source_agency_id` (`@IsUUID()`),
   `scraper_id` (optional `@IsUUID()`), `prompt` (optional string)
3. `dto/generation-run-query.schema.ts` — Zod: `page`, `limit`, `status`
   (`GenerationRunStatus`), `trigger` (`GenerationTrigger`),
   `source_agency_id`, `scraper_id`
4. `dto/reject-generation-run.dto.ts` — `reason` (optional string)
5. `scraper-generation.service.ts`:
   - `findAll(query)` — paginated
   - `findOne(id)` — include `steps` ordered by `step_index asc`
   - `create(dto, initiatedByUserId: string)` — creates the run with `trigger: 'MANUAL'`, `status:
     'QUEUED'`, stores `initiatedByUserId` in the BullMQ job payload (and optionally
     `ScraperGenerationRun.metadata`), then enqueues a `'generation'` BullMQ job;
     returns the created run immediately (do not await the job). Before enqueue,
     call `UserIntegrationsService.resolveActiveApiKey(initiatedByUserId, ANTHROPIC)`
     — if missing, throw `BadRequestException` telling the admin to connect
     Anthropic on the Integrations page first
   - `trigger(sourceAgencyId, scraperId, trigger, prompt?)` — the
     **internal, non-HTTP** method described in
     `directions/04-api-design.md` Feature 04 (used later by Feature 05's
     self-heal detection); same body as `create` but with a caller-supplied
     `trigger` value instead of always `MANUAL`. For `SELF_HEAL`, resolve
     Anthropic credentials via `UserIntegrationsService.resolveForSourceAgency(
     sourceAgencyId, ANTHROPIC)` before enqueue — if no key, log + return
     without creating a run (leave `// TODO(Feature 08)` notification stub)
   - `approve(id)` — validates `status === 'AWAITING_REVIEW'` and
     `staged_config` is set (else `BadRequestException`); in a
     `prisma.$transaction`: if `scraper_id` is null, create the `Scraper`
     (`status: 'TESTING'`) first; create the new `ScraperVersion`
     (`created_by: 'AI'`, `notes` summarizing the trigger), set
     `Scraper.active_version_id` + increment `version_count`, set
     `ScraperGenerationRun.produced_version_id` + `status: 'SUCCESS'` +
     `finished_at`; if the scraper was `BROKEN`, reset it to `ACTIVE`
   - `reject(id, dto)` — `status: 'FAILED'`, store `dto.reason` in
     `error_message`, `finished_at: now()`
   - `cancel(id)` — only valid while `QUEUED` or `RUNNING`; sets `status:
     'CANCELLED'`; leave a `// TODO(next task): signal the running BullMQ
     job/loop to stop` comment since actually interrupting an in-flight
     Playwright/model loop is implemented in the next task
6. `scraper-generation.controller.ts` — `@Controller('admin/generation-runs')`,
   `JwtGuard` + `RolesGuard`, `@Roles('ADMIN','SUPER_ADMIN','SUPPORT')` on
   GETs, `@Roles('ADMIN','SUPER_ADMIN')` on create/approve/reject/cancel
7. `entities/generation-run.entity.ts`, `entities/computer-use-step.entity.ts`
8. Register `ScraperGenerationModule` in `api/src/app.module.ts`; also add
   `QueuesModule` to `app.module.ts` imports for the first time (it is
   `@Global()` so importing it once here makes `BullModule`'s exports
   available everywhere, but every module that registers its own named
   queue must still import `BullModule.registerQueue(...)` itself)
9. Leave the actual queue **processor** (`@Processor('generation')`) as a
   minimal stub in this task — `api/src/background/generation.processor.ts`
   that just logs `"generation job received: " + job.data.runId` and marks
   the run `RUNNING` then immediately `FAILED` with `error_message: 'AI loop
   not implemented yet'`. This proves the queue wiring works end-to-end
   before the next task replaces the stub body with the real loop.

## Files to create or modify

### API (`api/`)

- `api/src/modules/scraper-generation/scraper-generation.module.ts`
- `api/src/modules/scraper-generation/scraper-generation.controller.ts`
- `api/src/modules/scraper-generation/scraper-generation.service.ts`
- `api/src/modules/scraper-generation/dto/create-generation-run.dto.ts`
- `api/src/modules/scraper-generation/dto/generation-run-query.schema.ts`
- `api/src/modules/scraper-generation/dto/reject-generation-run.dto.ts`
- `api/src/modules/scraper-generation/entities/generation-run.entity.ts`
- `api/src/modules/scraper-generation/entities/computer-use-step.entity.ts`
- `api/src/background/generation.processor.ts` (stub, replaced next task)
- `api/src/app.module.ts` (register `QueuesModule` + `ScraperGenerationModule`)

## Subtasks

- [ ] Scaffold module/controller/service/DTOs
- [ ] Register `'generation'` BullMQ queue
- [ ] Implement create/list/detail
- [ ] Implement approve (transaction covering new-scraper and existing-scraper cases)
- [ ] Implement reject/cancel
- [ ] Add the internal `trigger()` method (no HTTP route) for Feature 05 to call later
- [ ] Write the stub processor
- [ ] Register both modules in `app.module.ts`
- [ ] Manual test: `POST /admin/generation-runs` → confirm a job is enqueued and the stub processor flips the run to `FAILED` with the placeholder message (proves queue wiring); manually `PATCH` the DB row to `AWAITING_REVIEW` with a fake `staged_config` via Prisma Studio and confirm `approve` correctly produces a `ScraperVersion`

## Technical Notes

- Follow `.cursor/rules/api-code-structure-and-best-practices.mdc`
- Do not write any Anthropic/Playwright code in this task — that is entirely task 02 (`scraper-generator/generate/` is the reference to port)
- `staged_config` and `action_payload` are `Json` columns — no DTO validation needed on their shape, they're system-internal

## Acceptance Criteria

- `POST /admin/generation-runs` creates a `QUEUED` run and enqueues a BullMQ job
- The stub processor picks up the job and moves the run to `RUNNING` then `FAILED` (visible via `GET /admin/generation-runs/:id`)
- `approve` on a manually-staged `AWAITING_REVIEW` run (set up via Prisma Studio for this test) correctly creates/activates a `ScraperVersion` and links `produced_version_id`
- `reject` and `cancel` correctly transition status and are blocked from invalid states (e.g. cannot reject a `SUCCESS` run — return `400`)
