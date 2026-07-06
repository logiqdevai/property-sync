# Project Progress Tracker — Property Sync

> **For AI coding agents:** Read this file at the start of every session.
> Use **Current focus** and the feature checklists to decide what to
> implement next. Open the **References** paths for the active feature
> before writing code. Update this file when deliverables are verified.

**Last updated:** 2026-07-06
**Overall progress:** 5% (0.5 / 10 features complete — Feature 01 partially pre-built)
**Current focus:** Feature 01 — `Platform Foundation` → `tasks/feature-01-foundation/01-foundation-db-and-auth-api.md`

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
| 01 | Platform Foundation (DB, Auth, Roles) | in progress | 50% | 2 files |
| 02 | Admin Shell & Agencies | not started | 0% | 3 files |
| 03 | Scraper Management | not started | 0% | 3 files |
| 04 | AI Computer-Use Scraper Generation | not started | 0% | 4 files |
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

**Status:** in progress
**Progress:** 50% (auth module + JWT guard + RolesGuard + sign-in/up UI already exist; DB has never been migrated and the admin-role routing path does not exist yet)

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
| `tasks/feature-01-foundation/01-foundation-db-and-auth-api.md` | ready |
| `tasks/feature-01-foundation/02-foundation-frontend-role-routing.md` | ready |

### Implementation checklist

**API (`api/`)**
- [ ] Run initial Prisma migration (`npx prisma migrate dev --name init`) and regenerate client
- [ ] `api/prisma/seed.ts` — seed `SUPER_ADMIN`, `ADMIN`, `USER`
- [ ] Verify `POST /auth/email/register`, `POST /auth/email/login`, `GET /users/me` work against the migrated DB
- [ ] Fix `JwtGuard` (`api/src/shared/guards/jwt.guard.ts`) — it currently wraps requests in `GqlExecutionContext`, which is GraphQL-specific; confirm it correctly resolves the Express `req` for pure REST controllers, fix if not
- [ ] `RolesGuard` already implemented — confirm `@Roles()` + `SUPPORT` read-only behavior works as intended

**App (`app/`)**
- [ ] Confirm `role` is present on the logged-in user shape in `stores/auth.ts`
- [ ] Add `Routes.admin.root` placeholder key
- [ ] Extend/duplicate `ProtectedRoute` to support role-based redirect (non-admin roles bounced to `Routes.dashboard.root`)
- [ ] Smoke test: register → login → land on `/dashboard`; manually set role to `ADMIN` in seed data and confirm an admin-only route is reachable

**Verification**
- [ ] Smoke test: new user can register, login, and reach `/dashboard`; an `ADMIN` seed user can reach a stub admin-only route

**Definition of done:** A new user can register, log in, and reach `/dashboard`; an admin user is distinguishable by role and can be routed to admin-only pages once Feature 02 adds them.

---

## Feature 02: Admin Shell & Agencies

**Description:** Admins have a dashboard shell (sidebar/navbar) and can fully manage `SourceAgency` records — the root entity every later feature depends on.

**Status:** not started
**Progress:** 0%

### References

| Doc | Path |
|-----|------|
| Product spec §5 | `directions/01-product-spec.md` |
| System architecture | `directions/02-system-architecture.md` |
| API design — Feature 02 | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-02-agencies/01-agencies-api.md` | ready |
| `tasks/feature-02-agencies/02-agencies-frontend-data.md` | ready |
| `tasks/feature-02-agencies/03-admin-shell-and-agencies-ui.md` | ready |

### Implementation checklist

**API (`api/`)**
- [ ] `api/src/modules/agencies/` — module, controller, service, DTOs, entity, interface
- [ ] CRUD + status endpoints per `directions/04-api-design.md`
- [ ] Guarded with `JwtGuard` + `RolesGuard` (`ADMIN`, `SUPER_ADMIN`; `SUPPORT` read-only)

**App (`app/`)**
- [ ] `app/src/features/agencies/` — services, hooks, interfaces, schemas
- [ ] `ApiRoutes.admin.agencies` + `Routes.admin.agencies`
- [ ] `components/layout/admin-layout.tsx`, `admin-sidebar-content.tsx`, `admin-dashboard-navbar.tsx`
- [ ] `/admin/agencies` list (search/filter by status/country/city) + create/edit + enable/disable/archive + detail stub (linked scrapers/crawl runs sections show empty state until Features 03/05 land)

**Verification**
- [ ] Smoke test: admin logs in, opens Admin Shell, creates an agency, edits it, disables it, sees it reflected in the list

**Definition of done:** An admin can fully manage source agencies from a working admin shell.

---

## Feature 03: Scraper Management

**Description:** Admins can see, create (manually), and version-control scrapers per agency, including rollback.

**Status:** not started
**Progress:** 0%

### References

| Doc | Path |
|-----|------|
| Product spec §6 | `directions/01-product-spec.md` |
| Domain model | `directions/03-domain-model.md` |
| API design — Feature 03 | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-03-scrapers/01-scrapers-api.md` | ready |
| `tasks/feature-03-scrapers/02-scrapers-frontend-data.md` | ready |
| `tasks/feature-03-scrapers/03-scrapers-ui.md` | ready |

### Implementation checklist

**API (`api/`)**
- [ ] `api/src/modules/scrapers/` — module, controller, service, DTOs
- [ ] `Scraper` + `ScraperVersion` CRUD, version list, activate/rollback, `run-now` stub (returns `501`/placeholder until Feature 05 implements execution)

**App (`app/`)**
- [ ] `app/src/features/scrapers/`
- [ ] `/admin/scrapers` list + detail: health card, version history with diff, rollback, `self_healing_enabled` toggle, validation rules editor

**Verification**
- [ ] Smoke test: admin creates a scraper with a manual JSON config, creates a second version, rolls back to the first

**Definition of done:** An admin can fully manage scraper versions (manually) with working rollback, independent of AI generation.

---

## Feature 04: AI Computer-Use Scraper Generation

**Description:** Admins can trigger an AI computer-use session that generates or fixes a scraper, replay every step it took, and approve/reject the result.

**Status:** not started
**Progress:** 0%

### References

| Doc | Path |
|-----|------|
| Computer-use architecture | `../../scraping-generation-computer-use-architecture.md` |
| System architecture | `directions/02-system-architecture.md` |
| API design — Feature 04 | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-04-ai-generation/01-generation-runs-api-core.md` | ready |
| `tasks/feature-04-ai-generation/02-computer-use-loop-engine.md` | ready |
| `tasks/feature-04-ai-generation/03-generation-runs-frontend-data.md` | ready |
| `tasks/feature-04-ai-generation/04-generation-runs-ui.md` | ready |

### Implementation checklist

**API (`api/`)**
- [ ] Add `openai` and `playwright` dependencies
- [ ] `api/src/integrations/computer-use/` — OpenAI computer-use client + Playwright action executor + screenshot capture (writes `Document` rows)
- [ ] `api/src/modules/scraper-generation/` — module, controller, service; `ScraperGenerationRun` + `ComputerUseStep` persistence; BullMQ `generation` queue + processor running the loop
- [ ] Approve/reject/cancel endpoints; approve promotes `staged_config` into a new `ScraperVersion` and activates it
- [ ] Public service method `triggerGeneration(agencyId, scraperId | null, trigger, prompt?)` for later self-heal wiring (Feature 05)

**App (`app/`)**
- [ ] `app/src/features/scraper-generation/`
- [ ] `/admin/generation-runs` list + session replay view (steps with before/after screenshots + reasoning) + review screen (diff `staged_config` vs current active version, approve/reject) + manual "Generate scraper" trigger (from Agencies or Scrapers page)

**Verification**
- [ ] Smoke test: trigger a manual generation run against a real simple test page, watch it reach `AWAITING_REVIEW`, approve it, confirm a new `ScraperVersion` is active

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
- [ ] BullMQ `crawl` queue + processor; cron scheduler reading `SourceAgency.crawl_interval` (only `ACTIVE` agencies)
- [ ] Playwright production runner: discover → collect URLs → visit → extract → normalize (writes `SourceProperty` — normalization into canonical `Property` is Feature 06) → `ScraperExecutionTrace`
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
- [ ] AI-assisted normalization (sync via `integrations/ai/`, batch via `integrations/ai-batch/` + OpenAI webhooks) with routing based on `UserTrackedAgency.use_ai_batching` and provider/model resolution from `UserTrackedAgency.ai_provider` / `ai_model`
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
- [ ] Track/untrack + per-type toggle + `use_ai_batching` + `ai_provider` / `ai_model` endpoints
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

## Feature 09: CMS Targets & User Integrations (configuration only)

**Description:** Admins define supported CMS targets; users connect/manage their own credentials. No sync execution.

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
- [ ] `api/src/modules/cms-targets/` (admin CRUD + connected-accounts management)
- [ ] `api/src/modules/user-cms/` (user-scoped connect/edit/enable/disable/disconnect)
- [ ] Never create a `CmsSyncRun` row anywhere in this feature

**App (`app/`)**
- [ ] `app/src/features/cms-targets/`, `app/src/features/user-cms/`
- [ ] `/admin/cms-targets` list/detail + connected accounts table with masked credentials
- [ ] `/integrations` (user) — available targets, connect form (fields per `auth_type`), connected accounts with enable/disable/edit/disconnect

**Verification**
- [ ] Smoke test: admin creates a `CmsTarget`, user connects to it, edits credentials, disables, disconnects — no sync job is ever created

**Definition of done:** Admins and users can fully manage CMS connections; confirmed no sync execution occurs anywhere in the codebase.

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
- [ ] `api/src/modules/users/` — admin list/detail with tracked agencies, saved properties (+ `is_modified`), `user_cms`

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
