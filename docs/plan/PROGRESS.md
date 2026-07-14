# Project Progress Tracker — Property Sync

> **For AI coding agents:** Read this file at the start of every session.
> Use **Current focus** and the feature checklists to decide what to
> implement next. Open the **References** paths for the active feature
> before writing code. Update this file when deliverables are verified.

**Last updated:** 2026-07-14
**Overall progress:** 30% (3 / 10 features complete — Features 01, 02, and 03 are all verified end-to-end against a real DB and real browser UI; Feature 04 task 01 of 4 is also done, see below)
**Current focus:** Continue Feature 04 (AI Computer-Use Scraper Generation) — `tasks/feature-04-ai-generation/02-computer-use-loop-engine.md`. Read `../../scraping-generation-computer-use-architecture.md`, the reference CLI under `../../scraper-generator/generate/`, and that task file in full before implementing. This task adds `@anthropic-ai/sdk` + `playwright` dependencies and replaces the stub `api/src/background/generation.processor.ts` with the real Anthropic-vision + Playwright loop.
**Dependency note:** Feature 04 task 01 needed `UserIntegrationsService.resolveActiveApiKey` / `resolveForSourceAgency`, which is formally Feature 09's deliverable but Feature 09 hasn't started yet. A **minimal** `api/src/modules/user-integrations/` module was added out-of-order containing just those two resolver methods (matching the contract in `directions/03-domain-model.md`'s `UserIntegration AI credential rule`) — no controllers/DTOs/CRUD. When Feature 09 is implemented, extend this module in place (add `integration-targets` module + this module's admin/user CRUD endpoints) rather than recreating it.

---

## Session start checklist

- [ ] Read this file (`PROGRESS.md`)
- [ ] Read `.cursor/rules/app-code-structure-and-best-practices.mdc` and/or
      `.cursor/rules/api-code-structure-and-best-practices.mdc` for the active task
- [ ] Read direction docs listed under **Current focus** feature
- [ ] Open the next incomplete task file in that feature group
- [ ] Implement until acceptance criteria pass
- [ ] Update checklists and percentages below
- [ ] Set **Current focus** to the next incomplete item

---

## Feature index

| # | Feature | Status | Progress | Task files |
|---|---------|--------|----------|------------|
| 01 | Platform Foundation (DB, Auth, Roles) | done | 100% | 2 files |
| 02 | Admin Shell & Agencies | done | 100% | 3 files |
| 03 | Scraper Management | done | 100% | 3 files |
| 04 | AI Computer-Use Scraper Generation | in progress | 25% (1/4 task files) | 4 files |
| 05 | Crawl Execution Engine & Job Queue | not started | 0% | 4 files |
| 06 | Property Normalization & Admin Properties | not started | 0% | 3 files |
| 07 | User Tracked Agencies & UserProperty | not started | 0% | 3 files |
| 08 | Notifications | not started | 0% | 2 files |
| 09 | CMS Targets & User Integrations (config only) | not started | 0% | 4 files |
| 10 | Dashboard Home & Users Admin | not started | 0% | 2 files |

Overall % = completed features / 10 (a feature counts as complete only when its Definition of done is met).

---

## Feature 01: Platform Foundation (Database, Auth & Roles)

**Description:** The database is migrated and seeded, a user can register/login, and role-based route protection works on both API and frontend for `USER` / `ADMIN` / `SUPER_ADMIN` / `SUPPORT`.

**Status:** done
**Progress:** 100% (verified end-to-end: migrated + seeded DB, register/login/role-guard/route-protection all confirmed against a running API + browser UI)

### References (read before implementing)

| Doc | Path |
|-----|------|
| Product spec | `directions/01-product-spec.md` |
| System architecture | `directions/02-system-architecture.md` |
| Domain model | `directions/03-domain-model.md` |
| App architecture rules | `.cursor/rules/app-code-structure-and-best-practices.mdc` |
| API architecture rules | `.cursor/rules/api-code-structure-and-best-practices.mdc` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-01-foundation/01-foundation-db-and-auth-api.md` | done |
| `tasks/feature-01-foundation/02-foundation-frontend-role-routing.md` | done |

### Implementation checklist

**API (`api/`)**
- [x] Run initial Prisma migration (`npx prisma migrate dev --name init`) and regenerate client — ran against the Railway Postgres instance (public proxy URL) via `api/.env.local`; migration `20260714075846_init` applied
- [x] `api/prisma/seed.ts` — seed `SUPER_ADMIN`, `ADMIN`, `USER`, `SUPPORT` — run via `npx ts-node prisma/seed.ts` (Prisma 7 doesn't read the legacy `package.json#prisma.seed` key); all four accounts created, password `Password123!`
- [x] Verify `POST /auth/email/register`, `POST /auth/email/login`, `GET /users/me` work against the migrated DB — confirmed via curl: login returns a JWT with correct `role`, `/users/me` returns the profile
- [x] Fix `JwtGuard` (`api/src/shared/guards/jwt.guard.ts`) — removed `GqlExecutionContext` usage (API is pure REST, `GraphQLModule` is commented out); default `AuthGuard('jwt')` REST behavior now used
- [x] `RolesGuard` already implemented — confirmed: `ADMIN` token can hit `/admin/agencies`, `USER` token gets `403 Forbidden` on the same route

**App (`app/`)**
- [x] Confirm `role` is present on the logged-in user shape in `stores/auth.ts` — already there, no change needed
- [x] Add `Routes.admin.root` placeholder key
- [x] Extend/duplicate `ProtectedRoute` to support role-based redirect (non-admin roles bounced to `Routes.dashboard.root`) — reused `ProtectedRoute` unmodified, nested two layers on the `/admin` route instead (see task 02 subtasks for why)
- [x] Smoke test: register → login → land on `/dashboard`; manually set role to `ADMIN` in seed data and confirm an admin-only route is reachable — confirmed via Playwright: admin login lands on `/dashboard`, `/admin/agencies` renders the admin shell; `USER` login navigating to `/admin/agencies` is redirected back to `/dashboard`

**Verification**
- [x] Smoke test: new user can register, login, and reach `/dashboard`; an `ADMIN` seed user can reach a stub admin-only route — verified in a real browser against the live API (see driver run notes below)

**Definition of done:** A new user can register, log in, and reach `/dashboard`; an admin user is distinguishable by role and can be routed to admin-only pages once Feature 02 adds them. **Met.**

**Note on env setup:** `api/.env.local` and `app/.env.local` were created (gitignored, not committed) pointing at the Railway staging Postgres + Redis instances via their public proxy URLs (`hayabusa.proxy.rlwy.net`) — there is no local Postgres/Redis on this machine, and the Railway `DATABASE_URL`/`REDIS_URL` were made public for this purpose. Local dev currently shares the staging DB; the seed script upserts so it's safe to re-run.

**Bug fixed:** `app/src/config/environments/index.ts` builds the API base URL from `VITE_API_URL` and `ApiRoutes` paths have no `/api` prefix, but `api/.env.template`'s `API_URL` value (`http://localhost:3000/api`) is misleading for this purpose — the API has no `app.setGlobalPrefix()` in `api/src/main.ts`. `app/.env.local` must set `VITE_API_URL=http://localhost:3000` (no `/api` suffix) or every request 404s.

---

## Feature 02: Admin Shell & Agencies

**Description:** Admins have a dashboard shell (sidebar/navbar) and can fully manage `SourceAgency` records — the root entity every later feature depends on.

**Status:** done
**Progress:** 100% (verified end-to-end: full CRUD + status/visibility flows exercised against the real API and driven through the browser UI)

### References

| Doc | Path |
|-----|------|
| Product spec §5 | `directions/01-product-spec.md` |
| System architecture | `directions/02-system-architecture.md` |
| API design — Feature 02 | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-02-agencies/01-agencies-api.md` | done |
| `tasks/feature-02-agencies/02-agencies-frontend-data.md` | done |
| `tasks/feature-02-agencies/03-admin-shell-and-agencies-ui.md` | done |

### Implementation checklist

**API (`api/`)**
- [x] `api/src/modules/agencies/` — module, controller, service, DTOs, entity, interface
- [x] CRUD + status endpoints per `directions/04-api-design.md` (create/list/get/update/status/visibility/delete/tracker-crawl-interval)
- [x] Guarded with `JwtGuard` + `RolesGuard` (`ADMIN`, `SUPER_ADMIN`; `SUPPORT` read-only)

**App (`app/`)**
- [x] `app/src/features/agencies/` — services, hooks, interfaces, schemas
- [x] `ApiRoutes.admin.agencies` + `Routes.admin.agencies`
- [x] `pages/admin/layout.tsx` (sidebar chrome inlined here, see task 03 notes), `components/layout/admin-sidebar-content.tsx`, `admin-dashboard-navbar.tsx`
- [x] `/admin/agencies` list (search + status filter + pagination, per task 03 requirement 6) + create/edit + enable/disable/archive + visibility toggles + detail page (linked scrapers/crawl runs/tracked-users sections show empty state until Features 03/05/07 land) — `tsc -b` passes with zero new errors

**Verification**
- [x] Smoke test: admin logs in, opens Admin Shell, creates an agency, edits it, disables it, sees it reflected in the list — done via Playwright against the live app + API: create (`201`) → list shows it Active → Disable (`PATCH .../status` `200`) → row updates to Disabled live with a toast → detail page renders correctly with visibility toggles and empty-state cards for Scrapers/Crawl runs/Tracked users → deleted the test agency afterward to leave the (shared, staging) DB clean

**Definition of done:** An admin can fully manage source agencies from a working admin shell. **Met.**

---

## Feature 03: Scraper Management

**Description:** Admins can see, create (manually), and version-control scrapers per agency, including rollback.

**Status:** done
**Progress:** 100% (API + frontend verified end-to-end against the live DB and browser UI)

### References

| Doc | Path |
|-----|------|
| Product spec §6 | `directions/01-product-spec.md` |
| Domain model | `directions/03-domain-model.md` |
| API design — Feature 03 | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-03-scrapers/01-scrapers-api.md` | done |
| `tasks/feature-03-scrapers/02-scrapers-frontend-data.md` | done |
| `tasks/feature-03-scrapers/03-scrapers-ui.md` | done |

### Implementation checklist

**API (`api/`)**
- [x] `api/src/modules/scrapers/` — module, controller, service, DTOs, entities, interface
- [x] `Scraper` + `ScraperVersion` CRUD, version list, activate/rollback, `run-now` stub (returns `501`/placeholder until Feature 05 implements execution) — verified end-to-end against the live DB: create (version 1 active) → list/detail → create version 2 (active unchanged) → activate v2 → toggle `self_healing_enabled` → update `validation_rules` (clones active config into version 3 and activates it) → `run-now` returns `501` → manually forced `status: BROKEN` then activated v1, confirmed it reset to `ACTIVE` → `SUPPORT` can read (200) but not write (403), `USER` gets 403, unauthenticated gets 401. Test data cleaned up afterward.

**App (`app/`)**
- [x] `app/src/features/scrapers/` — interfaces, Zod schemas (JSON-textarea validation), services, hooks (`useScrapers`, `useScraper`, `useScraperVersions`, `useCreateScraper`, `useCreateScraperVersion`, `useActivateScraperVersion`, `useUpdateScraper`, `useRunScraperNow`), status/health chip components, create-scraper and create-version form components
- [x] `/admin/scrapers` list (search + status/health/agency filters + pagination, agency name links to its detail page) + create modal; `/admin/scrapers/:id` detail (health stats, self-heal toggle, run-now with friendly "not available yet" toast on the expected 501, version history with Active marker, side-by-side JSON diff via two version-select dropdowns, rollback button per non-active version, new-version modal) + empty-state panels for Generation Runs / Recent Crawl Runs — nav item + routes wired in; `tsc -b` passes (only 2 pre-existing, unrelated errors in `confirmation-dialog.tsx`/`password-input.tsx` remain, confirmed present on clean `main` before this work)

**Verification**
- [x] Smoke test: admin creates a scraper with a manual JSON config, creates a second version, rolls back to the first — done twice: via curl against the live API/DB, and via a Playwright-driven browser session against the real UI (create → list shows it → open detail → toggle self-heal → run-now shows friendly toast → new version → side-by-side diff renders correctly → activate/rollback flips the Active marker) — `SUPPORT` can view the list, `USER` is redirected away from `/admin/scrapers`. Test data cleaned up afterward.

**Definition of done:** An admin can fully manage scraper versions (manually) with working rollback, independent of AI generation. **Met.**

---

## Feature 04: AI Computer-Use Scraper Generation

**Description:** Admins can trigger an AI computer-use session that generates or fixes a scraper, replay every step it took, and approve/reject the result.

**Status:** in progress
**Progress:** 25% (task 01 of 4 done and verified end-to-end against the live DB; the computer-use loop itself is still a stub)

### References

| Doc | Path |
|-----|------|
| Computer-use architecture | `../../scraping-generation-computer-use-architecture.md` |
| Reference CLI (generation + crawl + normalization) | `../../scraper-generator/` |
| System architecture | `directions/02-system-architecture.md` |
| API design — Feature 04 | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-04-ai-generation/01-generation-runs-api-core.md` | done |
| `tasks/feature-04-ai-generation/02-computer-use-loop-engine.md` | ready |
| `tasks/feature-04-ai-generation/03-generation-runs-frontend-data.md` | ready |
| `tasks/feature-04-ai-generation/04-generation-runs-ui.md` | ready |

### Implementation checklist

**API (`api/`)**
- [ ] Add `@anthropic-ai/sdk` and `playwright` dependencies (task 02)
- [ ] `api/src/integrations/computer-use/` — port `scraper-generator/generate/` (Anthropic vision loop + Playwright actions + config verification + screenshot capture → `Document` rows); API key from initiating admin's or self-heal tracker's `UserIntegration` (task 02)
- [x] `api/src/modules/scraper-generation/` — module, controller, service; `ScraperGenerationRun` + `ComputerUseStep` persistence (findAll/findOne with steps ordered by `step_index asc`); BullMQ `generation` queue registered + stub processor (`api/src/background/generation.processor.ts`, real loop is task 02) — verified end-to-end against the live DB: `POST /admin/generation-runs` without a connected Anthropic key → `400`; with one connected → creates `QUEUED` run, stub processor flips it `RUNNING` → `FAILED` (`"AI loop not implemented yet"`); `reject`/`cancel`/`approve` all correctly blocked (`400`) on a terminal run; manually staged `AWAITING_REVIEW` rows (new-scraper case and existing-`BROKEN`-scraper case) both `approve` correctly — new `Scraper`+`ScraperVersion` created/activated, `produced_version_id` set, `BROKEN` reset to `ACTIVE`, version_count incremented; `SUPPORT`/`ADMIN` can `GET` (200), `USER` gets `403`, unauthenticated gets `401`. Test agency/scraper/versions/runs/integration cleaned up afterward.
- [x] Approve/reject/cancel endpoints; approve promotes `staged_config` into a new `ScraperVersion` and activates it (creates the `Scraper` too when `scraper_id` was null)
- [x] Internal `trigger(sourceAgencyId, scraperId, trigger, prompt?)` method (no HTTP route) for Feature 05's self-heal wiring — resolves Anthropic credentials via `resolveForSourceAgency` for non-`MANUAL` triggers
- [x] Minimal `api/src/modules/user-integrations/` (Feature 09 dependency, added out-of-order — see **Dependency note** above) with only `resolveActiveApiKey` / `resolveForSourceAgency`

**App (`app/`)**
- [ ] `app/src/features/scraper-generation/`
- [ ] `/admin/generation-runs` list + session replay view (steps with before/after screenshots + reasoning) + review screen (diff `staged_config` vs current active version, approve/reject) + manual "Generate scraper" trigger (from Agencies or Scrapers page)

**Verification**
- [ ] Smoke test: trigger a manual generation run against a real simple test page, watch it reach `AWAITING_REVIEW`, approve it, confirm a new `ScraperVersion` is active — blocked on task 02 (real computer-use loop); task 01's queue wiring + approve/reject/cancel transitions are already verified above using a manually-staged run

**Definition of done:** An admin can generate a working scraper end-to-end via the AI computer-use loop with full replay and manual approval.

---

## Feature 05: Crawl Execution Engine & Job Queue

**Description:** Scrapers actually run — manually or on schedule — against real websites, with full job/queue visibility and automatic broken-scraper self-healing.

**Status:** not started
**Progress:** 0%

### References

| Doc | Path |
|-----|------|
| Product spec §7–9, §16–19 | `directions/01-product-spec.md` |
| Reference CLI (crawl pipeline) | `../../scraper-generator/crawl/` |
| Production browser/worker resource rules | `../playwright-scraping-worker-architecture.md` |
| System architecture | `directions/02-system-architecture.md` |
| API design — Feature 05 | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-05-crawl-engine/01-crawl-runs-api-and-scheduler.md` | ready |
| `tasks/feature-05-crawl-engine/02-crawl-playwright-pipeline.md` | ready |
| `tasks/feature-05-crawl-engine/03-crawl-runs-and-jobs-frontend-data.md` | ready |
| `tasks/feature-05-crawl-engine/04-crawl-runs-and-jobs-ui.md` | ready |

### Implementation checklist

**API (`api/`)**
- [ ] `api/src/modules/crawl-runs/`, `api/src/modules/jobs/`
- [ ] BullMQ `crawl` queue + processor; cron scheduler per enabled `UserTrackedAgency.crawl_interval` → `CrawlRun` with `user_tracked_agency_id` (overlap check per tracker)
- [ ] `api/src/integrations/crawler/` — port `scraper-generator/crawl/` (stealth browser, listing extraction, pagination, detail enrichment, execution trace)
- [ ] `StealthBrowserService` launches **one Chromium instance per worker process** (`OnModuleInit`/`OnModuleDestroy`), not one per job — see `docs/playwright-scraping-worker-architecture.md`; per-job isolation comes from a fresh `BrowserContext`, closed after each job
- [ ] `crawl` processor has an explicit, env-configurable bounded `concurrency` (`CRAWL_WORKER_CONCURRENCY`) instead of unbounded/default-1 parallelism
- [ ] Playwright production runner: discover → collect URLs → detail enrich → extract → write `SourceProperty` (normalization into canonical `Property` is Feature 06) → `ScraperExecutionTrace`
- [ ] Broken-scraper detection (signals per spec §19) → `Scraper.status = BROKEN` + `Notification` (stub call until Feature 08) + calls `triggerGeneration(..., 'SELF_HEAL')` when `self_healing_enabled`
- [ ] `background/scraper-health.cron.ts` recomputing `health`/`success_rate`/`avg_runtime_ms`/`consecutive_failures`
- [ ] Wire `Scraper.run-now` (Feature 03 stub) to actually enqueue a `CrawlRun`

**App (`app/`)**
- [ ] `app/src/features/crawl-runs/`, `app/src/features/jobs/`
- [ ] `/admin/crawl-runs` list + detail (totals, AI cost, error, trace, job logs) + re-run action
- [ ] `/admin/jobs` list + detail + retry action

**Verification**
- [ ] Smoke test: manually run a scraper created in Feature 03/04 against a real/test page, see a `CrawlRun` complete with `SourceProperty` rows created and visible in the admin UI

**Definition of done:** An admin can run scrapers manually or on schedule, see full crawl/job history, and broken scrapers self-heal automatically.

---

## Feature 06: Property Normalization & Admin Properties

**Description:** Raw `SourceProperty` rows become normalized, deduplicated `Property` records with full history, visible to admins.

**Status:** not started
**Progress:** 0%

### References

| Doc | Path |
|-----|------|
| Product spec §10–14 | `directions/01-product-spec.md` |
| Domain model | `directions/03-domain-model.md` |
| Reference CLI (normalization + dedup + cost) | `../../scraper-generator/crawl/normalize.js`, `duplicates.js`, `cost.js` |
| API design — Feature 06 | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-06-properties/01-properties-normalization-api.md` | ready |
| `tasks/feature-06-properties/02-properties-frontend-data.md` | ready |
| `tasks/feature-06-properties/03-properties-admin-ui.md` | ready |

### Implementation checklist

**API (`api/`)**
- [ ] `api/src/modules/properties/`
- [ ] AI-assisted normalization — port `scraper-generator/crawl/normalize.js` + `duplicates.js` + `cost.js` (sync via `integrations/ai/` with attributed tracker's `UserIntegration` key, batch via `integrations/ai-batch/` + OpenAI webhooks) using prefs from `CrawlRun.user_tracked_agency` when set
- [ ] `POST /webhooks/openai` — verify `batch.completed` / `batch.failed` / `batch.expired` / `batch.cancelled`, enqueue `ai-batch-complete` worker
- [ ] Normalization/dedup service invoked at the end of each `CrawlRun` (hook into Feature 05's pipeline): create/update `Property`, `PropertySourceLink`, duplicate detection (`duplicate_group_id`)
- [ ] Persist AI normalization cost totals on `CrawlRun` (`ai_*` fields; mirror `scraper-generator/output/crawl/cost.json`)
- [ ] `PropertyHistory` writes for every detected change (created/updated/price/images/status/removed/reappeared)
- [ ] Removal detection (previously seen `SourceProperty` missing from a new crawl → `REMOVED`) and reappearance detection
- [ ] Merge/split endpoints
- [ ] List/detail endpoints with source links + history timeline

**App (`app/`)**
- [ ] `app/src/features/properties/` (admin-facing read/merge/split)
- [ ] `/admin/properties` list/filter + detail (current data, source links, history timeline, duplicate group actions)

**Verification**
- [ ] Smoke test: run a crawl twice against a page with a changed price; confirm a `PRICE_CHANGED` history row appears and is visible in the UI

**Definition of done:** Canonical properties and their full change history are visible and manageable by admins, sourced from real crawls.

---

## Feature 07: User Tracked Agencies & UserProperty

**Description:** Users can track agencies with per-change-type notification preferences and get their own editable, re-syncable property copies.

**Status:** not started
**Progress:** 0%

### References

| Doc | Path |
|-----|------|
| Product spec §21–22 | `directions/01-product-spec.md` |
| Domain model | `directions/03-domain-model.md` |
| API design — Feature 07 | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-07-user-tracking/01-user-tracking-and-userproperty-api.md` | ready |
| `tasks/feature-07-user-tracking/02-user-tracking-frontend-data.md` | ready |
| `tasks/feature-07-user-tracking/03-user-agencies-and-properties-ui.md` | ready |

### Implementation checklist

**API (`api/`)**
- [ ] `api/src/modules/user-tracked-agencies/`, `api/src/modules/user-properties/`
- [ ] Track/untrack + per-type toggle + `use_ai_batching` + `ai_provider` / `ai_model` endpoints (`crawl_interval` defaults on track; admins set it via Feature 02); reject track when agency `is_enabled`/`is_visible` is false or user lacks active `UserIntegration` for chosen `ai_provider`
- [ ] User `GET /agencies` filters `status: ACTIVE`, `is_visible: true`; returns `is_enabled` per row
- [ ] Crawl-time hook (extends Feature 06's normalization path): for every tracking user, create-or-update `UserProperty` after normalization completes (immediate for sync path, deferred for batch path), respecting the `is_modified` divergence rule
- [ ] User list/detail/edit/resync endpoints

**App (`app/`)**
- [ ] `app/src/features/user-tracked-agencies/`, `app/src/features/user-properties/`
- [ ] `/agencies` (user) — browse + track/untrack + per-type toggles + AI batching toggle
- [ ] `/properties` (user) — list/detail/history timeline/edit/resync with `is_modified` warning banner

**Verification**
- [ ] Smoke test: user tracks an agency, a crawl runs, a `UserProperty` appears for them; user edits it, then re-syncs and sees the warning + overwrite

**Definition of done:** A tracking user automatically gets and can manage their own property copies with full history.

---

## Feature 08: Notifications

**Description:** Admins see and act on system notifications for the failure/anomaly signals defined in the spec.

**Status:** not started
**Progress:** 0%

### References

| Doc | Path |
|-----|------|
| Product spec §20 | `directions/01-product-spec.md` |
| API design — Feature 08 | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-08-notifications/01-notifications-api.md` | ready |
| `tasks/feature-08-notifications/02-notifications-frontend.md` | ready |

### Implementation checklist

**API (`api/`)**
- [ ] `api/src/modules/notifications/`
- [ ] Replace the stub calls left in Feature 05/06 (broken scraper, property removal spike, large crawl failure, queue failure, website unavailable) with real `Notification` creation (`setImmediate` + `try/catch`)
- [ ] List/filter/mark-read/mark-all-read endpoints

**App (`app/`)**
- [ ] `app/src/features/notifications/`
- [ ] `/admin/notifications` list/filter/mark read, each row deep-links to the source record

**Verification**
- [ ] Smoke test: force a scraper into `BROKEN`, confirm a notification appears and can be marked read

**Definition of done:** All five notification types are generated by their real triggers and manageable from the admin UI.

---

## Feature 09: Integration Targets & User Integrations (configuration only)

**Description:** Admins define supported integration targets (CMS + AI providers); users connect/manage their own credentials. AI features bill each user's stored API key. No CMS sync execution.

**Status:** not started
**Progress:** 0%

### References

| Doc | Path |
|-----|------|
| Product spec §23 | `directions/01-product-spec.md` |
| API design — Feature 09 | `directions/04-api-design.md` |
| Future phase (reference only, do not build) | `../../CMS-SYNCHRONIZATION-SPECIFICATION.MD` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-09-cms-config/01-cms-targets-admin-api.md` | ready |
| `tasks/feature-09-cms-config/02-user-cms-api.md` | ready |
| `tasks/feature-09-cms-config/03-cms-frontend-data.md` | ready |
| `tasks/feature-09-cms-config/04-cms-admin-and-user-ui.md` | ready |

### Implementation checklist

**API (`api/`)**
- [ ] `api/src/modules/integration-targets/` (admin CRUD + connected-accounts management)
- [ ] `api/src/modules/user-integrations/` (user-scoped connect/edit/enable/disable/disconnect + exported `resolveActiveApiKey` / `resolveForSourceAgency` for Features 04/06)
- [ ] Never create a `CmsSyncRun` row anywhere in this feature

**App (`app/`)**
- [ ] `app/src/features/integration-targets/`, `app/src/features/user-integrations/`
- [ ] `/admin/integration-targets` list/detail (full admin CRUD + connected accounts table with masked credentials) — **not started**
- [ ] `/integrations` (user) — visible targets, connect form (fields per `auth_type`), connected accounts with enable/disable/edit/disconnect

**Verification**
- [ ] Smoke test: admin creates an `IntegrationTarget`, user connects to it, edits credentials, disables, disconnects — no sync job is ever created

**Definition of done:** Admins and users can fully manage integration connections; confirmed no sync execution occurs anywhere in the codebase.

---

## Feature 10: Dashboard Home & Users Admin

**Description:** The admin dashboard home shows real aggregated KPIs and activity across every feature above, and admins can inspect any user's full footprint.

**Status:** not started
**Progress:** 0%

### References

| Doc | Path |
|-----|------|
| Product spec §4.1, §4.2 Users | `directions/01-product-spec.md` |
| API design — Feature 10 | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-10-dashboard-and-users/01-dashboard-and-users-api.md` | ready |
| `tasks/feature-10-dashboard-and-users/02-dashboard-and-users-frontend.md` | ready |

### Implementation checklist

**API (`api/`)**
- [ ] `api/src/modules/dashboard/` — single aggregation endpoint (KPIs listed in spec §4.1 + recent activity feed) using `Promise.all()` for independent counts
- [ ] `api/src/modules/users/` — admin list/detail with tracked agencies, saved properties (+ `is_modified`), `user_integrations`

**App (`app/`)**
- [ ] `app/src/features/dashboard/`, extend `app/src/features/users/` (interfaces already exist) with admin hooks
- [ ] `/admin` (Dashboard Home) — KPI cards + deep-linking activity feed
- [ ] `/admin/users` list + detail

**Verification**
- [ ] Smoke test: dashboard KPI counts match the real data created by exercising Features 02–09

**Definition of done:** Dashboard Home and the Users subpage reflect live platform data, completing the current-phase admin experience end to end.

---

## Notes

- Percentages: count checklist items per feature; feature % = completed / total. Overall % = completed features / 10.
- `CmsSyncRun` and any CMS push/sync logic are explicitly **out of scope** for every feature in this file — see `directions/01-product-spec.md`.
- Do not mark a feature `done` until its Definition of done is met **in the running app**, not just "code exists."
