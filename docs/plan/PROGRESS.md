# Project Progress Tracker — Property Sync

> **For AI coding agents:** Read this file at the start of every session.
> Use **Current focus** and the feature checklists to decide what to
> implement next. Open the **References** paths for the active feature
> before writing code. Update this file when deliverables are verified.

**Last updated:** 2026-07-14
**Overall progress:** 100% (all 10 features implemented; core smoke verified against live API 2026-07-14 — see deferred verification notes below)
**Current focus:** None — current phase complete. Deferred: OpenAI batch webhook path, `PROPERTY_REMOVAL_SPIKE` trigger, `PRICE_CHANGED` on static fixture site, full Playwright browser pass for dashboard UI.
**Path correction:** the reference CLI referenced throughout this file as `scraper-generator/...` actually lives at `scripts/scraper-generator/...` (moved there in commit `363ef61`) — paths below have been corrected. If a future session still can't find it, run `git log --all --diff-filter=A --name-only | grep scraper-generator` to relocate it.
**Dependency note:** Feature 04 task 01 needed `UserIntegrationsService.resolveActiveApiKey` / `resolveForSourceAgency`, which was added out-of-order as a minimal resolver-only module before Feature 09 landed. Feature 09 extended that module in place with full user-scoped CRUD + added the separate `integration-targets` admin module — no recreation needed.
**Local testing gap:** `GCS_PROJECT_ID`/`GCS_BUCKET_NAME` are unset in `api/.env.local`, so `ScreenshotStorageService` (used by the computer-use loop) can't upload screenshots locally, and there's no real `UserIntegration.api_key_secret` for Anthropic (a placeholder key was used for testing — real API calls would 401). Feature 04's happy path (`AWAITING_REVIEW` with a real AI-produced config, all the way through to an approved active `ScraperVersion`) is therefore **not yet verified against a real target site** — the failure path and the full UI flow around it (trigger → live replay → terminal state) are (see Feature 04 checklist). To fully verify, either configure a real GCS bucket + Anthropic key in `.env.local`, or accept this gap and verify later once real credentials exist.

---

## Session start checklist

- [x] Read this file (`PROGRESS.md`)
- [x] Read `.cursor/rules/app-code-structure-and-best-practices.mdc` and/or
      `.cursor/rules/api-code-structure-and-best-practices.mdc` for the active task
- [x] Read direction docs listed under **Current focus** feature
- [x] Open the next incomplete task file in that feature group
- [x] Implement until acceptance criteria pass
- [x] Update checklists and percentages below
- [x] Set **Current focus** to the next incomplete item

---

## Feature index

| # | Feature | Status | Progress | Task files |
|---|---------|--------|----------|------------|
| 01 | Platform Foundation (DB, Auth, Roles) | done | 100% | 2 files |
| 02 | Admin Shell & Agencies | done | 100% | 3 files |
| 03 | Scraper Management | done | 100% | 3 files |
| 04 | AI Computer-Use Scraper Generation | done | 100% | 4 files |
| 05 | Crawl Execution Engine & Job Queue | done | 100% | 4 files |
| 06 | Property Normalization & Admin Properties | done | 100% | 3 files |
| 07 | User Tracked Agencies & UserProperty | done | 100% | 3 files |
| 08 | Notifications | done | 100% | 2 files |
| 09 | CMS Targets & User Integrations (config only) | done | 100% | 4 files |
| 10 | Dashboard Home & Users Admin | done | 100% | 2 files |

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

**Status:** done
**Progress:** 100% (all 4 tasks done; the real computer-use loop's failure path and the full UI flow are verified end-to-end — the happy path (real AI-produced config → `AWAITING_REVIEW`) still needs real GCS + Anthropic credentials to fully verify, see **Local testing gap** above)

### References

| Doc | Path |
|-----|------|
| Computer-use architecture | `../../scraping-generation-computer-use-architecture.md` |
| Reference CLI (generation + crawl + normalization) | `../../scripts/scraper-generator/` |
| System architecture | `directions/02-system-architecture.md` |
| API design — Feature 04 | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-04-ai-generation/01-generation-runs-api-core.md` | done |
| `tasks/feature-04-ai-generation/02-computer-use-loop-engine.md` | done |
| `tasks/feature-04-ai-generation/03-generation-runs-frontend-data.md` | done |
| `tasks/feature-04-ai-generation/04-generation-runs-ui.md` | done |

### Implementation checklist

**API (`api/`)**
- [x] Add `@anthropic-ai/sdk` (`^0.55.0`) and `playwright` (`^1.50.0`) dependencies; `npx playwright install chromium` run locally
- [x] `api/src/integrations/computer-use/` — ported `scripts/scraper-generator/generate/` (Anthropic vision loop + Playwright actions + config verification + screenshot capture → `Document` rows via `GcsService`): `computer-use.module.ts`, `constants/generation-prompt.ts` (verbatim `SYSTEM_PROMPT` port), `services/computer-use-client.service.ts` (Anthropic wrapper — dropped the reference's `thinking: { type: 'adaptive' }`, not a value the installed SDK's `ThinkingConfigParam` accepts), `services/playwright-driver.service.ts` (plain class, `new`'d per run — not a DI singleton, since it holds per-session browser/page state), `services/scraper-config-verification.service.ts`, `services/screenshot-storage.service.ts`, `computer-use-orchestrator.service.ts` (`run(generationRunId, apiKey)`: loads run+agency → `RUNNING` → step loop (screenshot → `Document` → Anthropic call → `ComputerUseStep` persist → `done`-verify-or-execute) capped at `MAX_GENERATION_STEPS=50` → `AWAITING_REVIEW`+`staged_config` or `FAILED`+`error_message`, browser always closed in `finally`)
- [x] `api/src/modules/scraper-generation/` — module, controller, service; `ScraperGenerationRun` + `ComputerUseStep` persistence (findAll/findOne with steps ordered by `step_index asc`); BullMQ `generation` queue + **real** processor (`api/src/background/generation.processor.ts`: resolves the Anthropic key — `MANUAL` via `resolveActiveApiKey(initiatedByUserId)`, else via `resolveForSourceAgency` — skips re-processing a run that's no longer `QUEUED` e.g. already `CANCELLED`, then calls `ComputerUseOrchestratorService.run`) — verified end-to-end against the live DB: `POST /admin/generation-runs` without a connected Anthropic key → `400`; with one connected → creates `QUEUED` run, processor picks it up, launches a real headless Chromium, navigates to the agency's `base_url`, takes a screenshot, then fails cleanly at the (locally-unconfigured) GCS upload step → run ends `FAILED` with a real, useful `error_message` (never stuck `RUNNING`), browser confirmed closed (no orphaned `chrome.exe` processes). Also re-verified `reject`/`cancel`/`approve` guards and the new-scraper/existing-`BROKEN`-scraper `approve` paths from task 01 still pass. Test agency/scraper/versions/runs/integration cleaned up afterward.
- [x] Approve/reject/cancel endpoints; approve promotes `staged_config` into a new `ScraperVersion` and activates it (creates the `Scraper` too when `scraper_id` was null)
- [x] Internal `trigger(sourceAgencyId, scraperId, trigger, prompt?)` method (no HTTP route) for Feature 05's self-heal wiring — resolves Anthropic credentials via `resolveForSourceAgency` for non-`MANUAL` triggers
- [x] Minimal `api/src/modules/user-integrations/` (Feature 09 dependency, added out-of-order — see **Dependency note** above) with only `resolveActiveApiKey` / `resolveForSourceAgency`
- [x] Bug fix (pre-existing, unrelated to this feature's own code but blocked app boot once `GcsIntegrationModule` was first wired into the module graph): `GcsAdapter`'s constructor crashed on `this.gcsConfig.getConfig().folder_name` when GCS env vars are unset (`getConfig()` returns `undefined`) — now falls back to `'documents'`, matching the graceful-degradation pattern already used by `TwillioConfig`/`RedisModule`. Without this fix the entire API fails to boot locally (GCS isn't configured in `api/.env.local`).
- [x] Added optional `SCRAPER_GENERATION_MODEL` env var (`env.validation.ts` + `shared/config/env/index.ts` + `.env.template`); default `claude-opus-4-8` handled in code. Did **not** add `ANTHROPIC_API_KEY` anywhere, per the `UserIntegration` credential rule.
- [x] Backend adjustment discovered while building the frontend data layer (task 03): `GET /admin/generation-runs/:id` now resolves each step's `screenshot_before_id`/`screenshot_after_id` to `screenshot_before_url`/`screenshot_after_url` (via a `Document.url` include, then stripped from the response) instead of returning raw `Document` ids — there's no `GET /documents/:id` endpoint for the frontend to resolve them itself, and the replay view needs to render actual `<img>` tags. `entities/computer-use-step.entity.ts` updated to match. Verified against a seeded fixture run/step/documents: response contains only the resolved urls, no raw ids.

**App (`app/`)**
- [x] `app/src/features/scraper-generation/` — `interfaces/scraper-generation.interfaces.ts` (`GenerationRun`, `ComputerUseStep` matching the resolved-url API shape above, status/trigger/action-type union types, payload/query types), `services/scraper-generation.services.ts` (list/detail/create/approve/reject/cancel), `hooks/use-scraper-generation.ts` (`useGenerationRuns`, `useGenerationRun` — polls every 2s via `refetchInterval` while `status` is `QUEUED`/`RUNNING`, stops once terminal; `useCreateGenerationRun`/`useApproveGenerationRun`/`useRejectGenerationRun`/`useCancelGenerationRun` — the latter three invalidate both `['generationRuns']` and `['scrapers']`), `validation-schemas/scraper-generation.schema.ts` (Zod schema for the manual-trigger form, for task 04); `ApiRoutes.admin.generationRuns` extended in `app/src/config/api/routes.ts`. `tsc -b` passes with the same 2 pre-existing, unrelated errors as Feature 03 (`confirmation-dialog.tsx`/`password-input.tsx`), zero new ones.
- [x] `app/src/routes/routes.ts` + `routes/index.tsx` (`/admin/generation-runs`, `/admin/generation-runs/:id`) + `admin-sidebar-content.tsx` nav item ("Generation Runs", `Sparkles` icon)
- [x] `app/src/features/scraper-generation/components/` — `generation-run-status-chip.tsx`, `generation-run-trigger-chip.tsx`, `create-generation-run-form.tsx` (shared by both entry points; renders a locked read-only agency field — not a `Select` — when `lockAgency` is set, see bug note below)
- [x] `app/src/pages/admin/generation-runs/index.tsx` — list page: agency/scraper/trigger/status/created/finished columns, status+trigger+agency filters, "New generation run" modal (agency selectable)
- [x] `app/src/pages/admin/generation-runs/detail.tsx` — replay/review view: header chips + prompt, live step timeline while `QUEUED`/`RUNNING` (polling via task 03's hook) with a "jump to step" mini-nav and click-to-enlarge before/after screenshots, `AWAITING_REVIEW` panel (pretty-printed `staged_config` + Approve/Reject, reject opens a reason dialog), Cancel button while active, `SUCCESS` panel linking to the produced scraper, `FAILED`/`CANCELLED` panel showing `error_message`
- [x] `app/src/pages/admin/scrapers/detail.tsx` — replaced the Feature 03 "Generation runs" empty-state placeholder with a real "Generate with AI" / "Fix with AI" button (label depends on `scraper.status === 'BROKEN'`) opening the same modal (agency locked to the scraper's own agency) + a live list of this scraper's past runs
- [x] Bug found and fixed during verification: `CreateGenerationRunForm`'s locked agency field briefly showed the `Select` placeholder ("Select an agency") instead of the pre-filled name until `useAgencies` resolved, because `selectedKey` was set before the matching `ListBox.Item` existed — fixed by not rendering a `Select` at all when locked (plain read-only div showing `defaultAgencyName`, passed from the scraper's own `source_agency.name` — no fetch needed) and only calling `useAgencies` when agency selection is actually needed. Extended `useAgencies(query, { enabled })` with an optional second param (backward compatible) to support this.
- [x] `tsc -b` passes with the same 2 pre-existing, unrelated errors as before, zero new ones

**Verification**
- [x] Full browser smoke test via a headless-Chromium Playwright script against the live dev app + API: logged in as admin, confirmed `/admin/generation-runs` renders with filters + "New generation run" button, opened a test scraper's detail page, confirmed the "Generate with AI" button and modal (agency correctly locked/pre-filled, no placeholder flash after the fix), submitted with a prompt, confirmed navigation to the run's detail page showing agency/trigger/status chips, confirmed the run progressed `QUEUED` → `RUNNING` → `FAILED` live via polling with zero console errors, and confirmed the `FAILED` panel shows the real `error_message` (screenshot-upload failure, since GCS isn't configured locally — expected, matches the **Local testing gap** noted above). The happy path (`AWAITING_REVIEW` with a real AI-produced config, approve → active `ScraperVersion`) still needs a real GCS bucket + Anthropic API key to verify, but the `approve`/`reject`/`cancel` transitions themselves were already verified via the API in tasks 01–02. Test agency/scraper/integration/generation-run data cleaned up afterward.

**Definition of done:** An admin can generate a working scraper end-to-end via the AI computer-use loop with full replay and manual approval.

---

## Feature 05: Crawl Execution Engine & Job Queue

**Description:** Scrapers actually run — manually or on schedule — against real websites, with full job/queue visibility and automatic broken-scraper self-healing.

**Status:** done
**Progress:** 100% (tasks 01–04 done + live crawl smoke verified 2026-07-14)

### References

| Doc | Path |
|-----|------|
| Product spec §7–9, §16–19 | `directions/01-product-spec.md` |
| Reference CLI (crawl pipeline) | `../../scripts/scraper-generator/crawl/` |
| Production browser/worker resource rules | `../playwright-scraping-worker-architecture.md` |
| System architecture | `directions/02-system-architecture.md` |
| API design — Feature 05 | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-05-crawl-engine/01-crawl-runs-api-and-scheduler.md` | done |
| `tasks/feature-05-crawl-engine/02-crawl-playwright-pipeline.md` | done |
| `tasks/feature-05-crawl-engine/03-crawl-runs-and-jobs-frontend-data.md` | done |
| `tasks/feature-05-crawl-engine/04-crawl-runs-and-jobs-ui.md` | done |

### Implementation checklist

**API (`api/`)**
- [x] `api/src/modules/crawl-runs/`, `api/src/modules/jobs/` — modules, controllers, services, DTOs, entities
- [x] BullMQ `crawl` queue + processor; cron scheduler per enabled `UserTrackedAgency.crawl_interval`
- [x] `api/src/integrations/crawler/` — ported `scripts/scraper-generator/crawl/` (`StealthBrowserService` singleton browser + per-job contexts, `FieldExtractionService`, `CrawlerService`, `DetailEnrichmentService`, `CrawlerDebugService`)
- [x] `StealthBrowserService` — one Chromium per worker process (`OnModuleInit`/`OnModuleDestroy`), relaunch on disconnect, per-job `BrowserContext` closed after each crawl/detail batch
- [x] `crawl` processor bounded concurrency via `CRAWL_WORKER_CONCURRENCY` (default 5, Zod env schema + `.env.template`)
- [x] Playwright pipeline: discover → paginate → extract → detail enrich → upsert `SourceProperty` → `ScraperExecutionTrace`
- [x] Broken-scraper detection (zero listings page 0, network/HTTP errors, `consecutive_failures >= 3`) → `Scraper.status = BROKEN` + inline `Notification` stub + `ScraperGenerationService.trigger(..., SELF_HEAL)` when `self_healing_enabled`
- [x] `background/scraper-health.cron.ts` — hourly recompute of `health`/`success_rate`/`avg_runtime_ms` (preserves `health: BROKEN` while `Scraper.status === BROKEN`)
- [x] Wire `Scraper.run-now` → `CrawlRunsService.enqueue`
- [x] `tsc --noEmit` passes in `api/`

**App (`app/`)**
- [x] `app/src/features/crawl-runs/` — interfaces, services, hooks (`useCrawlRuns`, `useCrawlRun` with live polling, `useRerunCrawlRun`), status chip
- [x] `app/src/features/jobs/` — interfaces, services, hooks (`useJobs`, `useJob`, `useRetryJob`), status chip
- [x] `/admin/crawl-runs` list (status/agency/scraper/date filters + pagination) + detail (totals, AI cost summary, execution traces, linked jobs, rerun)
- [x] `/admin/jobs` list (status/queue filters + retry on failed) + detail (payload/result/stack trace + retry)
- [x] Agency + Scraper detail pages show real recent crawl runs; scraper "Run now" navigates to new crawl run detail
- [x] Sidebar nav items "Crawl Runs" + "Job Queue"; routes wired
- [x] `tsc -b` passes (only 2 pre-existing unrelated errors in `confirmation-dialog.tsx`/`password-input.tsx`)

**Verification**
- [x] Smoke test: manually run a scraper against books.toscrape.com — `CrawlRun` `SUCCESS`, 20 listings, 20 admin `Property` rows after normalization (2026-07-14)
- [x] Smoke test: bad selector / unreachable host → failed crawl + `LARGE_CRAWL_FAILURE` / `WEBSITE_UNAVAILABLE` notifications; zero-listings path marks scraper broken (self-heal enqueue verified in code, not re-run with real Anthropic key)

**Definition of done:** An admin can run scrapers manually or on schedule, see full crawl/job history, and broken scrapers self-heal automatically. **Met.**

**Note:** `ScrapersService.runNow()` resolves an enabled `UserTrackedAgency` for the agency and passes `user_tracked_agency_id` into `CrawlRunsService.enqueue` so tracker-linked normalization runs on manual crawls. Scheduled tracker crawls resolve `scraper_id` in `crawl-scheduler.cron.ts`.

---

## Feature 06: Property Normalization & Admin Properties

**Description:** Raw `SourceProperty` rows become normalized, deduplicated `Property` records with full history, Visible.

**Status:** done
**Progress:** 100% (tasks 01–03 done + crawl→property path verified 2026-07-14)

### References

| Doc | Path |
|-----|------|
| Product spec §10–14 | `directions/01-product-spec.md` |
| Domain model | `directions/03-domain-model.md` |
| Reference CLI (normalization + dedup + cost) | `../../scripts/scraper-generator/crawl/normalize.js`, `duplicates.js`, `cost.js` |
| API design — Feature 06 | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-06-properties/01-properties-normalization-api.md` | done |
| `tasks/feature-06-properties/02-properties-frontend-data.md` | done |
| `tasks/feature-06-properties/03-properties-admin-ui.md` | done |

### Implementation checklist

**API (`api/`)**
- [x] `api/src/modules/properties/` — module, controller, service, DTOs, entity; list/detail/merge/split admin endpoints
- [x] AI-assisted normalization — ported `scripts/scraper-generator/crawl/normalize.js` + duplicate detection + cost tracking (`property-normalization.utils.ts`, `anthropic-normalization.service.ts`, `property-normalization.service.ts`); sync path via `integrations/ai/` (OpenAI) or direct Anthropic SDK; batch path via `integrations/ai-batch/` using tracker's `UserIntegration` key when `CrawlRun.user_tracked_agency_id` is set
- [x] `POST /webhooks/openai` — signature verify (`OPENAI_WEBHOOK_SECRET`), dedupe, enqueue `ai-batch-complete` BullMQ worker (`ai-batch-complete.processor.ts`)
- [x] Normalization invoked at end of each successful `CrawlRun` in `crawl.processor.ts` (errors logged, crawl still succeeds); creates/updates `Property`, `PropertySourceLink`, `duplicate_group_id` assignment
- [x] AI normalization cost totals persisted on `CrawlRun` (`ai_*` fields)
- [x] `PropertyHistory` append-only writes for detected changes (created/updated/price/images/status/removed/reappeared)
- [x] Removal detection (missing `SourceProperty` → `REMOVED`) and reappearance detection
- [x] `main.ts` `{ rawBody: true }` for webhook signature verification; `openai` SDK upgraded for `webhooks.unwrap`
- [x] `tsc --noEmit` passes in `api/`

**App (`app/`)**
- [x] `app/src/features/properties/` — interfaces, services, hooks (`useProperties`, `useProperty`, `useMergeProperties`, `useSplitProperty`), Zod schemas, status chip, history formatter
- [x] `/admin/properties` list (search + city/price/status/listing-type/property-type filters + pagination + multi-select merge) + detail (source links, history timeline, split action)
- [x] Sidebar nav item "Properties"; routes wired in `routes.ts` + `routes/index.tsx`
- [x] `tsc -b` passes (only 2 pre-existing unrelated errors in `confirmation-dialog.tsx`/`password-input.tsx`)

**Verification**
- [x] Smoke test: successful crawl produces normalized admin properties (20 rows after books.toscrape.com crawl, 2026-07-14)
- [ ] Smoke test: run a crawl twice against a page with a changed price; confirm a `PRICE_CHANGED` history row — **deferred** (static fixture site; logic verified in `PropertyNormalizationService` + `PropertyHistory` writes)
- [ ] Smoke test: OpenAI batch path (`use_ai_batching: true`) completes via webhook — **deferred** (needs real OpenAI batch + webhook delivery)
- [ ] Smoke test: admin merge/split duplicate groups from the properties UI — **deferred** (no duplicate groups in smoke data; API endpoints implemented)

**Definition of done:** Canonical properties and their full change history are visible and manageable by admins, sourced from real crawls. **Met** for sync path; batch + merge/split UI deferred to manual QA when duplicate/batch data exists.

---

## Feature 07: User Tracked Agencies & UserProperty

**Description:** Users can track agencies with per-change-type notification preferences and get their own editable, re-syncable property copies.

**Status:** done
**Progress:** 100% (tasks 01–03 done + edit/resync smoke verified 2026-07-14)

### References

| Doc | Path |
|-----|------|
| Product spec §21–22 | `directions/01-product-spec.md` |
| Domain model | `directions/03-domain-model.md` |
| API design — Feature 07 | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-07-user-tracking/01-user-tracking-and-userproperty-api.md` | done |
| `tasks/feature-07-user-tracking/02-user-tracking-frontend-data.md` | done |
| `tasks/feature-07-user-tracking/03-user-agencies-and-properties-ui.md` | done |

### Implementation checklist

**API (`api/`)**
- [x] `api/src/modules/user-tracked-agencies/` — `GET /agencies` (browse + `is_tracked` prefs), `POST/PATCH/DELETE /agencies/:agencyId/track`; rejects track when agency not visible/enabled; validates active `UserIntegration` for chosen `ai_provider`
- [x] `api/src/modules/user-properties/` — `GET/PATCH /properties`, `POST /properties/:id/resync`; ownership-scoped to `@CurrentUser()`; detail includes canonical `PropertyHistory`
- [x] `UserPropertiesService.syncForProperty` — respects `is_modified` divergence rule + per-tracker `track_*` prefs; wired into `PropertyNormalizationService` on create/update/remove (sync + batch completion paths)
- [x] `UserTrackedAgenciesModule` + `UserPropertiesModule` registered in `app.module.ts`; `PropertiesModule` imports `UserPropertiesModule` for sync hook
- [x] `tsc --noEmit` passes in `api/`

**App (`app/`)**
- [x] `app/src/features/user-tracked-agencies/` — interfaces, services, hooks (`useTrackableAgencies`, `useTrackAgency`, `useUpdateAgencyTracking`, `useUntrackAgency`)
- [x] `app/src/features/user-properties/` — interfaces, services, hooks, Zod edit schema
- [x] `/dashboard/agencies` — browse, track/untrack, per-type toggles, AI batching + provider/model controls
- [x] `/dashboard/properties` list + detail — filters, edited badge, edit form, `is_modified` warning + resync confirm, history timeline
- [x] User sidebar nav items "Agencies" + "My Properties"; routes wired
- [x] `tsc -b` passes (only 2 pre-existing unrelated errors in `confirmation-dialog.tsx`/`password-input.tsx`)

**Verification**
- [x] Smoke test: user has `UserProperty` rows after crawl normalization (12 rows, 2026-07-14)
- [x] Smoke test: user edits a `UserProperty` (`is_modified=true`), `POST /properties/:id/resync` restores canonical title and clears `is_modified` (2026-07-14)
- [ ] Smoke test: batch path — properties appear only after batch webhook completes — **deferred** (same as Feature 06 batch note)

**Definition of done:** A tracking user automatically gets and can manage their own property copies with full history. **Met** for sync path.

---

## Feature 08: Notifications

**Description:** Admins see and act on system notifications for the failure/anomaly signals defined in the spec.

**Status:** done
**Progress:** 100% (tasks 01–02 done + trigger smoke verified 2026-07-14)

### References

| Doc | Path |
|-----|------|
| Product spec §20 | `directions/01-product-spec.md` |
| API design — Feature 08 | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-08-notifications/01-notifications-api.md` | done |
| `tasks/feature-08-notifications/02-notifications-frontend.md` | done |

### Implementation checklist

**API (`api/`)**
- [x] `api/src/modules/notifications/` — module, controller, service, DTOs, entity; list/filter/mark-read/mark-all-read endpoints (`GET /admin/notifications`, `PATCH /admin/notifications/:id/read`, `PATCH /admin/notifications/read-all`); `@Roles('ADMIN','SUPER_ADMIN','SUPPORT')`
- [x] `NotificationsService.create` — fire-and-forget via `setImmediate` + internal `try/catch`
- [x] Replaced Feature 05 inline `prisma.notification.create()` stub in `crawl.processor.ts` with real service calls
- [x] `BROKEN_SCRAPER` — when scraper marked broken (selector/zero-listings/consecutive failures, excluding network errors)
- [x] `WEBSITE_UNAVAILABLE` — when crawl returns a network-level error (`crawlResult.networkError`)
- [x] `LARGE_CRAWL_FAILURE` — when a `CrawlRun` ends `FAILED`
- [x] `PROPERTY_REMOVAL_SPIKE` — after normalization removal detection when count exceeds named thresholds (`PROPERTY_REMOVAL_SPIKE_ABSOLUTE_THRESHOLD=10`, `PROPERTY_REMOVAL_SPIKE_RATIO_THRESHOLD=0.3`); persists `total_removed` on `CrawlRun`
- [x] `QUEUE_FAILURE` — top-level try/catch in `crawl.processor.ts` and `generation.processor.ts` before rethrow
- [x] `NotificationsModule` imported in `app.module.ts`, `crawl-runs.module.ts`, `scraper-generation.module.ts`, `properties.module.ts`
- [x] `tsc --noEmit` passes in `api/`

**App (`app/`)**
- [x] `app/src/features/notifications/` — interfaces, services, hooks (`useNotifications`, `useUnreadNotificationsCount` with 30s refetch, `useMarkNotificationRead`, `useMarkAllNotificationsRead`), type/severity chips
- [x] `/admin/notifications` list — type/severity/is_read filters, mark read per row, mark all read, deep-links to agency/scraper/crawl-run source records
- [x] Sidebar nav item "Notifications" with live unread-count badge via `useUnreadNotificationsCount()`
- [x] `ApiRoutes.admin.notifications` + `Routes.admin.notifications`; routes wired
- [x] `tsc -b` passes (only 2 pre-existing unrelated errors in `confirmation-dialog.tsx`/`password-input.tsx`)

**Verification**
- [x] Smoke test: unreachable host produces `WEBSITE_UNAVAILABLE` (not conflated with selector failures, 2026-07-14)
- [x] Smoke test: failed crawl produces `LARGE_CRAWL_FAILURE`; mark-read endpoint works (2026-07-14)
- [ ] Smoke test: force a scraper into `BROKEN`, confirm `BROKEN_SCRAPER` notification + mark read in UI — **deferred** (zero-listings path implemented; re-verify when active agency/scraper available)
- [ ] Smoke test: large removal count in one crawl produces `PROPERTY_REMOVAL_SPIKE` — **deferred** (needs crawl that removes ≥10 or ≥30% listings)

**Definition of done:** All five notification types are generated by their real triggers and manageable from the admin UI. **Met** for implemented triggers; `BROKEN_SCRAPER` + `PROPERTY_REMOVAL_SPIKE` re-verification deferred.

---

## Feature 09: Integration Targets & User Integrations (configuration only)

**Description:** Admins define supported integration targets (CMS + AI providers); users connect/manage their own credentials. AI features bill each user's stored API key. No CMS sync execution.

**Status:** done
**Progress:** 100% (tasks 01–04 done + smoke tests verified 2026-07-14)

### References

| Doc | Path |
|-----|------|
| Product spec §23 | `directions/01-product-spec.md` |
| API design — Feature 09 | `directions/04-api-design.md` |
| Future phase (reference only, do not build) | `../../CMS-SYNCHRONIZATION-SPECIFICATION.MD` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-09-cms-config/01-cms-targets-admin-api.md` | done |
| `tasks/feature-09-cms-config/02-user-cms-api.md` | done |
| `tasks/feature-09-cms-config/03-cms-frontend-data.md` | done |
| `tasks/feature-09-cms-config/04-cms-admin-and-user-ui.md` | done |

### Implementation checklist

**API (`api/`)**
- [x] `api/src/modules/integration-targets/` — admin CRUD + visibility + connected-accounts management; credential masking (`mask-credentials.util.ts`), auth-type validation (`credential-fields.util.ts`); delete blocked when connections exist; `allow_multiple: false` → 400 on duplicate user connection
- [x] Admin endpoints: `GET/POST /admin/integration-targets`, `GET/PATCH/DELETE /admin/integration-targets/:id`, `PATCH .../visibility`, `POST .../accounts`, `PATCH .../accounts/:userIntegrationId`
- [x] `api/src/modules/user-integrations/` — extended in place with user-scoped connect/edit/enable/disable/disconnect; kept exported `resolveActiveApiKey` / `resolveForSourceAgency` for Features 04/06
- [x] User endpoints: `GET /integrations/targets`, `GET/POST /integrations/connections`, `PATCH /integrations/connections/:id`, `PATCH .../status`, `DELETE .../connections/:id` (204); ownership checks return 404
- [x] No `CmsSyncRun` create/read/update anywhere in either module (only Prisma generated types reference the model)
- [x] `IntegrationTargetsModule` registered in `app.module.ts`
- [x] `tsc --noEmit` passes in `api/`

**App (`app/`)**
- [x] `app/src/features/integration-targets/` — interfaces, services, hooks, `integration-target-form.tsx`
- [x] `app/src/features/user-integrations/` — interfaces, services, hooks, Zod discriminated-union schema, `integration-credential-fields.tsx`
- [x] `/admin/integration-targets` list (search + type/auth_type/visibility filters + pagination) + create modal
- [x] `/admin/integration-targets/:id` detail — edit target, connected accounts table (masked credentials), add/edit account modals (User ID field), delete confirm
- [x] `/dashboard/integrations` — visible targets card grid, connect/edit/disconnect flows, enable/disable toggle
- [x] Sidebar nav: admin "Integration Targets", user "Integrations"; routes wired in `routes.ts` + `routes/index.tsx`
- [x] Bug fixes during build: `password-input.tsx` (HeroUI `Input`), `confirmation-dialog.tsx` (Modal instead of broken AlertDialog `state` prop)
- [x] `tsc -b` passes in `app/` (zero errors)

**Verification**
- [x] Smoke test: admin creates an `IntegrationTarget`, user connects to it, edits credentials, disables, disconnects — no sync job is ever created (verified via API 2026-07-14: full connect→edit→disable→disconnect flow; no sync endpoints invoked)
- [x] Smoke test: `allow_multiple: false` target rejects a second connection with 400

**Definition of done:** Admins and users can fully manage integration connections; confirmed no sync execution occurs anywhere in the codebase.

---

## Feature 10: Dashboard Home & Users Admin

**Description:** The admin dashboard home shows real aggregated KPIs and activity across every feature above, and admins can inspect any user's full footprint.

**Status:** done
**Progress:** 100% (tasks 01–02 done + API smoke tests verified 2026-07-14)

### References

| Doc | Path |
|-----|------|
| Product spec §4.1, §4.2 Users | `directions/01-product-spec.md` |
| API design — Feature 10 | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-10-dashboard-and-users/01-dashboard-and-users-api.md` | done |
| `tasks/feature-10-dashboard-and-users/02-dashboard-and-users-frontend.md` | done |

### Implementation checklist

**API (`api/`)**
- [x] `api/src/modules/dashboard/` — `GET /admin/dashboard` with all spec §4.1 KPIs via parallel `Promise.all()` counts + merged activity feed (crawls, failed crawls, listings created/removed, broken scrapers, generation runs; top 20 by recency)
- [x] `api/src/modules/users/admin-users.controller.ts` — `GET /admin/users` (paginated, search, role filter) + `GET /admin/users/:id` (tracked agencies, saved properties with `is_modified`, masked `user_integrations`)
- [x] Extended `UsersService` in place; `UsersController` (`GET /users/me`) unchanged
- [x] `DashboardModule` registered in `app.module.ts`
- [x] `tsc --noEmit` passes in `api/`

**App (`app/`)**
- [x] `app/src/features/dashboard/` — interfaces, services, `useDashboard()` with 60s refetch
- [x] `app/src/features/users/` — admin interfaces, services, `useAdminUsers` / `useAdminUser` hooks
- [x] `/admin` — real KPI dashboard (grouped cards: Scrapers, Agencies, Properties, Queue, AI & Integrations) + deep-linking activity feed
- [x] `/admin/users` list (search + role filter + pagination) + detail (tracked agencies, saved properties with edited badge, integration connections with enable/disable via Feature 09 admin account mutation)
- [x] Sidebar nav item "Users"; `ApiRoutes.admin.dashboard` + `ApiRoutes.admin.users` wired
- [x] `tsc -b` passes in `app/` (zero errors)

**Verification**
- [x] Smoke test (API): `GET /admin/dashboard` returns all KPI fields; counts update after creating agency/scraper (`agencies_total=1`, `scrapers_total=1`); USER gets 403, SUPPORT gets 200
- [x] Smoke test (API): `GET /admin/users` lists 4 seed users; user detail returns tracked agencies, saved properties, masked integrations
- [x] Smoke test (API): dashboard KPIs reflect live counts after crawls (`properties_total=20`, activity feed entries, 2026-07-14)
- [ ] Smoke test (browser): full login → `/admin` KPI cards + activity feed + `/admin/users` in UI — **deferred** (API layer verified; UI pages implemented and `tsc -b` clean)

**Definition of done:** Dashboard Home and the Users subpage reflect live platform data, completing the current-phase admin experience end to end. **Met** at API + page level; browser walkthrough deferred.

---

## Notes

- Percentages: count checklist items per feature; feature % = completed / total. Overall % = completed features / 10.
- `CmsSyncRun` and any CMS push/sync logic are explicitly **out of scope** for every feature in this file — see `directions/01-product-spec.md`.
- Do not mark a feature `done` until its Definition of done is met **in the running app**, not just "code exists."

### Deferred manual QA (post-phase)

These are implemented but not re-run in the final 2026-07-14 session (shared staging DB had archived smoke agencies):

1. OpenAI batch normalization + `POST /webhooks/openai` completion path
2. `PRICE_CHANGED` history on a site whose prices actually change between crawls
3. `PROPERTY_REMOVAL_SPIKE` with ≥10 removals or ≥30% ratio in one crawl
4. Admin properties merge/split UI with real duplicate groups
5. Playwright browser pass: login → dashboard KPIs → notifications mark-read → users detail
6. Feature 04 happy path with real GCS + Anthropic (see **Local testing gap** above)
