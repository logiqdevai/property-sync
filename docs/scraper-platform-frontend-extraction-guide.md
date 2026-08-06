# Scraper Platform — Frontend UI & Features Extraction Guide

> **Purpose:** Complete technical map of the React admin UI and `app/src/features/` data layer for the scraper-generation and scraper-execution system. Companion to `docs/scraper-platform-extraction-guide.md` (backend).
>
> **Scope:** Generation Runs, Scrapers, Crawl Runs, Jobs, Diagnostics, Crawler Config, supporting Agencies UI, admin dashboard KPIs, routes, hooks, services, types, and shared components.
>
> **Stack:** React + Vite + React Router + TanStack Query + HeroUI v3 + axios + Zod + React Hook Form.

---

## Table of Contents

1. [Frontend Architecture Overview](#1-frontend-architecture-overview)
2. [Project Conventions (Must Preserve)](#2-project-conventions-must-preserve)
3. [Route & Navigation Map](#3-route--navigation-map)
4. [Feature Modules — Complete Inventory](#4-feature-modules--complete-inventory)
5. [Pages & Components — Complete Inventory](#5-pages--components--complete-inventory)
6. [Generation Runs UI](#6-generation-runs-ui)
7. [Scrapers UI](#7-scrapers-ui)
8. [Crawl Runs UI](#8-crawl-runs-ui)
9. [Jobs UI](#9-jobs-ui)
10. [Diagnostics UI](#10-diagnostics-ui)
11. [Crawler Config UI](#11-crawler-config-ui)
12. [Supporting UI (Agencies, Dashboard)](#12-supporting-ui-agencies-dashboard)
13. [API Client Layer](#13-api-client-layer)
14. [State Management & Data Fetching](#14-state-management--data-fetching)
15. [Real-Time Updates (Polling)](#15-real-time-updates-polling)
16. [Dropdown & Label Constants](#16-dropdown--label-constants)
17. [Shared UI Components Required](#17-shared-ui-components-required)
18. [Generic vs Domain-Specific UI](#18-generic-vs-domain-specific-ui)
19. [Frontend Dependency Graph](#19-frontend-dependency-graph)
20. [Extraction Plan (Frontend)](#20-extraction-plan-frontend)
21. [Hidden / Easy-to-Miss Dependencies](#21-hidden--easy-to-miss-dependencies)

---

## 1. Frontend Architecture Overview

The scraper admin UI follows a strict **data/UI separation**:

```
app/src/
├── features/<domain>/          ← DATA ONLY (hooks, services, interfaces, schemas)
│   ├── hooks/
│   ├── services/
│   ├── interfaces/
│   └── validation-schemas/
├── pages/admin/<domain>/       ← UI ONLY (pages + local components)
│   ├── index.tsx               ← list page
│   ├── detail.tsx              ← detail page
│   └── components/             ← page-local chips, forms
├── config/
│   ├── api/routes.ts           ← ApiRoutes (backend paths)
│   └── constants/dropdowns/    ← enum labels for filters/chips
├── routes/
│   ├── routes.ts               ← Routes (frontend paths)
│   └── index.tsx               ← React Router wiring
└── components/
    ├── layout/                 ← AdminLayout, sidebar
    └── ui/                     ← shared primitives
```

**Data flow:**

```
Page component
  → feature hook (useQuery / useMutation)
    → feature service (axios call)
      → ApiRoutes.admin.*
        → NestJS API
```

**Auth:** All scraper admin routes require `ADMIN`, `SUPER_ADMIN`, or `SUPPORT` role via nested `ProtectedRoute` in `app/src/routes/index.tsx`.

**No WebSocket/SSE** for scraper features — active runs poll via TanStack Query `refetchInterval`.

---

## 2. Project Conventions (Must Preserve)

From `app/.cursor/rules/app-code-structure-and-best-practices.mdc` and `app/AGENTS.md`:

| Rule | Implication for extraction |
|------|---------------------------|
| Features are **data-only** — no React components in `features/` | Move UI with pages, not features |
| All frontend paths via `Routes` object | Extract `routes/routes.ts` scraper section |
| All API paths via `ApiRoutes` object | Extract `config/api/routes.ts` scraper section |
| Enum labels in `config/constants/dropdowns/` | Extract `dropdowns/scrapers/*`, `dropdowns/jobs/*`, `dropdowns/agencies/crawl-run-status-filter.options.ts` |
| Chips use `getDropdownOptionLabel()` from `@/lib/dropdown-option-label.utils.ts` | Include this util |
| Loading: HeroUI `Skeleton` / `DetailSkeleton` / `TableSkeleton` — never "Loading..." text | Include skeleton components |
| Destructive actions: `ConfirmationDialog` + `useOverlayState()` | Include confirmation dialog |
| Modals: `Modal.Backdrop` → `Modal.Container` → `Modal.Dialog` (HeroUI v3) | Verify modal nesting in extracted pages |
| Mutations: always `toast()` on success/error + `invalidateQueries` | Preserve hook patterns |
| `@/` path alias for all imports | Configure in Vite/tsconfig of new project |

---

## 3. Route & Navigation Map

### 3.1 Frontend Routes

Defined in `app/src/routes/routes.ts`:

| Route key | Path | Page component |
|-----------|------|----------------|
| `Routes.admin.generationRuns.list` | `/admin/generation-runs` | `GenerationRunsListPage` |
| `Routes.admin.generationRuns.detail(id)` | `/admin/generation-runs/:id` | `GenerationRunDetailPage` |
| `Routes.admin.scrapers.list` | `/admin/scrapers` | `ScrapersListPage` |
| `Routes.admin.scrapers.detail(id)` | `/admin/scrapers/:id` | `ScraperDetailPage` |
| `Routes.admin.crawlRuns.list` | `/admin/crawl-runs` | `CrawlRunsListPage` |
| `Routes.admin.crawlRuns.detail(id)` | `/admin/crawl-runs/:id` | `CrawlRunDetailPage` |
| `Routes.admin.jobs.list` | `/admin/jobs` | `JobsListPage` |
| `Routes.admin.jobs.detail(id)` | `/admin/jobs/:id` | `JobDetailPage` |
| `Routes.admin.diagnostics.list` | `/admin/diagnostics` | `DiagnosticsListPage` |
| `Routes.admin.diagnostics.detail(id)` | `/admin/diagnostics/:id` | `DiagnosticsDetailPage` |
| `Routes.admin.crawlerConfig` | `/admin/crawler-config` | `CrawlerConfigPage` |
| `Routes.admin.agencies.list` | `/admin/agencies` | `AgenciesListPage` |
| `Routes.admin.agencies.detail(id)` | `/admin/agencies/:id` | `AgencyDetailPage` |
| `Routes.admin.root` | `/admin` | `AdminDashboardPage` |

Wired in `app/src/routes/index.tsx` lines 104–126 under `/admin/*` layout with role guard.

### 3.2 Sidebar Navigation

File: `app/src/components/layout/admin-sidebar-content.tsx`

Scraper-related nav items:

| Label | Icon | Route |
|-------|------|-------|
| Generation Runs | `Sparkles` | `Routes.admin.generationRuns.list` |
| Scrapers | `Bot` | `Routes.admin.scrapers.list` |
| Crawl Runs | `Activity` | `Routes.admin.crawlRuns.list` |
| Job Queue | `ListTodo` | `Routes.admin.jobs.list` |
| Diagnostics | `FileSearch` | `Routes.admin.diagnostics.list` |
| App Config | `Settings` | `Routes.admin.crawlerConfig` |
| Agencies | `Building2` | `Routes.admin.agencies.list` |

### 3.3 Cross-Links Between Pages

| From | To | Trigger |
|------|-----|---------|
| Scraper detail | Crawl run detail | "Run now" success → `navigate(Routes.admin.crawlRuns.detail(run.id))` |
| Scraper detail | Generation run detail | Recent generation runs table row click |
| Scraper detail | Agency detail | Agency name link |
| Generation run detail | Scraper detail | Scraper name link (if `scraper_id` set) |
| Crawl run detail | Diagnostics detail | Diagnostics package link (if present) |
| Crawl run detail | Job detail | Job log row click |
| Agency detail | Scraper list/detail | Recent scrapers section |
| Agency detail | Crawl run detail | Recent crawl runs section |
| Admin dashboard | All above | Activity feed links via `resolveActivityLink()` |

---

## 4. Feature Modules — Complete Inventory

Feature modules live under `app/src/features/`. Each follows: `hooks/`, `services/`, `interfaces/`, optional `validation-schemas/`.

### 4.1 `features/scraper-generation/` — **Required**

| File | Exports | Purpose |
|------|---------|---------|
| `interfaces/scraper-generation.interfaces.ts` | `GenerationRunStatuses`, `GenerationTriggers`, `ComputerActionTypes`, `GenerationRun`, `ComputerUseStep`, DTOs, `GenerationRunListQuery`, `PaginatedResponse` | TypeScript types mirroring API |
| `services/scraper-generation.services.ts` | `getGenerationRuns`, `getGenerationRun`, `createGenerationRun`, `approveGenerationRun`, `rejectGenerationRun`, `cancelGenerationRun`, `retryGenerationRun`, `deleteGenerationRun` | axios wrappers |
| `hooks/use-scraper-generation.ts` | `useGenerationRuns`, `useGenerationRun`, `useCreateGenerationRun`, `useApproveGenerationRun`, `useRejectGenerationRun`, `useCancelGenerationRun`, `useRetryGenerationRun`, `useDeleteGenerationRun` | TanStack Query |
| `validation-schemas/scraper-generation.schema.ts` | `createGenerationRunFormSchema`, `CreateGenerationRunFormValues` | Zod form validation |

**Imports from:** pages under `pages/admin/generation-runs/`, `pages/admin/scrapers/` (embedded generate form)

**API routes used:** `ApiRoutes.admin.generationRuns.*`

**Query keys:** `["generationRuns", "list", query]`, `["generationRuns", "detail", id]`

**Polling:** `useGenerationRun` — 2000ms when status `QUEUED` or `RUNNING`

**Invalidations on mutation:** `["generationRuns"]`, often also `["scrapers"]`

---

### 4.2 `features/scrapers/` — **Required**

| File | Exports | Purpose |
|------|---------|---------|
| `interfaces/scrapers.interfaces.ts` | `ScraperStatuses`, `ScraperHealths`, `DiagnosticsModes`, `ScraperVersionCreatedBys`, `Scraper`, `ScraperVersion`, CRUD DTOs, `ScraperListQuery` | Types |
| `services/scrapers.services.ts` | `getScrapers`, `getScraper`, `createScraper`, `getScraperVersions`, `createScraperVersion`, `activateScraperVersion`, `updateScraper`, `runScraperNow`, `deleteScraper`, `deleteScrapers` | axios wrappers |
| `hooks/use-scrapers.ts` | Matching `use*` hooks for all service functions | TanStack Query |
| `validation-schemas/scrapers.schema.ts` | `createScraperFormSchema`, `createScraperVersionFormSchema`, `parseOptionalJsonConfig`, `parseOptionalNormalizeLimit` | Zod + JSON helpers |

**Cross-import:** `scrapers.services.ts` imports `CrawlRun` type from `features/crawl-runs/interfaces/` (for `runScraperNow` return type)

**Query keys:** `["scrapers", "list", query]`, `["scrapers", "detail", id]`, `["scrapers", "versions", id]`

**Invalidations:** Mutations invalidate `["scrapers"]`; `useRunScraperNow` also invalidates `["crawlRuns"]`

---

### 4.3 `features/crawl-runs/` — **Required**

| File | Exports | Purpose |
|------|---------|---------|
| `interfaces/crawl-runs.interfaces.ts` | `CrawlRunStatuses`, `CrawlRun`, `CrawlRunDetail`, `ScraperExecutionTrace`, `CrawlRunJobLogSummary`, `CrawlRunPropertyHistoryEntry`, `CrawlRunCmsSyncRunSummary`, list query, pagination types | Types |
| `services/crawl-runs.services.ts` | `getCrawlRuns`, `getCrawlRun`, `rerunCrawlRun`, `cancelCrawlRun`, `deleteCrawlRun`, `deleteCrawlRuns` | axios wrappers |
| `hooks/use-crawl-runs.ts` | `useCrawlRuns`, `useCrawlRun`, `useRerunCrawlRun`, `useCancelCrawlRun`, `useDeleteCrawlRun`, `useDeleteCrawlRuns` | TanStack Query |

**Domain coupling in interfaces:** `CrawlRunDetail` includes `property_history`, `cms_sync_runs` — refactor for generic platform (see §18)

**Query keys:** `["crawlRuns", "list", query]`, `["crawlRuns", "detail", id]`

**Polling:** `useCrawlRun` — 2000ms when `QUEUED` or `RUNNING`

**List response extra field:** `total_cost` (AI cost aggregate) — domain-specific

---

### 4.4 `features/jobs/` — **Required**

| File | Exports | Purpose |
|------|---------|---------|
| `interfaces/jobs.interfaces.ts` | `JobStatuses`, `JobLog`, `JobLogListQuery`, `DeleteJobsPayload`, pagination | Types |
| `services/jobs.services.ts` | `getJobs`, `getJob`, `retryJob`, `stopJob`, `deleteJob`, `deleteJobs` | axios wrappers |
| `hooks/use-jobs.ts` | `useJobs`, `useJob`, `useRetryJob`, `useStopJob`, `useDeleteJob`, `useDeleteJobs` | TanStack Query |

**Query keys:** `["jobs", "list", query]`, `["jobs", "detail", id]`

**Polling:** Both list and detail poll 2000ms when any job has status `WAITING`, `ACTIVE`, `DELAYED`, or `PAUSED`

**Cancel crawl invalidates:** `useCancelCrawlRun` invalidates `["jobs"]`

---

### 4.5 `features/diagnostics/` — **Required**

| File | Exports | Purpose |
|------|---------|---------|
| `interfaces/diagnostics.interfaces.ts` | `DiagnosticsArtifactKinds`, `DiagnosticsPackage`, `DiagnosticsPackageDetail`, `DiagnosticsListQuery` | Types; reuses `DiagnosticsMode` from scrapers interfaces |
| `services/diagnostics.services.ts` | `getDiagnosticsPackages`, `getDiagnosticsPackage` | axios wrappers |
| `hooks/use-diagnostics.ts` | `useDiagnosticsPackages`, `useDiagnosticsPackage` | TanStack Query (no polling) |

**Query keys:** `["diagnostics", "list", query]`, `["diagnostics", "detail", id]`

**Detail response:** Artifacts include pre-signed `url` for download

---

### 4.6 `features/platform-config/` — **Required (partial)**

| File | Exports | Purpose |
|------|---------|---------|
| `interfaces/platform-config.interfaces.ts` | `PlatformConfig`, `UpdatePlatformConfigPayload`, `TranslationProviders` | Types |
| `services/platform-config.services.ts` | `getPlatformConfig`, `updatePlatformConfig` | axios wrappers |
| `hooks/use-platform-config.ts` | `usePlatformConfig`, `useUpdatePlatformConfig` | TanStack Query |
| `validation-schemas/crawler-config-fields.schema.ts` | Crawler field Zod schema | Form validation for crawler config page |

**Extract crawler fields only** for generic platform. Translation/cost fields are domain-specific.

**Query key:** `["platformConfig"]`

---

### 4.7 `features/agencies/` — **Partial (target management + block rules)**

| File | Exports | Purpose |
|------|---------|---------|
| `interfaces/agencies.interfaces.ts` | `SourceAgency`, `BlockRule`, `BlockSignal`, `BlockRuleSource`, CRUD DTOs | Target site + bot-block rules |
| `services/agencies.services.ts` | Agency CRUD | axios wrappers |
| `hooks/use-agencies.ts` | Agency query/mutation hooks | TanStack Query |
| `validation-schemas/agencies.schema.ts` | Agency form schemas | Zod |

**Used by:** Generation run create form (agency picker), scraper create form, crawl run filters, agency detail (block rules editor, crawl interval)

**Rename for generic platform:** `SourceAgency` → `ScrapeTarget`, `source_agency_id` → `target_id`

---

### 4.8 `features/dashboard/` — **Optional (admin overview)**

| File | Scraper-related content |
|------|------------------------|
| `interfaces/dashboard.interfaces.ts` | KPIs: `scrapers_total`, `scrapers_active`, `scrapers_broken`, `running_crawls`, `failed_crawls_24h`, `queue_*`, `active_generation_runs`; Activity feed types: `crawl`, `crawl_failed`, `scraper_broken`, `generation` |
| `hooks/use-dashboard.ts` | Polls every 60s |
| `services/dashboard.services.ts` | `GET /admin/dashboard` |

**Domain KPIs to remove:** `properties_*`, `agencies_*` (or rename)

---

### 4.9 Features NOT Required for Generic Scraper Platform

| Feature module | Reason |
|----------------|--------|
| `features/properties/` | Real-estate property management |
| `features/source-properties/` | Scraped listing storage UI |
| `features/user-properties/` | User property copies |
| `features/cms-sync-runs/` | CMS sync UI (used in crawl detail — domain) |
| `features/cost-logs/` | AI cost tracking |
| `features/notifications/` | Optional — alerts for broken scrapers |
| `features/estateweb/` | EstateWeb integration |
| `features/user-tracked-agencies/` | User tracking preferences |
| `features/websocket/` | Chat only — not used by scraper UI |
| `features/content-publishing/` | Content pipeline |
| `features/integration-targets/` | Integration admin |
| `features/user-integrations/` | User integrations |

---

## 5. Pages & Components — Complete Inventory

### 5.1 Generation Runs — `pages/admin/generation-runs/`

| File | Component | Purpose | Required |
|------|-----------|---------|----------|
| `index.tsx` | `GenerationRunsListPage` | Paginated table, filters (status, trigger, agency), create modal | Yes |
| `detail.tsx` | `GenerationRunDetailPage` | Metadata, approve/reject/cancel/retry/delete, step replay with screenshot lightbox, staged config JSON | Yes |
| `components/create-generation-run-form.tsx` | `CreateGenerationRunForm` | Agency select, optional scraper_id, prompt, max_steps | Yes |
| `components/generation-run-status-chip.tsx` | `GenerationRunStatusChip` | Status badge with color map | Yes |
| `components/generation-run-trigger-chip.tsx` | `GenerationRunTriggerChip` | Trigger badge | Yes |

**Duplicate copies under `pages/admin/scrapers/components/`** — same components reused on scraper detail page. Extract one set or keep both folders in sync.

---

### 5.2 Scrapers — `pages/admin/scrapers/`

| File | Component | Purpose | Required |
|------|-----------|---------|----------|
| `index.tsx` | `ScrapersListPage` | Search, status/health/agency filters, bulk delete, create modal | Yes |
| `detail.tsx` | `ScraperDetailPage` | Status/health/diagnostics/self-heal toggles, version CRUD + compare, run now, generate/fix AI, recent runs | Yes |
| `components/scraper-form.tsx` | `ScraperForm` | Create scraper (agency, name, config JSON, normalize_limit) | Yes |
| `components/scraper-version-form.tsx` | `ScraperVersionForm` | New version JSON + notes | Yes |
| `components/scraper-status-chip.tsx` | `ScraperStatusChip` | Status badge | Yes |
| `components/scraper-health-chip.tsx` | `ScraperHealthChip` | Health badge | Yes |
| `components/crawl-run-status-chip.tsx` | `CrawlRunStatusChip` | Embedded recent crawl runs | Yes |
| `components/generation-run-status-chip.tsx` | duplicate | Embedded recent generation runs | Yes |
| `components/generation-run-trigger-chip.tsx` | duplicate | Embedded recent generation runs | Yes |
| `components/create-generation-run-form.tsx` | duplicate | Generate/fix modal on scraper detail | Yes |
| `hooks/use-debounced-value.ts` | `useDebouncedValue` | Search debounce on list page | Yes |

---

### 5.3 Crawl Runs — `pages/admin/crawl-runs/`

| File | Component | Purpose | Required |
|------|-----------|---------|----------|
| `index.tsx` | `CrawlRunsListPage` | Filters (status, agency, scraper, user, date range), bulk delete, total cost column | Partial (remove cost/user filters for generic) |
| `detail.tsx` | `CrawlRunDetailPage` | Stop/rerun/delete, execution traces accordion, job logs table, diagnostics link, **domain sections:** CMS sync results, property history, AI cost | Partial |
| `components/crawl-run-status-chip.tsx` | `CrawlRunStatusChip` | Status badge | Yes |
| `components/job-status-chip.tsx` | `JobStatusChip` | Embedded job log status | Yes |

**Domain sections in `detail.tsx` to remove/refactor:**
- `getCrawlUserProperties()` — CMS sync operation results
- `property_history` accordion
- AI cost / batch metadata display
- Imports from `features/properties/utils/format-property-history`
- `PropertyHistorySummary` component

---

### 5.4 Jobs — `pages/admin/jobs/`

| File | Component | Purpose | Required |
|------|-----------|---------|----------|
| `index.tsx` | `JobsListPage` | Filters (status, queue, date), bulk delete, retry failed | Yes |
| `detail.tsx` | `JobDetailPage` | Payload/result JSON viewers, stop/retry/delete | Yes |
| `components/job-status-chip.tsx` | `JobStatusChip` | Status badge | Yes |

---

### 5.5 Diagnostics — `pages/admin/diagnostics/`

| File | Component | Purpose | Required |
|------|-----------|---------|----------|
| `index.tsx` | `DiagnosticsListPage` | Filters (scraper, crawl run, date range) | Yes |
| `detail.tsx` | `DiagnosticsDetailPage` | Package metadata + artifact download links (trace, screenshot, HTML, console, HAR, video) | Yes |
| `components/diagnostics-mode-chip.tsx` | `DiagnosticsModeChip` | Mode badge | Yes |
| `components/artifact-kind-chip.tsx` | `ArtifactKindChip` | Artifact type badge | Yes |

---

### 5.6 Crawler Config — `pages/admin/crawler-config/`

| File | Component | Purpose | Required |
|------|-----------|---------|----------|
| `index.tsx` | `CrawlerConfigPage` | Platform crawler tuning form (tabs) | Yes (crawler tab only) |
| `components/notification-settings-panel.tsx` | `NotificationSettingsPanel` | Notification settings tab | Optional |

Uses `usePlatformConfig`, `useUpdatePlatformConfig`, `crawler-config-fields.schema.ts`.

---

### 5.7 Agencies (Supporting) — `pages/admin/agencies/`

| File | Scraper relevance | Required |
|------|-------------------|----------|
| `index.tsx` | Agency list — linked from scraper/generation filters | Partial |
| `detail.tsx` | Recent scrapers + crawl runs, block rules editor, crawl interval | Partial |
| `components/block-rules-editor.tsx` | Per-target bot-block rules | **Yes** (generic) |
| `components/agency-crawl-interval-panel.tsx` | Cron schedule editor | Yes |
| `components/agency-form.tsx` | Create/edit agency (base_url) | Partial |
| `components/crawl-run-status-chip.tsx` | duplicate | Yes |
| `components/scraper-status-chip.tsx` | duplicate | Yes |
| `hooks/use-debounced-value.ts` | duplicate | Yes |

---

### 5.8 Admin Dashboard — `pages/admin/dashboard/`

| File | Scraper relevance | Required |
|------|-------------------|----------|
| `index.tsx` | KPI cards (scrapers, crawls, queue, generation runs), activity feed, Bull Board button | Optional |
| `components/system-health-section.tsx` | System health display | Optional |

**Bull Board:** Opens `ApiRoutes.admin.queues.bullBoard` (`/admin/queues`) in new tab — backend UI, not React.

---

## 6. Generation Runs UI

### 6.1 List Page Flow

`GenerationRunsListPage` (`pages/admin/generation-runs/index.tsx`):

1. Local state: `page`, `limit`, filter values (status, trigger, agency)
2. `useGenerationRuns(query)` — no list polling
3. HeroUI `Table` with columns: agency, trigger, status, steps count, duration, created
4. Row click → `navigate(Routes.admin.generationRuns.detail(id))`
5. "Create" button → modal with `CreateGenerationRunForm`
6. Filters use dropdown options from `config/constants/dropdowns/scrapers/`

### 6.2 Detail Page Flow

`GenerationRunDetailPage` (`pages/admin/generation-runs/detail.tsx`):

1. `useGenerationRun(id)` — **polls 2s** while active
2. Header: agency name, trigger chip, status chip, spinner when active
3. Actions by status:
   - **QUEUED/RUNNING:** Cancel
   - **AWAITING_REVIEW:** Approve, Reject (modal with reason)
   - **FAILED/CANCELLED:** Retry (modal with error/prompt), Delete
   - **Terminal (non-active):** Delete
4. Metadata grid: scraper link, prompt, max_steps, timing, error_message
5. **Staged config:** JSON display when `AWAITING_REVIEW`
6. **Steps replay:** For each `ComputerUseStep`:
   - Step index, action_type, model_reasoning
   - Before/after screenshots (`screenshot_before_url`, `screenshot_after_url`)
   - Click opens lightbox modal
7. Approve calls `useApproveGenerationRun` → invalidates scrapers (creates version)

### 6.3 Create Form

`CreateGenerationRunForm`:
- Agency picker: loads agencies via `useAgencies` (runtime API-derived options — allowed exception)
- Optional scraper_id (pre-filled when opened from scraper detail)
- Optional prompt textarea
- Optional max_steps number input
- Submits `useCreateGenerationRun`

---

## 7. Scrapers UI

### 7.1 List Page

`ScrapersListPage`:
- Debounced search via `useDebouncedValue`
- Filters: status, health, agency
- Bulk delete with `ConfirmationDialog`
- Create modal with `ScraperForm`
- Columns: name, agency, status, health, version, last success/failure

### 7.2 Detail Page

`ScraperDetailPage` — central hub for scraper operations:

**Header actions:**
- "Generate with AI" / "Fix with AI" (when BROKEN) → generate modal
- "Run now" → `useRunScraperNow` → navigate to new crawl run
- Delete

**Settings panel (inline):**
- Status select (`ScraperStatusFormOptions`)
- Diagnostics mode select (`DiagnosticsModeFormOptions`)
- Self-healing toggle (`Switch`)
- Normalize limit input (**domain** — remove for generic)

**Version management:**
- List all versions with activate button
- Compare two versions (side-by-side JSON diff via local state)
- Create new version modal (`ScraperVersionForm`)

**Embedded recent activity:**
- Last 5 generation runs (with status/trigger chips, links to detail)
- Last 5 crawl runs (with status chips, links to detail)

---

## 8. Crawl Runs UI

### 8.1 List Page

`CrawlRunsListPage`:
- Filters: status, agency, scraper, user, date range
- Shows `total_cost` from API response (**domain**)
- Bulk delete
- Row navigation to detail

### 8.2 Detail Page

`CrawlRunDetailPage` sections:

| Section | Data source | Generic? |
|---------|-------------|----------|
| Header + actions | `CrawlRun` | Yes |
| Metadata grid | totals, timing, error | Partial (CMS totals are domain) |
| Execution traces | `execution_traces[].steps` JSON | Yes |
| Job logs | `job_logs[]` with `JobStatusChip` | Yes |
| Diagnostics link | `diagnostics_package.id` | Yes |
| CMS sync results | `cms_sync_runs[]` | **No** |
| Property history | `property_history[]` | **No** |
| AI cost / batch info | `ai_*` fields, `metadata` | **No** |

**Actions:**
- Active: Stop (cancel)
- Terminal: Rerun, Delete

---

## 9. Jobs UI

### 9.1 List Page

`JobsListPage`:
- Filters: status (`JobStatusFilterOptions`), queue (`JobQueueFilterOptions`), date range
- Polls while any visible job is active
- Bulk delete, bulk retry failed
- Queue filter includes scraper queues: `crawl`, `generation` (+ domain queues)

### 9.2 Detail Page

`JobDetailPage`:
- Displays full `JobLog`: queue_name, job_name, status, attempt, payload, result, error_message, stack_trace
- Actions: Retry, Stop (if stoppable), Delete
- Links to related crawl run if `crawl_run_id` set

---

## 10. Diagnostics UI

### 10.1 List Page

`DiagnosticsListPage`:
- Filters: scraper_id, crawl_run_id, date range
- Table: scraper, crawl run, mode, failure reason, created

### 10.2 Detail Page

`DiagnosticsDetailPage`:
- Package metadata: mode, URL, browser/playwright versions, scraper version, timing, failure_reason, exception
- Artifacts list with kind chip + download link (`artifact.url` — signed GCS URL from API)
- Artifact kinds: TRACE, SCREENSHOT, HTML_SNAPSHOT, CONSOLE_LOG, NETWORK_HAR, VIDEO

---

## 11. Crawler Config UI

`CrawlerConfigPage`:
- Tabbed layout (General / Notifications)
- General tab fields from `crawler-config-fields.schema.ts`:
  - `crawler_max_pages`
  - `crawler_page_timeout_ms`
  - `crawler_selector_timeout_ms`
  - `crawler_scroll_pause_ms`
  - `crawler_detail_concurrency`
  - `crawler_detail_delay_ms`
  - `crawler_worker_concurrency`
  - `crawler_job_timeout_ms`
  - `crawler_chromium_max_contexts_before_restart`
- Loads via `usePlatformConfig`, saves via `useUpdatePlatformConfig`
- Notification tab uses `features/notification-settings/` (**optional**)

---

## 12. Supporting UI (Agencies, Dashboard)

### 12.1 Agencies — Target Site Management

Agencies are the current UI representation of scrape targets (`SourceAgency.base_url`).

**Agency detail** (`pages/admin/agencies/detail.tsx`) scraper-related sections:
- Block rules editor (`BlockRulesEditor`) — CRUD for bot detection rules
- Crawl interval panel (`AgencyCrawlIntervalPanel`) — cron expression
- Recent scrapers list
- Recent crawl runs list
- Block handling timeout overrides

**For generic platform:** Rename "Agency" → "Target" throughout UI labels; keep block rules editor.

### 12.2 Admin Dashboard

KPI sections relevant to scrapers:
- Scrapers: total, active, broken
- Crawls: running, failed (24h)
- Queue: waiting, active, failed
- Generation: active runs

Activity feed links to crawl runs, generation runs, scrapers.

Poll interval: 60 seconds (`useDashboard`).

---

## 13. API Client Layer

### 13.1 Axios Instance

File: `app/src/config/api/axios.ts`

- Base URL from `environments.API_URL` (`VITE_API_URL`)
- JWT Bearer token from auth store (`stores/auth.ts`)
- 401 handling → redirect to sign-in

**Required for extraction.**

### 13.2 API Routes (Scraper Subset)

File: `app/src/config/api/routes.ts` — extract lines 38–94, 157–159:

```typescript
ApiRoutes.admin.scrapers.*        // list, detail, versions, activateVersion, runNow, bulkDelete
ApiRoutes.admin.generationRuns.*  // list, detail, approve, reject, cancel, retry, delete
ApiRoutes.admin.crawlRuns.*       // list, detail, rerun, cancel, bulkDelete
ApiRoutes.admin.jobs.*            // list, detail, retry, stop, bulkDelete
ApiRoutes.admin.diagnostics.*     // list, detail
ApiRoutes.admin.platformConfig.*  // root (GET/PATCH)
ApiRoutes.admin.queues.bullBoard  // /admin/queues
ApiRoutes.admin.agencies.*        // partial — target CRUD + block rules
ApiRoutes.admin.dashboard.root    // optional
```

### 13.3 Environment

File: `app/.env.template`:

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend base URL |

File: `app/src/config/environments/index.ts` — typed env access.

---

## 14. State Management & Data Fetching

### 14.1 TanStack Query Patterns

| Pattern | Usage in scraper features |
|---------|--------------------------|
| Query key hierarchy | `["entity", "list", query]` / `["entity", "detail", id]` |
| `enabled: !!id` | Detail hooks |
| `refetchInterval` | Active generation runs, crawl runs, jobs |
| `invalidateQueries` | All mutations invalidate list; detail invalidates specific id |
| Error handling | Services throw `Error(message)`; hooks show toast |

### 14.2 Local UI State (in pages)

| State | Pages |
|-------|-------|
| Pagination (page, limit) | All list pages |
| Filter values | All list pages |
| Modal open (`useOverlayState`) | Create/edit/delete confirms |
| Selection (bulk delete) | List pages |
| Compare version IDs | Scraper detail |
| Lightbox URL | Generation run detail |
| Form draft values | Reject/retry modals |

### 14.3 Global Client State

| Store | Scraper relevance |
|-------|-------------------|
| `stores/auth.ts` (Zustand) | JWT for API calls — **required** |
| WebSocket store | **Not used** by scraper features |

### 14.4 Forms

| Form | Library | Schema |
|------|---------|--------|
| Create generation run | React Hook Form + zodResolver | `createGenerationRunFormSchema` |
| Create scraper | React Hook Form + zodResolver | `createScraperFormSchema` |
| Create scraper version | React Hook Form + zodResolver | `createScraperVersionFormSchema` |
| Crawler config | React Hook Form + zodResolver | `crawler-config-fields.schema.ts` |
| Agency form | React Hook Form + zodResolver | `agencies.schema.ts` |

---

## 15. Real-Time Updates (Polling)

**No WebSocket or SSE** for scraper admin UI.

| Hook | Interval | Condition |
|------|----------|-----------|
| `useGenerationRun(id)` | 2000ms | `status === "QUEUED" \|\| status === "RUNNING"` |
| `useCrawlRun(id)` | 2000ms | `status === "QUEUED" \|\| status === "RUNNING"` |
| `useJobs(query)` | 2000ms | Any row with status in `WAITING`, `ACTIVE`, `DELAYED`, `PAUSED` |
| `useJob(id)` | 2000ms | Same active job statuses |
| `useDashboard()` | 60000ms | Always (admin dashboard) |

**List pages do NOT poll** — user must refresh or navigate to detail for live updates.

**Implication for generic platform:** Polling is sufficient; no need to port WebSocket infrastructure for scraper features.

---

## 16. Dropdown & Label Constants

All under `app/src/config/constants/dropdowns/`.

### 16.1 Scrapers Domain — `dropdowns/scrapers/`

| File | Used by |
|------|---------|
| `generation-run-status-filter.options.ts` | Generation runs list filter, `GenerationRunStatusChip` |
| `generation-trigger-filter.options.ts` | Generation runs list filter, `GenerationRunTriggerChip` |
| `scraper-status-filter.options.ts` | Scrapers list filter |
| `scraper-status-form.options.ts` | Scraper detail status select, `ScraperStatusChip` |
| `scraper-health-filter.options.ts` | Scrapers list filter, `ScraperHealthChip` |
| `diagnostics-mode-filter.options.ts` | Diagnostics list filter |
| `diagnostics-mode-form.options.ts` | Scraper detail diagnostics select, `DiagnosticsModeChip` |

### 16.2 Jobs Domain — `dropdowns/jobs/`

| File | Used by |
|------|---------|
| `job-status-filter.options.ts` | Jobs list filter, `JobStatusChip` |
| `job-queue-filter.options.ts` | Jobs list filter |

**Scraper-relevant queue IDs in filter:** `crawl`, `generation`

### 16.3 Agencies Domain — `dropdowns/agencies/`

| File | Used by |
|------|---------|
| `crawl-run-status-filter.options.ts` | Crawl runs list filter, `CrawlRunStatusChip` |
| `crawl-interval-preset.options.ts` | Agency crawl interval panel |
| `crawl-interval-builder.options.ts` | Agency crawl interval panel |

### 16.4 Shared Utility

| File | Purpose |
|------|---------|
| `app/src/lib/dropdown-option-label.utils.ts` | `getDropdownOptionLabel(options, id)` — used by all chips |

---

## 17. Shared UI Components Required

From `app/src/components/ui/`:

| Component | Used by scraper pages |
|-----------|----------------------|
| `table-skeleton.tsx` | All list pages loading state |
| `detail-skeleton.tsx` | All detail pages loading state |
| `action-button-with-pending.tsx` | All action buttons during mutations |
| `confirmation-dialog.tsx` | Delete, cancel, stop confirmations |
| `table-row-actions-menu.tsx` | Crawl runs, scrapers, jobs list bulk/row actions |
| `date-picker-field.tsx` | Crawl runs, diagnostics, jobs date filters |
| `crawl-interval-field.tsx` | Agency crawl schedule editor |
| `toast.tsx` | Mutation feedback (via `@/hooks/use-toast`) |

**Domain-specific shared UI (do NOT migrate unless needed):**

| Component | Reason |
|-----------|--------|
| `property-history-summary.tsx` | Used in crawl run detail — domain |
| `property-detail-view.tsx` | Properties admin |
| `cms-sync-run-failures-modal.tsx` | CMS sync |
| `estateweb-*` | EstateWeb integration |

### 17.1 Layout Components

| File | Purpose |
|------|---------|
| `pages/admin/layout.tsx` | Admin shell with sidebar |
| `components/layout/admin-sidebar-content.tsx` | Nav items including scraper links |

### 17.2 Utilities

| File | Purpose |
|------|---------|
| `lib/date.ts` | `formatDateTime()` |
| `lib/duration.ts` | `formatDuration()` |
| `lib/utils.ts` | `cn()` for classnames |
| `hooks/use-toast.ts` | Toast hook used by feature mutations |

---

## 18. Generic vs Domain-Specific UI

### 18.1 Generic / Directly Reusable

- Entire `features/scraper-generation/` module
- Entire `features/scrapers/` module (except `normalize_limit` UI)
- Entire `features/jobs/` module
- Entire `features/diagnostics/` module
- `features/crawl-runs/` hooks and services
- Crawl run detail: execution traces, job logs, diagnostics link, stop/rerun/delete
- Generation run detail: full step replay UI
- Scraper detail: version management, run now, generate/fix, settings toggles
- All status/trigger/mode chips and dropdown options
- Crawler config page (general tab)
- Block rules editor on agency/target detail
- Polling patterns in hooks

### 18.2 Reusable With Refactoring

| UI element | Refactor needed |
|------------|-----------------|
| All "Agency" labels | Rename to "Target" / "Site" |
| `source_agency_id` form fields | Rename to `target_id` |
| `CreateGenerationRunForm` agency picker | Retarget to generic targets API |
| `ScraperForm` | Remove `normalize_limit`; rename agency field |
| `CrawlRunsListPage` | Remove user filter, total cost column |
| `CrawlRunDetailPage` | Remove CMS sync, property history, AI cost sections |
| `CrawlRunDetail` interface | Strip domain nested types |
| `JobQueueFilterOptions` | Keep only `crawl`, `generation` queues |
| Admin dashboard KPIs | Remove property/agency counts |
| `features/platform-config/` | Extract crawler fields only from form/schema |

### 18.3 Domain-Specific (Do Not Migrate)

| UI | Location | Reason |
|----|----------|--------|
| CMS sync results table | `crawl-runs/detail.tsx` | EstateWeb push results |
| Property history accordion | `crawl-runs/detail.tsx` | Real-estate change tracking |
| `PropertyHistorySummary` | crawl run detail | Domain component |
| AI cost display | crawl runs list/detail | Normalization billing |
| `normalize_limit` field | scraper form/detail | AI normalization cap |
| Cost logs nav/page | sidebar | AI cost tracking |
| Sync runs nav/page | sidebar | CMS sync |
| Properties nav/page | sidebar | Property management |
| `format-property-history` utils | crawl run detail imports | Domain |
| `getCmsSyncOperationLabel` | crawl run detail imports | Domain |

### 18.4 Chip Duplication Note

The same chip components are **copied** into multiple page folders rather than shared from one location:

- `CrawlRunStatusChip` — in `crawl-runs/`, `scrapers/`, `agencies/`
- `GenerationRunStatusChip` / `GenerationRunTriggerChip` — in `generation-runs/`, `scrapers/`
- `JobStatusChip` — in `jobs/`, `crawl-runs/`
- `ScraperStatusChip` — in `scrapers/`, `agencies/`

Each is a thin HeroUI `Chip` wrapper with a color map + `getDropdownOptionLabel()`.

**Extraction recommendation:** Consolidate into `pages/admin/shared/components/` or `components/ui/` during migration to avoid drift.

---

## 19. Frontend Dependency Graph

### 19.1 Generation Run Page Flow

```
GenerationRunsListPage
  → useGenerationRuns({ page, limit, status, trigger, source_agency_id })
    → getGenerationRuns() → GET /admin/generation-runs
  → CreateGenerationRunForm
    → useAgencies() [runtime picker]
    → useCreateGenerationRun()
      → POST /admin/generation-runs
      → invalidate ["generationRuns"]

GenerationRunDetailPage
  → useGenerationRun(id) [poll 2s if active]
    → GET /admin/generation-runs/:id
  → useApproveGenerationRun → POST .../approve → invalidate ["scrapers"]
  → useRejectGenerationRun → POST .../reject
  → useCancelGenerationRun → POST .../cancel
  → useRetryGenerationRun → POST .../retry
  → useDeleteGenerationRun → DELETE .../:id
```

### 19.2 Scraper Page Flow

```
ScrapersListPage
  → useScrapers({ search, status, health, source_agency_id })
  → ScraperForm → useCreateScraper()

ScraperDetailPage
  → useScraper(id)
  → useScraperVersions(id)
  → useGenerationRuns({ scraper_id, limit: 5 })
  → useCrawlRuns({ scraper_id, limit: 5 })
  → useRunScraperNow() → POST .../run-now → navigate to crawl detail
  → useCreateGenerationRun() [via generate modal]
  → useUpdateScraper() [status, diagnostics_mode, self_healing_enabled]
  → useActivateScraperVersion()
  → useCreateScraperVersion()
```

### 19.3 Crawl Run Page Flow

```
CrawlRunsListPage
  → useCrawlRuns({ filters })

CrawlRunDetailPage
  → useCrawlRun(id) [poll 2s if active]
  → useRerunCrawlRun() → POST .../rerun
  → useCancelCrawlRun() → POST .../cancel → invalidate ["jobs"]
  → useDeleteCrawlRun()
  → [domain] property history, CMS sync sections
```

### 19.4 Cross-Feature Query Invalidation Map

| Mutation | Invalidates |
|----------|-------------|
| `useCreateGenerationRun` | `generationRuns` |
| `useApproveGenerationRun` | `generationRuns`, `scrapers` |
| `useRejectGenerationRun` | `generationRuns`, `scrapers` |
| `useCancelGenerationRun` | `generationRuns`, `scrapers` |
| `useDeleteGenerationRun` | `generationRuns`, `scrapers` |
| `useRunScraperNow` | `scrapers`, `crawlRuns` |
| `useRerunCrawlRun` | `crawlRuns` |
| `useCancelCrawlRun` | `crawlRuns`, `jobs` |
| `useRetryJob` | `jobs` |
| `useStopJob` | `jobs` |
| `useUpdatePlatformConfig` | `platformConfig` |

---

## 20. Extraction Plan (Frontend)

Recommended order for migrating the UI to a standalone generic scraper admin app.

### Phase F1 — Shell & Infrastructure

**Extract:**
- `config/api/axios.ts`, `config/environments/`
- `config/api/routes.ts` (scraper subset)
- `routes/routes.ts` (scraper subset), `routes/index.tsx` (admin routes only)
- `stores/auth.ts` + auth pages (sign-in minimum)
- `pages/admin/layout.tsx`, `components/layout/admin-sidebar-content.tsx` (trim nav)
- `lib/utils.ts`, `lib/date.ts`, `lib/duration.ts`, `lib/dropdown-option-label.utils.ts`
- `hooks/use-toast.ts`, `components/ui/toast.tsx`
- Shared UI: skeletons, confirmation-dialog, action-button-with-pending, date-picker-field

**Outcome:** App shell renders, auth works, empty admin layout

---

### Phase F2 — Feature Data Layer

**Extract features (full folders):**
- `features/scraper-generation/`
- `features/scrapers/`
- `features/crawl-runs/` (trim interfaces)
- `features/jobs/`
- `features/diagnostics/`
- `features/platform-config/` (crawler fields only)
- `features/agencies/` (rename to `features/targets/` in new project)

**Extract dropdowns:**
- `config/constants/dropdowns/scrapers/*`
- `config/constants/dropdowns/jobs/*`
- `config/constants/dropdowns/agencies/crawl-run-status-filter.options.ts`
- `config/constants/dropdowns/agencies/crawl-interval-*.options.ts`

**Outcome:** All API hooks callable from console/tests

---

### Phase F3 — Core Pages

**Extract pages:**
- `pages/admin/generation-runs/` (full)
- `pages/admin/scrapers/` (full)
- `pages/admin/crawl-runs/` (strip domain sections from detail)
- `pages/admin/jobs/` (full)
- `pages/admin/diagnostics/` (full)

**Wire routes in `routes/index.tsx`**

**Outcome:** Full scraper admin workflow UI functional

---

### Phase F4 — Target Management & Config

**Extract:**
- `pages/admin/agencies/` → rename to targets (block rules, crawl interval, base URL)
- `pages/admin/crawler-config/` (general tab only)
- `components/ui/crawl-interval-field.tsx`

**Outcome:** Can manage scrape targets and platform crawler settings

---

### Phase F5 — Dashboard & Polish

**Extract (optional):**
- `pages/admin/dashboard/` (scraper KPIs only)
- `features/dashboard/`
- Bull Board link button

**Consolidate duplicate chip components**

**Rename labels:** Agency → Target, Listings → Items

**Outcome:** Production-ready generic scraper admin UI

---

## 21. Hidden / Easy-to-Miss Dependencies

### 21.1 Cross-Feature Type Imports

| Import | From → To |
|--------|-----------|
| `CrawlRun` type | `scrapers.services.ts` imports from `crawl-runs.interfaces` |
| `DiagnosticsMode` | `diagnostics.interfaces` imports from `scrapers.interfaces` |
| `PropertyHistoryEntry` | `crawl-runs.interfaces` imports from `properties.interfaces` (**domain**) |
| `RoleTypes` | `routes/index.tsx` imports from `user.interfaces` |

### 21.2 Page-Local Hooks

| File | Used by |
|------|---------|
| `pages/admin/scrapers/hooks/use-debounced-value.ts` | Scrapers list search |
| `pages/admin/agencies/hooks/use-debounced-value.ts` | Agencies list search |

Same implementation duplicated — extract to `hooks/use-debounced-value.ts` during migration.

### 21.3 Duplicate Components Across Page Folders

See §18.4 — extracting one page without its chip copies may break imports from sibling pages (e.g. scraper detail imports `./components/crawl-run-status-chip` locally).

### 21.4 JSON Config Helpers

`parseOptionalJsonConfig()` in `scrapers.schema.ts` — used by scraper form and version form for parsing Playwright config JSON textarea.

### 21.5 HeroUI v3 Modal Pattern

All modals must use nested `Modal.Backdrop` → `Modal.Container` → `Modal.Dialog`. Generation run detail uses lightbox modal for screenshots; scraper detail uses modals for new version and generate run.

### 21.6 Protected Route Roles

```tsx
requiredRoles={[RoleTypes.ADMIN, RoleTypes.SUPER_ADMIN, RoleTypes.SUPPORT]}
```

Read-only support users can view but not mutate (mutation buttons should check role — **not confirmed** if frontend enforces beyond backend; backend enforces ADMIN for mutations).

### 21.7 List Page Pagination Pattern

All list pages use identical pattern:
- `page` state default 1
- `limit` state default 20
- Pass `{ page, limit, ...filters }` to query hook
- Pagination controls at bottom using `pagination.total_pages`

### 21.8 Bulk Delete Pattern

Scrapers, crawl runs, jobs list pages:
- Checkbox selection state
- `ConfirmationDialog` for bulk delete
- POST to `bulk-delete` endpoint with IDs array

### 21.9 External Link — Bull Board

Dashboard opens `${API_URL}/admin/queues` in new tab — not a React route. Requires backend Bull Board to be running with basic auth.

### 21.10 Design System

`app/DESIGN.md` — Material Design 3 tokens, CSS variables in `index.css`. UI relies on `--accent`, `--surface`, `--border`, `--muted`, `--foreground`, `--danger` variables.

### 21.11 Package Dependencies (app/package.json)

Scraper UI relevant packages (not confirmed exact versions — check `app/package.json` during migration):

| Package | Purpose |
|---------|---------|
| `@tanstack/react-query` | Server state |
| `@heroui/react` | UI components |
| `react-router-dom` | Routing |
| `axios` | HTTP client |
| `zod` | Validation |
| `@hookform/resolvers` | Form validation |
| `react-hook-form` | Forms |
| `lucide-react` | Icons |
| `zustand` | Auth store |

### 21.12 Not Confirmed From Current Codebase

- Whether SUPPORT role users see disabled mutation buttons on frontend (backend restricts mutations to ADMIN)
- Exact HeroUI version pin (v3 beta/rc — see `app/package.json`)
- i18n / localization (all strings are hardcoded English)

---

## Appendix A — Query Key Reference

| Entity | List key | Detail key |
|--------|----------|------------|
| Generation runs | `["generationRuns", "list", query]` | `["generationRuns", "detail", id]` |
| Scrapers | `["scrapers", "list", query]` | `["scrapers", "detail", id]` |
| Scraper versions | — | `["scrapers", "versions", id]` |
| Crawl runs | `["crawlRuns", "list", query]` | `["crawlRuns", "detail", id]` |
| Jobs | `["jobs", "list", query]` | `["jobs", "detail", id]` |
| Diagnostics | `["diagnostics", "list", query]` | `["diagnostics", "detail", id]` |
| Platform config | `["platformConfig"]` | — |
| Agencies | `["agencies", "list", query]` | `["agencies", "detail", id]` |
| Dashboard | `["dashboard"]` | — |

---

## Appendix B — File Count Summary

| Area | Files to extract (approx.) |
|------|---------------------------|
| Feature modules (scraper core) | 18 files |
| Feature modules (supporting) | 8 files |
| Admin pages + components | 35 files |
| Config (routes, dropdowns) | 14 files |
| Shared UI + layout | 12 files |
| Routes + auth shell | 6 files |
| **Total (core generic platform)** | **~93 files** |

---

*Document generated from repository analysis. All paths relative to `app/` within repository root `property-sync/`. Backend companion: `docs/scraper-platform-extraction-guide.md`.*
