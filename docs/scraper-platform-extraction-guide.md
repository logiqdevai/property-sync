# Scraper Platform — Technical Extraction & Migration Guide

> **Purpose:** This document maps the complete scraper-generation and scraper-execution system in the `property-sync` repository so another agent can extract it into a standalone generic scraper platform.
>
> **Scope:** Generation Runs, computer-use scraper generation, scraper runtime, Crawl Runs, jobs/queues, diagnostics, frontend, persistence, and all supporting infrastructure.
>
> **Method:** Derived from tracing execution paths (Frontend → API → Service → Queue → Worker → Browser/AI → Persistence → Frontend), not from filename search alone.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Map](#2-architecture-map)
3. [Complete File Inventory](#3-complete-file-inventory)
4. [Generation Runs](#4-generation-runs)
5. [Computer-Use Scraper Generation](#5-computer-use-scraper-generation)
6. [Scraper Runtime](#6-scraper-runtime)
7. [Crawl Runs](#7-crawl-runs)
8. [Job & Queue System](#8-job--queue-system)
9. [Diagnostics & Observability](#9-diagnostics--observability)
10. [Database / Data Model](#10-database--data-model)
11. [APIs](#11-apis)
12. [Frontend](#12-frontend)
13. [Real-Time Communication](#13-real-time-communication)
14. [External Dependencies](#14-external-dependencies)
15. [Environment & Configuration](#15-environment--configuration)
16. [Generic vs Real-Estate-Specific Logic](#16-generic-vs-real-estate-specific-logic)
17. [Dependency Graph](#17-dependency-graph)
18. [Extraction Plan](#18-extraction-plan)
19. [Missing / Hidden Dependencies](#19-missing--hidden-dependencies)

---

## 1. System Overview

The scraper system has two major pipelines that share infrastructure (Playwright, BullMQ, PostgreSQL, GCS) but serve different purposes:

### Pipeline A — Scraper Generation (AI / Computer Use)

An admin (or self-heal automation) creates a **Generation Run**. The system enqueues a BullMQ job on the `generation` queue. A worker invokes `ComputerUseOrchestratorService`, which:

1. Launches headless Chromium via `PlaywrightDriverService`
2. Navigates to the target site's `base_url` (from `SourceAgency`)
3. Loops: screenshot → send to Anthropic → parse JSON action → execute in browser → persist `ComputerUseStep`
4. On `done` action, verifies selectors against live DOM via `ScraperConfigVerificationService`
5. Stores validated config in `ScraperGenerationRun.staged_config`
6. Sets status to `AWAITING_REVIEW`

An admin **approves** the run, which promotes `staged_config` into a new `ScraperVersion` and optionally creates a `Scraper` if none exists. Status becomes `SUCCESS`.

### Pipeline B — Scraper Execution (Production Crawl)

An admin clicks **Run Now** (or a cron scheduler fires in production). The system:

1. Creates a `CrawlRun` row (`QUEUED`)
2. Enqueues BullMQ job on `crawl` queue with payload `{ crawlRunId }`
3. `CrawlProcessor` loads `Scraper.active_version.config` (JSON matching `ScraperConfig` interface)
4. `CrawlerService.runCrawl()` scrapes listing pages with Playwright
5. `DetailEnrichmentService.enrichDetailPages()` visits detail pages
6. Results upserted into `SourceProperty` (domain-specific output table)
7. `ScraperExecutionTrace` persisted
8. On success: property normalization + CMS sync (domain-specific downstream)
9. On failure: `ScraperFailureHandlerService` may mark scraper `BROKEN` and trigger self-heal generation run

### Complete Lifecycle

```
[Create Generation Run] → QUEUED → RUNNING (AI loop) → AWAITING_REVIEW
                                                              ↓ approve
                                                         ScraperVersion
                                                              ↓ activate (automatic on approve)
[Run Scraper Now] → CrawlRun QUEUED → RUNNING → SUCCESS/FAILED
                                                    ↓ (on failure + self_healing_enabled)
                                              Generation Run (SELF_HEAL)
```

### Key Architectural Facts

| Fact | Detail |
|------|--------|
| Workers | **In-process** NestJS BullMQ processors under `api/src/background/` — no separate worker service |
| Queue backend | Redis via BullMQ |
| Browser | Playwright Chromium (headless, stealth args) |
| AI provider (generation) | Anthropic Messages API (`ANTHROPIC_API_KEY`) |
| Object storage | Google Cloud Storage for screenshots, diagnostics, HTML snapshots |
| Real-time UI | **Polling only** (2–3s intervals) — no WebSocket/SSE for scraper features |

---

## 2. Architecture Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (app/)                                 │
│  Generation Runs │ Crawl Runs │ Scrapers │ Jobs │ Diagnostics │ Crawler Config│
│  TanStack Query + axios + 2-3s polling on active runs/jobs                   │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ REST /admin/*
┌───────────────────────────────▼─────────────────────────────────────────────┐
│                         API (NestJS — api/src/)                              │
│  Controllers: scraper-generation, crawl-runs, scrapers, jobs, diagnostics    │
│  Guards: JwtGuard + RolesGuard (ADMIN/SUPPORT read, ADMIN mutate)             │
└───────┬──────────────────────────────┬──────────────────────────────────────┘
        │                              │
        ▼                              ▼
┌───────────────────┐          ┌───────────────────────────────────────────────┐
│ Generation Engine │          │ Scraper Runtime / Crawl Orchestration          │
│ ScraperGeneration │          │ CrawlRunsService.enqueue()                     │
│ Service           │          │ CrawlProcessor                                 │
│ GenerationProcessor│         │ CrawlerService + DetailEnrichmentService      │
│ ComputerUseOrchestrator     │ DiagnosticsCaptureService                      │
└─────────┬─────────┘          └───────────────────────┬───────────────────────┘
          │                                            │
          ▼                                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INTEGRATIONS (api/src/integrations/)                      │
│  computer-use/  │  crawler/  │  diagnostics/  │  storage/gcs/              │
│  Anthropic API  │  Playwright│  artifact capture│  GCS upload/signed URLs   │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌──────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ BullMQ/Redis │      │ PostgreSQL       │      │ GCS Bucket       │
│ generation   │      │ Prisma models    │      │ screenshots,     │
│ crawl        │      │ (see §10)        │      │ diagnostics, html│
└──────────────┘      └─────────────────┘      └─────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **ScraperGenerationModule** | CRUD for generation runs, approve/reject/cancel/retry, enqueue generation jobs |
| **ComputerUseModule** | AI browser loop, config verification, screenshot storage |
| **CrawlRunsModule** | Crawl run CRUD, enqueue crawl jobs, crons (scheduler, watchdog, health) |
| **ScrapersModule** | Scraper/version CRUD, run-now trigger |
| **CrawlerModule** | Playwright scraping engine (listing + detail pages) |
| **DiagnosticsModule** | Read diagnostics packages with signed artifact URLs |
| **JobsModule** | Cross-queue job log admin (retry/stop/delete) |
| **QueuesModule** | Global BullMQ + Redis connection |
| **PlatformConfigModule** | Runtime crawler tuning (concurrency, timeouts) |
| **GenerationProcessor** | BullMQ consumer for `generation` queue |
| **CrawlProcessor** | BullMQ consumer for `crawl` queue |
| **ScraperFailureHandlerService** | Failure rollup, BROKEN status, self-heal trigger |
| **StealthBrowserService** | Shared Chromium browser lifecycle for production crawls |
| **PlaywrightDriverService** | Per-generation-run browser (not DI singleton) |
| **GcsService** | Upload, delete, signed URL generation |
| **NotificationsService** | Alerts on queue failures, broken scrapers (optional for generic platform) |

---

## 3. Complete File Inventory

Files grouped by subsystem. For each: **Required** = must migrate for core functionality; **Generic** = reusable as-is or with minor rename; **Domain** = real-estate/property-sync specific.

### 3.1 Generation Runs — Backend Module

| Path | Purpose | Key exports | Required | Generic/Domain |
|------|---------|-------------|----------|----------------|
| `api/src/modules/scraper-generation/scraper-generation.module.ts` | Module wiring | `ScraperGenerationModule` | Yes | Generic |
| `api/src/modules/scraper-generation/scraper-generation.controller.ts` | REST endpoints | `ScraperGenerationController` | Yes | Generic (rename `source_agency_id` → `target_id`) |
| `api/src/modules/scraper-generation/scraper-generation.service.ts` | Business logic | `create`, `trigger`, `approve`, `reject`, `cancel`, `retry`, `remove`, `findAll`, `findOne`, `retryLatestForScraper` | Yes | Partially domain (`SourceAgency` naming, auto-creates scraper named `{agency.name} scraper`) |
| `api/src/modules/scraper-generation/dto/create-generation-run.dto.ts` | Create DTO | `CreateGenerationRunDto` | Yes | Generic |
| `api/src/modules/scraper-generation/dto/reject-generation-run.dto.ts` | Reject DTO | `RejectGenerationRunDto` | Yes | Generic |
| `api/src/modules/scraper-generation/dto/retry-generation-run.dto.ts` | Retry DTO | `RetryGenerationRunDto` | Yes | Generic |
| `api/src/modules/scraper-generation/dto/generation-run-query.schema.ts` | List query Zod | `GenerationRunQuerySchema` | Yes | Generic |
| `api/src/modules/scraper-generation/entities/generation-run.entity.ts` | Swagger entity | `ScraperGenerationRun` | Yes | Generic |
| `api/src/modules/scraper-generation/entities/computer-use-step.entity.ts` | Swagger entity | `ComputerUseStep` | Yes | Generic |
| `api/src/modules/scraper-generation/interfaces/generation-run.interface.ts` | Response types | `PaginatedResult` | Yes | Generic |
| `api/src/background/generation.processor.ts` | Queue worker | `GenerationProcessor` | Yes | Generic |

**Imports:** `PrismaModule`, `NotificationsModule`, `ComputerUseModule`, `GcsIntegrationModule`, `BullModule(GENERATION_QUEUE)`

**Called by:** `ScraperGenerationController`, `ScraperFailureHandlerService`, `DashboardService`

### 3.2 Computer-Use Integration

| Path | Purpose | Key exports | Required | Generic/Domain |
|------|---------|-------------|----------|----------------|
| `api/src/integrations/computer-use/computer-use.module.ts` | Module | `ComputerUseModule` | Yes | Generic |
| `api/src/integrations/computer-use/computer-use-orchestrator.service.ts` | Main AI loop | `ComputerUseOrchestratorService.run()` | Yes | Partially domain (loads `source_agency.base_url`, `block_rules`) |
| `api/src/integrations/computer-use/services/computer-use-client.service.ts` | Anthropic API | `sendStep()` | Yes | Generic |
| `api/src/integrations/computer-use/services/playwright-driver.service.ts` | Generation browser | `launch()`, `executeAction()`, `screenshot()` | Yes | Generic |
| `api/src/integrations/computer-use/services/scraper-config-verification.service.ts` | DOM validation | `verify()` | Yes | Generic |
| `api/src/integrations/computer-use/services/screenshot-storage.service.ts` | GCS + Document | `storeScreenshot()` | Yes | Generic |
| `api/src/integrations/computer-use/constants/generation-prompt.ts` | System prompt | `GENERATION_SYSTEM_PROMPT` | Yes | **Domain** (real-estate listings workflow) |
| `api/src/integrations/computer-use/constants/generation.constants.ts` | Tunables | `DEFAULT_GENERATION_MODEL`, `MAX_IMAGE_TURNS_IN_CONTEXT`, etc. | Yes | Generic |
| `api/src/integrations/computer-use/interfaces/computer-use.interface.ts` | Action types | `GenerationAction` | Yes | Generic |
| `api/src/integrations/computer-use/interfaces/generation-run-options.interface.ts` | Run options | `GenerationRunOptions` | Yes | Generic |
| `api/src/integrations/computer-use/utils/generation-action.util.ts` | Action mapping | `mapActionType()` | Yes | Generic |
| `api/src/integrations/computer-use/utils/generation-message.util.ts` | Context compaction | `compactImageMessages()`, `extractResumeUrl()` | Yes | Generic |
| `api/src/integrations/computer-use/utils/extract-json.util.ts` | JSON parsing | `extractJSON()` | Yes | Generic |

### 3.3 Crawler / Scraper Runtime

| Path | Purpose | Key exports | Required | Generic/Domain |
|------|---------|-------------|----------|----------------|
| `api/src/integrations/crawler/crawler.module.ts` | Module | `CrawlerModule` | Yes | Generic |
| `api/src/integrations/crawler/services/crawler.service.ts` | Listing scrape | `runCrawl()` | Yes | Generic engine; field names domain-agnostic |
| `api/src/integrations/crawler/services/detail-enrichment.service.ts` | Detail pages | `enrichDetailPages()` | Yes | Partially domain (GCS path uses `sourcePropertyHtml`, property-specific fallback selectors) |
| `api/src/integrations/crawler/services/stealth-browser.service.ts` | Shared browser | `newStealthPage()`, context lifecycle | Yes | Generic |
| `api/src/integrations/crawler/services/crawler-debug.service.ts` | Debug helpers | selector candidate logging | Optional | Generic |
| `api/src/integrations/crawler/services/field-extraction.service.ts` | Field extraction | extract field values from cards | Yes | Generic |
| `api/src/integrations/crawler/interfaces/scraper-config.interface.ts` | Config schema | `ScraperConfig`, `CrawlResult`, `CrawlItem` | Yes | Generic (schema is listing+card oriented) |
| `api/src/integrations/crawler/interfaces/crawler-runtime-config.interface.ts` | Runtime options | crawl options type | Yes | Generic |
| `api/src/integrations/crawler/constants/crawler.constants.ts` | Defaults | concurrency, timeouts, retry | Yes | Generic |
| `api/src/integrations/crawler/utils/crawler.utils.ts` | Helpers | `contentHash`, `extractSourcePropertyIds`, `extractDenormalizedRawFields` | Partial | **Domain** (`extractSourcePropertyIds`, property field names) |
| `api/src/integrations/crawler/utils/stealth.utils.ts` | Stealth scripts | navigator.webdriver override | Yes | Generic |
| `api/src/integrations/crawler/block-handling/block-handling.utils.ts` | Bot detection | `classifyPageAccess()`, `buildBlockHandlingConfig()` | Yes | Generic |
| `api/src/integrations/crawler/block-handling/block-handling.constants.ts` | Default rules | built-in block patterns | Yes | Generic |
| `api/src/integrations/crawler/block-handling/block-handling.interface.ts` | Types | block handling config | Yes | Generic |

### 3.4 Crawl Runs Module

| Path | Purpose | Key exports | Required | Generic/Domain |
|------|---------|-------------|----------|----------------|
| `api/src/modules/crawl-runs/crawl-runs.module.ts` | Module | `CrawlRunsModule` | Yes | Generic |
| `api/src/modules/crawl-runs/crawl-runs.controller.ts` | REST | `CrawlRunsController` | Yes | Generic |
| `api/src/modules/crawl-runs/crawl-runs.service.ts` | Business logic | `enqueue`, `findAll`, `findOne`, `rerun`, `cancel`, `remove`, `recalculateCmsSyncTotals` | Yes | Partially domain (`recalculateCmsSyncTotals`, `user_tracked_agency_id`) |
| `api/src/modules/crawl-runs/dto/*` | DTOs/schemas | query, bulk-delete | Yes | Generic |
| `api/src/modules/crawl-runs/entities/crawl-run.entity.ts` | Swagger | `CrawlRun` | Yes | Generic |
| `api/src/modules/crawl-runs/interfaces/crawl-run.interface.ts` | Types | paginated response | Yes | Generic |
| `api/src/background/crawl.processor.ts` | Crawl worker | `CrawlProcessor` | Yes | **Domain** (normalization, CMS sync, SourceProperty upsert) |
| `api/src/background/crawl-scheduler.cron.ts` | Scheduled crawls | `CrawlSchedulerCron` | Optional | Partially domain (uses `SourceAgency.crawl_interval`) |
| `api/src/background/crawl-run-watchdog.cron.ts` | Stale run detection | `CrawlRunWatchdogCron` | Yes | Generic |
| `api/src/background/scraper-health.cron.ts` | Health rollup | `ScraperHealthCron` | Optional | Generic |
| `api/src/background/scraper-failure-handler.service.ts` | Failure + self-heal | `ScraperFailureHandlerService.handle()` | Yes | Generic pattern; domain notifications |

### 3.5 Scrapers Module

| Path | Purpose | Key exports | Required | Generic/Domain |
|------|---------|-------------|----------|----------------|
| `api/src/modules/scrapers/scrapers.module.ts` | Module | `ScrapersModule` | Yes | Generic |
| `api/src/modules/scrapers/scrapers.controller.ts` | REST | `ScrapersController` | Yes | Generic |
| `api/src/modules/scrapers/scrapers.service.ts` | CRUD + run-now | `create`, `runNow`, `activateVersion`, etc. | Yes | Partially domain (`UserTrackedAgency` lookup in `runNow`) |
| `api/src/modules/scrapers/dto/*` | DTOs | create/update/version/query | Yes | Generic |
| `api/src/modules/scrapers/entities/*` | Swagger entities | `Scraper`, `ScraperVersion` | Yes | Generic |

### 3.6 Jobs Module

| Path | Purpose | Key exports | Required | Generic/Domain |
|------|---------|-------------|----------|----------------|
| `api/src/modules/jobs/jobs.module.ts` | Module | `JobsModule` | Yes | Generic |
| `api/src/modules/jobs/jobs.controller.ts` | REST | `JobsController` | Yes | Generic |
| `api/src/modules/jobs/jobs.service.ts` | Job log admin | `findAll`, `retry`, `stop`, `remove` | Yes | Generic |
| `api/src/modules/jobs/dto/*` | DTOs | query, bulk-delete | Yes | Generic |
| `api/src/modules/jobs/entities/job-log.entity.ts` | Swagger | `JobLog` | Yes | Generic |

### 3.7 Diagnostics

| Path | Purpose | Key exports | Required | Generic/Domain |
|------|---------|-------------|----------|----------------|
| `api/src/modules/diagnostics/diagnostics.module.ts` | Module | `DiagnosticsModule` | Yes | Generic |
| `api/src/modules/diagnostics/diagnostics.controller.ts` | REST | `DiagnosticsController` | Yes | Generic |
| `api/src/modules/diagnostics/diagnostics.service.ts` | Read + signed URLs | `findAll`, `findOne` | Yes | Generic |
| `api/src/integrations/diagnostics/services/diagnostics-capture.service.ts` | Capture wrapper | `run()` | Yes | Generic |
| `api/src/integrations/diagnostics/interfaces/diagnostics.interfaces.ts` | Types | `DiagnosticsRunContext`, `DiagnosticsOutcome` | Yes | Generic |

### 3.8 Queue Infrastructure

| Path | Purpose | Required |
|------|---------|----------|
| `api/src/core/queues/queues.module.ts` | Global BullMQ root | Yes |
| `api/src/core/queues/queues.constants.ts` | Queue name constants | Yes |
| `api/src/core/queues/bull-board.module.ts` | Admin queue UI | Optional |
| `api/src/core/queues/bull-board.middleware.ts` | Basic auth for Bull Board | Optional |

### 3.9 Platform Config

| Path | Purpose | Required | Notes |
|------|---------|----------|-------|
| `api/src/modules/platform-config/platform-config.module.ts` | Module | Yes | |
| `api/src/modules/platform-config/platform-config.controller.ts` | REST | Yes | Crawler tuning endpoint |
| `api/src/modules/platform-config/platform-config.service.ts` | DB-backed config | Yes | `getCrawlerConfig()` used by `CrawlProcessor` |

### 3.10 Shared Infrastructure (Required but not scraper-specific)

| Path | Purpose | Required for extraction |
|------|---------|---------------------------|
| `api/src/core/databases/prisma/prisma.module.ts` | Prisma DI | Yes |
| `api/src/core/databases/prisma/prisma.service.ts` | DB client | Yes |
| `api/prisma/schema.prisma` | All models | Yes (subset) |
| `api/src/shared/guards/jwt.guard.ts` | Auth | Yes (or replace) |
| `api/src/shared/guards/roles.guard.ts` | RBAC | Yes (or replace) |
| `api/src/shared/decorators/roles.decorator.ts` | `@Roles()` | Yes |
| `api/src/shared/decorators/current-user.decorator.ts` | `@CurrentUser()` | Yes |
| `api/src/shared/pipes/zod.validation.pipe.ts` | Query validation | Yes |
| `api/src/shared/config/env/env.validation.ts` | Env Zod schema | Yes |
| `api/src/shared/config/env/index.ts` | Config loader | Yes |
| `api/src/shared/config/gcs-folders/index.ts` | GCS path prefixes | Yes |
| `api/src/integrations/storage/gcs/gcs.module.ts` | GCS module | Yes |
| `api/src/integrations/storage/gcs/services/gcs.service.ts` | GCS operations | Yes |

### 3.11 Agencies Module (Block Rules — Partial)

| Path | Purpose | Required | Notes |
|------|---------|----------|-------|
| `api/src/modules/agencies/agencies.module.ts` | Agency CRUD | Partial | Replace `SourceAgency` with generic `ScrapeTarget` |
| `api/src/modules/agencies/*` | Agency + block rule admin | Partial | Block rules are generic; agency fields are domain-specific |

### 3.12 Frontend — Feature Modules

| Path | Purpose | Required |
|------|---------|----------|
| `app/src/features/scraper-generation/interfaces/scraper-generation.interfaces.ts` | Types | Yes |
| `app/src/features/scraper-generation/services/scraper-generation.services.ts` | API client | Yes |
| `app/src/features/scraper-generation/hooks/use-scraper-generation.ts` | React Query | Yes |
| `app/src/features/scraper-generation/validation-schemas/scraper-generation.schema.ts` | Form Zod | Yes |
| `app/src/features/crawl-runs/**` | Crawl runs data layer | Yes |
| `app/src/features/scrapers/**` | Scrapers data layer | Yes |
| `app/src/features/diagnostics/**` | Diagnostics data layer | Yes |
| `app/src/features/jobs/**` | Jobs data layer | Yes |
| `app/src/features/platform-config/**` | Crawler config | Yes |

### 3.13 Frontend — Pages

| Path | Purpose | Required |
|------|---------|----------|
| `app/src/pages/admin/generation-runs/index.tsx` | List page | Yes |
| `app/src/pages/admin/generation-runs/detail.tsx` | Detail + step replay | Yes |
| `app/src/pages/admin/generation-runs/components/*` | Chips, create form | Yes |
| `app/src/pages/admin/crawl-runs/index.tsx` | List page | Yes |
| `app/src/pages/admin/crawl-runs/detail.tsx` | Detail + traces | Yes |
| `app/src/pages/admin/crawl-runs/components/*` | Status chips | Yes |
| `app/src/pages/admin/scrapers/index.tsx` | List page | Yes |
| `app/src/pages/admin/scrapers/detail.tsx` | Detail + generate/run | Yes |
| `app/src/pages/admin/scrapers/components/*` | Forms, chips | Yes |
| `app/src/pages/admin/diagnostics/index.tsx` | List | Yes |
| `app/src/pages/admin/diagnostics/detail.tsx` | Artifact downloads | Yes |
| `app/src/pages/admin/jobs/index.tsx` | Job log list | Yes |
| `app/src/pages/admin/jobs/detail.tsx` | Job detail | Yes |
| `app/src/pages/admin/crawler-config/index.tsx` | Platform tuning | Yes |

### 3.14 Frontend — Config & Shared UI

| Path | Purpose | Required |
|------|---------|----------|
| `app/src/config/api/routes.ts` | API route constants | Yes |
| `app/src/routes/routes.ts` | App routes | Yes |
| `app/src/routes/index.tsx` | Route wiring | Yes |
| `app/src/components/layout/admin-sidebar-content.tsx` | Nav links | Yes |
| `app/src/config/constants/dropdowns/scrapers/*` | Filter options | Yes |
| `app/src/config/constants/dropdowns/jobs/*` | Queue filter options | Yes |
| `app/src/components/ui/table-skeleton.tsx` | Loading | Yes |
| `app/src/components/ui/detail-skeleton.tsx` | Loading | Yes |
| `app/src/components/ui/confirmation-dialog.tsx` | Confirm actions | Yes |
| `app/src/components/ui/action-button-with-pending.tsx` | Async buttons | Yes |
| `app/src/lib/date.ts`, `app/src/lib/duration.ts` | Formatting | Yes |

### 3.15 Reference CLI (Optional — Not Production Path)

| Path | Purpose | Migrate? |
|------|---------|----------|
| `scripts/scraper-generator/generate/index.js` | Standalone generation prototype | Reference only |
| `scripts/scraper-generator/generate/prompt.js` | Prompt source (synced to API) | Reference only |
| `scripts/scraper-generator/crawl/index.js` | Offline crawl simulator | Reference only |
| `scripts/scraper-generator/promote/index.js` | Direct DB promotion | Reference only |
| `scripts/scraper-generator/crawl/estateweb-login.js` | EstateWeb auth | **Do not migrate** |

### 3.16 Documentation

| Path | Content |
|------|---------|
| `docs/scraping-generation-computer-use-architecture.md` | Generation architecture (note: mentions OpenAI; implementation uses Anthropic) |
| `docs/playwright-scraping-worker-architecture.md` | Worker split design doc |
| `docs/PROJECT-SPECIFICATIONS.MD` | Product spec (domain context) |

### 3.17 Domain-Specific Downstream (Do NOT Migrate for Generic Platform)

| Path | Why skip |
|------|----------|
| `api/src/modules/properties/services/property-normalization.service.ts` | Real-estate normalization |
| `api/src/modules/cms-sync/**` | EstateWeb CMS push |
| `api/src/background/cms-sync.processor.ts` | CMS queue worker |
| `api/src/background/ai-batch-complete.processor.ts` | OpenAI batch for normalization |
| `api/src/background/renormalization.processor.ts` | Property renormalization |
| `api/src/background/watermark-removal.processor.ts` | Property image processing |
| `api/src/background/content-production.processor.ts` | Content pipeline |
| `api/src/background/sales-price-update.processor.ts` | Sales domain |
| `api/src/background/crm-client-notes-sync.processor.ts` | CRM domain |

---

## 4. Generation Runs

### 4.1 Creation

**Manual (admin UI or API):**

```
POST /admin/generation-runs
Body: { source_agency_id, scraper_id?, prompt?, max_steps? }
Auth: JWT + ADMIN
```

Implementation: `ScraperGenerationService.create()` in `api/src/modules/scraper-generation/scraper-generation.service.ts`

1. Inserts `ScraperGenerationRun` with `status=QUEUED`, `trigger=MANUAL`
2. Calls `enqueueGenerationJob(run.id, { runId: run.id })` — BullMQ job name `'generate'`, `jobId=run.id`, `removeOnComplete: true`, `removeOnFail: true`

**Note:** `initiatedByUserId` parameter is accepted but **not persisted** (not confirmed from current codebase that per-user billing exists).

**Self-heal (automatic):**

`ScraperFailureHandlerService.handle()` → `ScraperGenerationService.trigger()` or `retryLatestForScraper()` with `trigger=SELF_HEAL`.

**Scheduled:**

`GenerationTrigger.SCHEDULED` exists in schema and UI filters but **no cron/worker creates SCHEDULED runs** — not confirmed from current codebase.

### 4.2 Input / Configuration

| Field | Source | Purpose |
|-------|--------|---------|
| `source_agency_id` | Required FK | Target website (`SourceAgency.base_url`) |
| `scraper_id` | Optional FK | Existing scraper being fixed |
| `prompt` | Optional string | Appended to system prompt |
| `max_steps` | Optional int | Hard cap on loop iterations; null = unlimited |

DTO: `api/src/modules/scraper-generation/dto/create-generation-run.dto.ts`

### 4.3 Database Representation

Model: `ScraperGenerationRun` (table `scraper_generation_runs`) — see §10.

Related: `ComputerUseStep[]`, optional `ScraperVersion` via `produced_version_id`.

### 4.4 Status Lifecycle

```
QUEUED → RUNNING → AWAITING_REVIEW → SUCCESS   (via approve)
                 ↘ FAILED
                 ↘ CANCELLED
FAILED/CANCELLED → QUEUED   (via retry — resets and re-enqueues)
```

| Transition | Trigger | Code location |
|------------|---------|---------------|
| → RUNNING | Worker starts | `ComputerUseOrchestratorService.run()` optimistic `updateMany` |
| → AWAITING_REVIEW | Verified `done` config | Orchestrator end state |
| → FAILED | Max steps, access barrier, verification fail, reject | Orchestrator, `reject()` |
| → CANCELLED | Admin cancel or orchestrator detects cancel | `cancel()`, orchestrator `isCancelled()` poll |
| → SUCCESS | Admin approve | `approve()` — creates `ScraperVersion` |

**Important:** `SUCCESS` means config was **approved and promoted**, not merely that AI finished exploring.

### 4.5 How Generation Starts

1. `GenerationProcessor.process()` receives BullMQ job
2. Validates run exists and `status === QUEUED`
3. Calls `ComputerUseOrchestratorService.run(runId, options)`

Lock duration: `GENERATION_JOB_LOCK_DURATION_MS` = 2 hours (`generation.constants.ts`).

### 4.6 AI / Model Calls

- Provider: **Anthropic** via `@anthropic-ai/sdk`
- Service: `ComputerUseClientService.sendStep(messages, systemPrompt, model)`
- Model: env `SCRAPER_GENERATION_MODEL` or default `claude-opus-4-8`
- API key: env `ANTHROPIC_API_KEY` (platform key; Swagger mentions UserIntegration but service does not use it)
- Messages: multimodal (text + JPEG screenshots), compacted to last `MAX_IMAGE_TURNS_IN_CONTEXT` (6) image turns
- Expected output: JSON object with `reasoning`, `action`, optional `selector`/`text`/`url`/`config`

### 4.7 Computer-Use / Browser Interaction

Orchestrator loop (simplified):

```
launch(base_url) → for each step:
  if cancelled → break
  if access barrier → fail
  screenshot_before → store Document
  sendStep to Anthropic
  parse JSON action
  if action=done → verify config → staged_config or retry prompt
  else executeAction in PlaywrightDriverService
  screenshot_after → store Document
  persist ComputerUseStep
```

Actions supported at runtime: `click`, `scroll_down`, `scroll_up`, `type`, `navigate`, `go_back`, `close_tab`, `wait`, `done`.

Prisma enum `ComputerActionType` has additional values (`DOUBLE_CLICK`, `DRAG`, etc.) not exposed in the model prompt.

### 4.8 Generated Scraper Logic

Stored as JSON in `staged_config`, matching `ScraperConfig` interface:

```typescript
// api/src/integrations/crawler/interfaces/scraper-config.interface.ts
{
  start_url: string;
  listing_selector: string;
  fields?: Record<string, string | FieldDef>;
  pagination?: PaginationConfig;
  detail_page?: DetailPageConfig;
}
```

### 4.9 Intermediate State

- Each step: `ComputerUseStep` row + optional `Document` screenshots (GCS folder `generation-screenshots`)
- In-memory: Anthropic message history (compacted)
- On verification failure: orchestrator re-prompts model with error details (does not fail immediately)

### 4.10 Validation

`ScraperConfigVerificationService.verify(page, config)`:
- Counts elements matching `listing_selector`
- Validates field selectors within first card
- Tests pagination selector (clicks twice, checks listing fingerprint change)
- Rejects WAF/bot interstitial pages

### 4.11 Failure Handling & Retry

| Failure mode | Behavior |
|--------------|----------|
| Access barrier (blocked/challenge) | Immediate FAILED |
| Max steps exceeded | FAILED |
| Verification fails repeatedly | FAILED after orchestrator gives up |
| Worker crash | BullMQ may re-deliver; processor skips if not QUEUED |
| Admin retry | Resets to QUEUED, re-enqueues with `resume: true`, optional `retryError`/`retryPrompt` |
| Admin reject | FAILED with reason |

### 4.12 Completion → Usable Scraper

`approve(id)` transaction:
1. If no `scraper_id`: creates `Scraper` named `{agency.name} scraper`, status `TESTING`
2. Creates `ScraperVersion` with `config = staged_config`, `created_by = AI`
3. Sets `Scraper.active_version_id` to new version
4. If scraper was `BROKEN`, sets `ACTIVE`
5. Updates run: `produced_version_id`, `status=SUCCESS`

---

## 5. Computer-Use Scraper Generation

### 5.1 Provider

| Item | Value |
|------|-------|
| Provider | Anthropic Messages API |
| SDK | `@anthropic-ai/sdk` |
| Client service | `ComputerUseClientService` |
| Default model | `claude-opus-4-8` |
| Env override | `SCRAPER_GENERATION_MODEL` |

### 5.2 Browser / Session

| Generation | Production crawl |
|------------|------------------|
| `PlaywrightDriverService` (new instance per run, not DI) | `StealthBrowserService` (shared singleton) |
| Launched in orchestrator | Launched in `DiagnosticsCaptureService` wrapper |
| Closed in orchestrator `finally` | Context closed after crawl |

Stealth: `api/src/integrations/crawler/utils/stealth.utils.ts` — hides `navigator.webdriver`.

### 5.3 System Prompt

File: `api/src/integrations/computer-use/constants/generation-prompt.ts`

Ported from `scripts/scraper-generator/generate/prompt.js`. Defines:
- Mandatory 5-step workflow (listings page → selectors → detail page → pagination → done)
- JSON action schema
- Config schema with real-estate field examples (title, price, location, listing_type, url, image)
- Pagination testing rules

**Migration note:** Prompt must be generalized for arbitrary websites (see §16).

### 5.4 Tool Definitions

No Anthropic native tool-use API. The model returns **plain JSON in text content**, parsed by `extractJSON()`.

### 5.5 Screenshot Handling

- Format: JPEG, quality 70 (`API_SCREENSHOT_JPEG_QUALITY`)
- Storage: `ScreenshotStorageService` → GCS `generation-screenshots/` → `Document` row
- Linked from `ComputerUseStep.screenshot_before_id` / `screenshot_after_id`
- Frontend receives resolved URLs in `findOne()` response

### 5.6 Block Handling

Shared with crawler: `buildBlockHandlingConfig(source_agency)` merges agency `BlockRule[]` with defaults.

Orchestrator calls `classifyPageAccess()` after launch and aborts on `blocked`/`challenge`.

### 5.7 Session Cleanup

`PlaywrightDriverService.close()` in orchestrator `finally` block.

On run delete: `ScraperGenerationService.remove()` deletes GCS screenshot files via `GcsService`.

### 5.8 Timeouts

| Constant | Value |
|----------|-------|
| `VERIFY_TIMEOUT_MS` | 4000ms (config verification) |
| `GENERATION_JOB_LOCK_DURATION_MS` | 2 hours (BullMQ lock) |

Playwright action timeouts: configured in driver (not confirmed exact values without reading full `playwright-driver.service.ts`).

### 5.9 Retry Logic

- Job level: generation jobs use `removeOnComplete/removeOnFail` — **no BullMQ automatic retries**
- Application level: admin `retry()` re-enqueues; orchestrator supports `resume` from last step

---

## 6. Scraper Runtime

### 6.1 Trigger Path

```
POST /admin/scrapers/:id/run-now
  → ScrapersService.runNow(id)
  → finds enabled UserTrackedAgency (domain coupling)
  → CrawlRunsService.enqueue(sourceAgencyId, scraperId, userTrackedAgencyId?)
```

Alternative triggers:
- `POST /admin/crawl-runs/:id/rerun`
- `CrawlSchedulerCron` (production only, per-agency cron)

### 6.2 Run Creation

`CrawlRunsService.enqueue()`:
1. `INSERT crawl_runs` (`status=QUEUED`, links to agency/scraper/tracker)
2. `crawlQueue.add('crawl', { crawlRunId }, { attempts: 3, backoff: exponential 60s })`

### 6.3 Worker Pickup

`CrawlProcessor.processCrawlJob()`:
1. Load crawl run + scraper active version + agency block rules
2. Claim run → `RUNNING`, set `started_at`
3. Create/update `JobLog` (`status=ACTIVE`)
4. Parse `ScraperVersion.config` as `ScraperConfig`

### 6.4 Browser / Session

`DiagnosticsCaptureService.run(ctx, fn)` wraps the crawl:
- Creates stealth page via `StealthBrowserService`
- Enables trace/video/HAR based on `Scraper.diagnostics_mode`
- Executes crawl function
- On failure: uploads artifacts, creates `DiagnosticsPackage`
- On success: discards collected artifacts

### 6.5 Scraper Execution

`CrawlerService.runCrawl(page, config, options, blockHandlingConfig)`:
1. Navigate to `config.start_url`
2. Loop pages (max `crawler_max_pages` from PlatformConfig, default 50):
   - Wait for `listing_selector`
   - Extract cards → `CrawlItem[]` (source_url + raw fields)
   - Handle pagination (next_button, load_more, infinite_scroll, url_param)
   - Heartbeat: updates `crawl_run.updated_at` during long runs
3. Returns `{ items, steps, success, errorSummary, zeroListingsPage0, networkError }`

`DetailEnrichmentService.enrichDetailPages()`:
- Visits detail URLs with concurrency `crawler_detail_concurrency` (default 3)
- Extracts images, description, external_id per `detail_page` config
- Optionally uploads HTML to GCS (`source-property-html/`)

### 6.6 Result Persistence (Domain-Specific in Current Code)

`CrawlProcessor` upserts `SourceProperty` rows with:
- `extractSourcePropertyIds()` — URL path / listing code parsing
- `extractDenormalizedRawFields()` — property_type, listing_type, etc.
- `contentHash()` for change detection

**For generic platform:** Replace with generic `ExtractedRecord` or JSON blob storage.

### 6.7 Progress Updates

- DB: `crawl_run.updated_at` heartbeat during scrape
- DB: counters updated on completion (`total_found`, etc.)
- Frontend: polls `GET /admin/crawl-runs/:id` every 2s while `QUEUED`/`RUNNING`

### 6.8 Completion

On success:
1. `CrawlRun.status = SUCCESS`, set timing + totals
2. Reset `scraper.consecutive_failures`, update `last_success_at`
3. Insert `ScraperExecutionTrace`
4. **Domain:** `PropertyNormalizationService.normalizeForCrawlRun()`
5. **Domain:** `CmsSyncOrchestratorService.planAndEnqueueCrawlSync()`

On failure:
1. `CrawlRun.status = FAILED`
2. `ScraperFailureHandlerService.handle()` — may trigger self-heal
3. BullMQ retries (up to 3 attempts, 60s exponential backoff)

### 6.9 Cancellation

`POST /admin/crawl-runs/:id/cancel`:
- Removes BullMQ job if waiting
- Sets `CrawlRun.status = CANCELLED`
- Stops associated active `JobLog` entries

---

## 7. Crawl Runs

### 7.1 Creation Sources

| Source | Code |
|--------|------|
| Manual run-now | `ScrapersService.runNow()` |
| Rerun | `CrawlRunsService.rerun()` |
| Scheduler | `CrawlSchedulerCron` (disabled in local/dev/staging via `MANUAL_ONLY_CRAWL_ENVS`) |

### 7.2 Status Lifecycle

```
QUEUED → RUNNING → SUCCESS
                 → FAILED (error, timeout, watchdog, final retry exhausted)
                 → CANCELLED (admin)
FAILED → RUNNING (BullMQ retry reclaims)
```

**Note:** `PARTIAL_SUCCESS` exists in schema and UI filters but **`CrawlProcessor` never sets it** — only SUCCESS/FAILED.

### 7.3 Progress Calculations

| Field | Set when | Meaning |
|-------|----------|---------|
| `total_found` | Scrape completion | Unique items seen |
| `total_new_listings` | Scrape completion | New `SourceProperty` rows |
| `total_refreshed_listings` | Scrape completion | Re-seen existing rows |
| `total_created/updated/removed/linked/failed` | CMS sync rollup | **Domain-specific** — from `CmsSyncRun` aggregation |

### 7.4 Relationships

```
CrawlRun
├── source_agency (required)
├── scraper (optional)
├── user_tracked_agency (optional, domain)
├── job_logs[]
├── execution_traces[] (ScraperExecutionTrace)
├── diagnostics_package (0..1)
├── property_history[] (domain)
├── cms_sync_runs[] (domain)
├── ai_batch_runs[] (domain)
└── cost_logs[] (domain)
```

### 7.5 Overlap Prevention

- `hasActiveRunForAgency()` — blocks scheduler if `QUEUED`/`RUNNING` exists for agency
- `ensureNoActiveCrawlRuns()` — blocks scraper delete

### 7.6 Watchdog

`CrawlRunWatchdogCron` (every 5 min): fails `RUNNING` runs with stale `updated_at` (~35 min threshold).

---

## 8. Job & Queue System

### 8.1 Technology

| Item | Value |
|------|-------|
| Library | BullMQ (`bullmq` + `@nestjs/bullmq`) |
| Backend | Redis (`REDIS_URL`) |
| Workers | In-process NestJS `@Processor` classes |
| Legacy | `bull` + `@nestjs/bull` in package.json — **not used by active scraper code** |

### 8.2 Scraper-Related Queues

| Queue constant | Name | Processor | Job name | Payload |
|----------------|------|-----------|----------|---------|
| `GENERATION_QUEUE` | `generation` | `GenerationProcessor` | `generate` | `{ runId, resume?, retryError?, retryPrompt? }` |
| `CRAWL_QUEUE` | `crawl` | `CrawlProcessor` | `crawl` | `{ crawlRunId, jobLogId? }` |

### 8.3 Generation Queue Options

```typescript
queue.add('generate', { runId }, {
  jobId: run.id,
  removeOnComplete: true,
  removeOnFail: true,
});
// Processor lockDuration: GENERATION_JOB_LOCK_DURATION_MS (2h)
// No automatic BullMQ retries
```

### 8.4 Crawl Queue Options

```typescript
queue.add('crawl', { crawlRunId }, {
  attempts: DEFAULT_CRAWL_JOB_ATTEMPTS,  // 3
  backoff: { type: 'exponential', delay: DEFAULT_CRAWL_JOB_BACKOFF_MS },  // 60s
});
// Worker concurrency: DEFAULT_CRAWL_WORKER_CONCURRENCY (5), overridden from PlatformConfig
```

### 8.5 JobLog Persistence

Every crawl job creates/updates a `JobLog` row:
- `queue_name`, `job_id`, `job_name`, `status`, `attempt`, `max_attempts`
- `crawl_run_id` (optional FK)
- `payload`, `result`, `error_message`, `stack_trace`
- Timing fields

Generation jobs do **not** create `JobLog` rows (only crawl jobs do).

### 8.6 Job Admin

`JobsService`:
- `retry(id)` — re-enqueues failed/completed job with original payload
- `stop(id)` — removes from queue, marks FAILED/CANCELLED
- Resolves queue by `queue_name` string

### 8.7 Bull Board

- URL: `/admin/queues`
- Auth: HTTP Basic (`BULL_BOARD_USER`, `BULL_BOARD_PASSWORD`)
- Exposed queues: `generation`, `crawl`, `ai-batch-complete` only

### 8.8 Concurrency Controls

| Control | Source | Default |
|---------|--------|---------|
| Crawl worker concurrency | `PlatformConfig.crawler_worker_concurrency` | 5 |
| Detail page concurrency | `PlatformConfig.crawler_detail_concurrency` | 3 |
| Per-agency overlap | `hasActiveRunForAgency()` | 1 active run |
| Chromium context restart | `PlatformConfig.crawler_chromium_max_contexts_before_restart` | 250 |

### 8.9 Dead / Failing Jobs

No dedicated dead-letter queue. Failed jobs remain in BullMQ failed set + `JobLog` rows with `status=FAILED`.

---

## 9. Diagnostics & Observability

### 9.1 Diagnostics Modes (`Scraper.diagnostics_mode`)

| Mode | Artifacts on failure |
|------|---------------------|
| `PRODUCTION` | Screenshot, HTML snapshot, console log |
| `TRACE` | Above + Playwright trace.zip |
| `FULL_DEBUG` | Above + video + network HAR |

Successful runs discard all collected artifacts.

### 9.2 Capture Flow

Origin: `DiagnosticsCaptureService.run()` in `api/src/integrations/diagnostics/services/diagnostics-capture.service.ts`

1. Creates temp dir `{tmpdir}/diagnostics/{crawlRunId}`
2. Wraps Playwright context with recording options
3. Runs caller function (crawl)
4. On failure: uploads to GCS `diagnostics/{crawlRunId}/`, creates `DiagnosticsPackage` + `DiagnosticsArtifact[]`
5. On success: deletes temp files

### 9.3 Artifact Kinds

Enum `DiagnosticsArtifactKind`: `TRACE`, `SCREENSHOT`, `HTML_SNAPSHOT`, `CONSOLE_LOG`, `NETWORK_HAR`, `VIDEO`

### 9.4 Generation Traces

Separate from diagnostics: `ComputerUseStep[]` with screenshot URLs, stored per generation run.

### 9.5 Production Execution Traces

`ScraperExecutionTrace.steps` — JSON array of Playwright step log from `CrawlerService` (msg + timestamp + metadata).

### 9.6 Logs

- NestJS `Logger` throughout processors and services
- `JobLog.error_message` / `stack_trace` for failed queue jobs
- `CrawlRun.error_message`, `ScraperGenerationRun.error_message`

### 9.7 Frontend Access

- Diagnostics list/detail: `GET /admin/diagnostics`, `GET /admin/diagnostics/:id`
- Signed GCS URLs generated on read (60 min TTL) — only `path` stored in DB
- Crawl run detail embeds execution traces and job logs
- Generation run detail shows step replay with screenshots

### 9.8 Notifications (Optional for Generic Platform)

`NotificationsService` creates alerts for:
- `QUEUE_FAILURE`, `BROKEN_SCRAPER`, `WEBSITE_UNAVAILABLE`, `LARGE_CRAWL_FAILURE`

Linked via optional FKs on `Notification` model.

---

## 10. Database / Data Model

Schema file: `api/prisma/schema.prisma`

### 10.1 Core Scraper Models (Migrate)

```
SourceAgency (1) ──< Scraper (1) ──< ScraperVersion (many)
       │                │
       │                ├── active_version_id → ScraperVersion
       │                └── crawl_runs[], execution_traces[], generation_runs[]
       │
       ├──< ScraperGenerationRun ──< ComputerUseStep
       │         └── produced_version_id → ScraperVersion
       │
       ├──< CrawlRun ──< JobLog
       │         ├── execution_traces[]
       │         └── diagnostics_package → DiagnosticsArtifact[]
       │
       └──< BlockRule
```

### 10.2 Model Reference

| Model | Table | Migrate | Generic replacement suggestion |
|-------|-------|---------|-------------------------------|
| `SourceAgency` | `source_agencies` | Refactor | `ScrapeTarget` (id, name, base_url, crawl_interval, block_rules) |
| `BlockRule` | `block_rules` | Yes | Keep as-is |
| `Scraper` | `scrapers` | Yes | Keep; remove domain-only fields if desired |
| `ScraperVersion` | `scraper_versions` | Yes | Keep |
| `ScraperGenerationRun` | `scraper_generation_runs` | Yes | Rename FK `source_agency_id` → `target_id` |
| `ComputerUseStep` | `computer_use_steps` | Yes | Keep |
| `ScraperExecutionTrace` | `scraper_execution_traces` | Yes | Keep |
| `CrawlRun` | `crawl_runs` | Refactor | Remove CMS/AI cost fields or make optional |
| `DiagnosticsPackage` | `diagnostics_packages` | Yes | Keep |
| `DiagnosticsArtifact` | `diagnostics_artifacts` | Yes | Keep |
| `JobLog` | `job_logs` | Yes | Keep |
| `Document` | `documents` | Yes | Keep (screenshot storage) |
| `PlatformConfig` | `platform_config` | Partial | Extract crawler_* fields only |

### 10.3 Enums (Migrate)

- `GenerationRunStatus`, `GenerationTrigger`, `ComputerActionType`
- `CrawlRunStatus`, `ScraperStatus`, `ScraperHealth`, `DiagnosticsMode`, `DiagnosticsArtifactKind`
- `JobStatus`, `ScraperVersionCreatedBy`
- `BlockSignal`, `BlockRuleSource`

### 10.4 Domain Models (Do Not Migrate)

- `SourceProperty`, `Property`, `PropertySourceLink`, `PropertyHistory`
- `UserTrackedAgency`, `CmsSyncRun`, `AiBatchRun`, `CostLog`
- `Notification` (optional)

### 10.5 Migrations Reference

Initial scraper tables: `api/prisma/migrations/20260714075846_init/migration.sql`

Subsequent:
- `20260715120000_add_generation_run_duration_ms`
- `20260802160000_add_generation_run_max_steps`
- `20260802180000_nullable_generation_run_max_steps`

---

## 11. APIs

All endpoints require `JwtGuard` + `RolesGuard`. Default read roles: `ADMIN`, `SUPPORT`. Mutations: `ADMIN` only.

### 11.1 Generation Runs — `/admin/generation-runs`

| Method | Route | Service method | Input | Output |
|--------|-------|----------------|-------|--------|
| GET | `/` | `findAll` | Query: page, limit, status, trigger, source_agency_id, scraper_id | Paginated runs |
| GET | `/:id` | `findOne` | id | Run + steps + screenshot URLs |
| POST | `/` | `create` | `CreateGenerationRunDto` | Created run (QUEUED) |
| POST | `/:id/approve` | `approve` | — | Run (SUCCESS) + creates version |
| POST | `/:id/reject` | `reject` | `RejectGenerationRunDto` | Run (FAILED) |
| POST | `/:id/cancel` | `cancel` | — | Run (CANCELLED) |
| POST | `/:id/retry` | `retry` | `RetryGenerationRunDto` | Run (QUEUED) |
| DELETE | `/:id` | `remove` | — | Deletes run + GCS screenshots |

Controller: `api/src/modules/scraper-generation/scraper-generation.controller.ts`

### 11.2 Scrapers — `/admin/scrapers`

| Method | Route | Service method | Notes |
|--------|-------|----------------|-------|
| GET | `/` | `findAll` | Paginated, filterable |
| GET | `/:id` | `findOne` | With active version |
| POST | `/` | `create` | Creates scraper + v1 |
| PATCH | `/:id` | `update` | self_healing, diagnostics_mode |
| DELETE | `/:id` | `remove` | Blocked if active crawl |
| POST | `/bulk-delete` | `removeMany` | |
| GET | `/:id/versions` | `listVersions` | |
| POST | `/:id/versions` | `createVersion` | Does not activate |
| POST | `/:id/versions/:versionId/activate` | `activateVersion` | |
| POST | `/:id/run-now` | `runNow` | Creates CrawlRun + enqueues |

Controller: `api/src/modules/scrapers/scrapers.controller.ts`

### 11.3 Crawl Runs — `/admin/crawl-runs`

| Method | Route | Service method |
|--------|-------|----------------|
| GET | `/` | `findAll` |
| GET | `/:id` | `findOne` |
| POST | `/:id/rerun` | `rerun` |
| POST | `/:id/cancel` | `cancel` |
| DELETE | `/:id` | `remove` |
| POST | `/bulk-delete` | `removeMany` |

Controller: `api/src/modules/crawl-runs/crawl-runs.controller.ts`

### 11.4 Jobs — `/admin/jobs`

| Method | Route | Service method |
|--------|-------|----------------|
| GET | `/` | `findAll` |
| GET | `/:id` | `findOne` |
| POST | `/:id/retry` | `retry` |
| POST | `/:id/stop` | `stop` |
| DELETE | `/:id` | `remove` |
| POST | `/bulk-delete` | `removeMany` |

### 11.5 Diagnostics — `/admin/diagnostics`

| Method | Route | Service method |
|--------|-------|----------------|
| GET | `/` | `findAll` |
| GET | `/:id` | `findOne` (signed artifact URLs) |

### 11.6 Platform Config — `/admin/platform-config`

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/` | Read crawler tuning |
| PATCH | `/` | Update crawler tuning |

Fields include: `crawler_max_pages`, `crawler_page_timeout_ms`, `crawler_selector_timeout_ms`, `crawler_scroll_pause_ms`, `crawler_detail_concurrency`, `crawler_detail_delay_ms`, `crawler_worker_concurrency`, `crawler_job_timeout_ms`, `crawler_chromium_max_contexts_before_restart`.

### 11.7 Agencies — `/admin/agencies` (Partial)

Agency CRUD + block rule management. Required for `SourceAgency.base_url` and per-target block rules.

### 11.8 Bull Board — `/admin/queues`

Separate UI (not REST JSON). Basic auth. Opens from admin dashboard.

---

## 12. Frontend

Stack: React + Vite + React Router + TanStack Query + HeroUI + axios.

### 12.1 Routes

| Path | Page |
|------|------|
| `/admin/generation-runs` | List |
| `/admin/generation-runs/:id` | Detail (step replay, approve/reject/cancel/retry) |
| `/admin/crawl-runs` | List |
| `/admin/crawl-runs/:id` | Detail (traces, jobs, diagnostics link) |
| `/admin/scrapers` | List |
| `/admin/scrapers/:id` | Detail (versions, run-now, generate/fix AI) |
| `/admin/diagnostics` | List |
| `/admin/diagnostics/:id` | Artifact downloads |
| `/admin/jobs` | List |
| `/admin/jobs/:id` | Detail |
| `/admin/crawler-config` | Platform tuning |

Route constants: `app/src/routes/routes.ts`, API routes: `app/src/config/api/routes.ts`

### 12.2 State Management

- Server state: TanStack Query in feature hooks
- Query keys: `["generationRuns"]`, `["crawlRuns"]`, `["scrapers"]`, `["diagnostics"]`, `["jobs"]`, `["platformConfig"]`
- Mutations invalidate related queries + toast notifications
- Local UI state: `useState` for filters, pagination, modals
- Forms: React Hook Form + Zod

### 12.3 Key UX Flows

**Generate scraper:** Scraper detail → "Generate/Fix with AI" modal → `POST /admin/generation-runs` → poll detail page → approve/reject

**Run scraper:** Scraper detail → "Run Now" → `POST /admin/scrapers/:id/run-now` → navigate/view crawl runs

**Monitor crawl:** Crawl run detail polls every 2s, shows execution trace steps, linked job logs, diagnostics link on failure

### 12.4 Shared UI to Extract

From `app/src/components/ui/`: `table-skeleton`, `detail-skeleton`, `confirmation-dialog`, `action-button-with-pending`, `table-row-actions-menu`, `date-picker-field`

**Note:** Status chip components are duplicated across page folders (not shared from one location).

---

## 13. Real-Time Communication

| Mechanism | Used for scraper features? |
|-----------|---------------------------|
| WebSocket | **No** (exists for chat only — `app/src/features/websocket/`) |
| SSE | **No** |
| Redis pub/sub | **No** (not confirmed for UI updates) |
| Polling | **Yes** |

### Polling Intervals

| Hook | Interval | Condition |
|------|----------|-----------|
| `useGenerationRun(id)` | 3s | status `QUEUED` or `RUNNING` |
| `useCrawlRun(id)` | 2s | status `QUEUED` or `RUNNING` |
| `useJobs(query)` | 2s | any row in active job status |
| `useJob(id)` | 2s | active job status |
| `useDashboard()` | 60s | dashboard KPIs |

List pages for generation/crawl runs do **not** poll — only detail pages.

---

## 14. External Dependencies

### 14.1 npm Packages (api/package.json)

| Package | Purpose | Used in |
|---------|---------|---------|
| `playwright` | Browser automation | crawler, computer-use |
| `@anthropic-ai/sdk` | AI generation | computer-use |
| `bullmq`, `@nestjs/bullmq` | Job queues | all processors |
| `ioredis` | Redis client | queues |
| `@google-cloud/storage` | Object storage | screenshots, diagnostics, HTML |
| `@nestjs/schedule` | Cron jobs | scheduler, watchdog, health |
| `@prisma/client` | ORM | all persistence |
| `@bull-board/api`, `@bull-board/express` | Queue UI | admin |
| `zod` | Validation | DTOs, env |

### 14.2 External Services

| Service | Required | Purpose |
|---------|----------|---------|
| PostgreSQL | Yes | Primary database |
| Redis | Yes | BullMQ backend |
| Google Cloud Storage | Yes | Screenshots, diagnostics, HTML artifacts |
| Anthropic API | Yes (for generation) | Computer-use scraper generation |

### 14.3 Not Required for Core Scraper Platform

OpenAI, Stripe, Resend, Twilio, EstateWeb integrations — used by domain-specific downstream pipelines.

---

## 15. Environment & Configuration

Env validation: `api/src/shared/config/env/env.validation.ts`
Template: `api/.env.template`

### 15.1 Required Variables

| Variable | Purpose | Consumed by |
|----------|---------|-------------|
| `DATABASE_URL` | PostgreSQL | Prisma |
| `JWT_SECRET` | API auth | Auth module |
| `NODE_ENV` | Environment selection | Config loader |

### 15.2 Scraper-Specific Variables

| Variable | Purpose | Consumed by |
|----------|---------|-------------|
| `REDIS_URL` | BullMQ | `QueuesModule` |
| `ANTHROPIC_API_KEY` | AI generation | `ComputerUseClientService` |
| `SCRAPER_GENERATION_MODEL` | Model override | Orchestrator (default: `claude-opus-4-8`) |
| `GCS_PROJECT_ID` | GCS | `GcsService` |
| `GCS_BUCKET_NAME` | GCS bucket | `GcsService` |
| `GCS_CREDENTIALS_JSON_BASE64` | GCS auth | `GcsService` |
| `GCS_CREDENTIALS` | Alt GCS auth | `GcsService` |
| `BULL_BOARD_USER` | Queue UI auth | `bull-board.middleware.ts` |
| `BULL_BOARD_PASSWORD` | Queue UI auth | `bull-board.middleware.ts` |
| `CRAWL_SCHEDULE_TZ` | Cron timezone | `CrawlSchedulerCron` (default: `Europe/Athens`) |

### 15.3 Frontend Variables

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | API base URL |

### 15.4 Runtime Config (Database — PlatformConfig)

Crawler tuning stored in DB, read by `PlatformConfigService.getCrawlerConfig()`:
- `crawler_max_pages`, `crawler_page_timeout_ms`, `crawler_selector_timeout_ms`
- `crawler_scroll_pause_ms`, `crawler_detail_concurrency`, `crawler_detail_delay_ms`
- `crawler_worker_concurrency`, `crawler_job_timeout_ms`
- `crawler_chromium_max_contexts_before_restart`

### 15.5 Feature Flags / Environment Behavior

| Behavior | Condition |
|----------|-----------|
| Scheduled crawls disabled | `NODE_ENV` in `local`, `development`, `staging` (`MANUAL_ONLY_CRAWL_ENVS`) |
| Bull Board mounted | Always at `/admin/queues` when credentials set |

---

## 16. Generic vs Real-Estate-Specific Logic

### 16.1 Generic / Directly Reusable

- BullMQ queue infrastructure (`QueuesModule`, processors pattern)
- `ComputerUseOrchestratorService` loop mechanics
- `PlaywrightDriverService`, `StealthBrowserService`
- `ScraperConfigVerificationService`
- `ScreenshotStorageService`, GCS integration
- `CrawlerService` pagination and card extraction engine
- `DiagnosticsCaptureService` artifact pipeline
- Block handling (`block-handling/*`)
- Generation run lifecycle (QUEUED → RUNNING → AWAITING_REVIEW → approve)
- Crawl run lifecycle and job logging
- Job admin module
- Frontend feature modules and admin pages (with label renames)
- `ScraperConfig` interface structure (listing cards + detail pages is a common pattern)
- Cron watchdog and health rollup patterns

### 16.2 Reusable With Refactoring

| Component | What to decouple |
|-----------|------------------|
| `SourceAgency` model | Rename to `ScrapeTarget`; remove `country`, `city`, `content_language`, visibility flags |
| `GENERATION_SYSTEM_PROMPT` | Remove real-estate workflow; parameterize target schema (fields, detail page, pagination) |
| `ScraperGenerationService.approve()` | Auto-naming `{agency.name} scraper` → generic naming |
| `CrawlProcessor` | Remove `SourceProperty` upsert, normalization, CMS sync; replace with generic result storage |
| `CrawlRunsService.enqueue()` | Remove `user_tracked_agency_id` |
| `CrawlRun` model | Remove CMS rollup fields, AI cost fields |
| `ScrapersService.runNow()` | Remove `UserTrackedAgency` lookup |
| `crawler.utils.ts` | Replace `extractSourcePropertyIds`, `extractDenormalizedRawFields` with generic ID extraction |
| `DetailEnrichmentService` | Remove property-specific fallback selectors (`.property-description`, etc.) |
| `ScraperFailureHandlerService` | Keep logic; swap notification types |
| Frontend copy/labels | "Agency" → "Target", "Listings" → "Items" |
| `CrawlSchedulerCron` | Keep pattern; decouple from agency visibility/enabled flags |

### 16.3 Real-Estate-Specific (Do Not Migrate)

- `SourceProperty`, `Property`, normalization pipeline
- CMS sync (`CmsSyncModule`, `cms-sync` queue)
- OpenAI batch normalization (`ai-batch-complete` queue)
- EstateWeb login script (`scripts/scraper-generator/crawl/estateweb-login.js`)
- Property history, cost logs, watermark removal
- UserTrackedAgency tracking preferences
- Prompt field examples: `listing_type` (sale/rent), property ID extraction patterns
- `extractSourcePropertyIds()` regex for "Property Code/Ref"
- Dashboard KPIs tied to property sync

### 16.4 Classification by Prompt Content

The generation prompt (`generation-prompt.ts`) is the **primary domain coupling** for AI generation:
- References "real estate website", "property listings", "property cards"
- Prescribes fields: title, price, location, listing_type, url, image
- Detail page: image gallery, description, property ID

For a generic platform, the prompt should accept a **target schema definition** per scrape target or use case.

---

## 17. Dependency Graph

### 17.1 Scraper Generation Flow

```
GenerationRunsListPage / ScraperDetailPage
  → scraper-generation.services.ts (POST /admin/generation-runs)
    → ScraperGenerationController.create()
      → ScraperGenerationService.create()
        → Prisma: INSERT scraper_generation_runs
        → BullMQ: generationQueue.add('generate', { runId })
          → GenerationProcessor.process()
            → ComputerUseOrchestratorService.run()
              → PlaywrightDriverService (browser)
              → ComputerUseClientService → Anthropic API
              → ScraperConfigVerificationService
              → ScreenshotStorageService → GcsService → Document
              → Prisma: ComputerUseStep rows, staged_config, status updates
  → useGenerationRun (poll 3s)
    → GET /admin/generation-runs/:id
      → ScraperGenerationService.findOne() (resolves screenshot URLs)

Admin approve:
  → POST /admin/generation-runs/:id/approve
    → ScraperGenerationService.approve()
      → Prisma transaction: ScraperVersion, Scraper.active_version_id, status=SUCCESS
```

### 17.2 Scraper Execution Flow

```
ScraperDetailPage "Run Now"
  → scrapers.services.ts (POST /admin/scrapers/:id/run-now)
    → ScrapersService.runNow()
      → CrawlRunsService.enqueue()
        → Prisma: INSERT crawl_runs (QUEUED)
        → BullMQ: crawlQueue.add('crawl', { crawlRunId })
          → CrawlProcessor.processCrawlJob()
            → Prisma: claim RUNNING, JobLog ACTIVE
            → DiagnosticsCaptureService.run()
              → StealthBrowserService.newStealthPage()
              → CrawlerService.runCrawl()
              → DetailEnrichmentService.enrichDetailPages()
            → Prisma: SourceProperty upsert [DOMAIN]
            → Prisma: ScraperExecutionTrace
            → Prisma: CrawlRun SUCCESS/FAILED
            → [SUCCESS] PropertyNormalizationService [DOMAIN]
            → [SUCCESS] CmsSyncOrchestratorService [DOMAIN]
            → [FAILURE] ScraperFailureHandlerService
              → ScraperGenerationService.trigger(SELF_HEAL)
  → useCrawlRun (poll 2s)
    → GET /admin/crawl-runs/:id
```

### 17.3 Self-Heal Flow

```
CrawlProcessor (failure) OR CrawlRunWatchdogCron (stale)
  → ScraperFailureHandlerService.handle()
    → scraper.consecutive_failures++, maybe status=BROKEN
    → if self_healing_enabled:
        → ScraperGenerationService.retryLatestForScraper() OR trigger(SELF_HEAL)
          → generation queue (same as §17.1)
```

### 17.4 Diagnostics Flow

```
CrawlProcessor failure path
  → DiagnosticsCaptureService (already ran wrapper)
    → on failure: GCS upload diagnostics/{crawlRunId}/*
    → Prisma: DiagnosticsPackage + DiagnosticsArtifact[]

Frontend:
  → GET /admin/diagnostics?crawl_run_id=...
  → GET /admin/diagnostics/:id
    → DiagnosticsService.findOne() → signed URLs
```

### 17.5 Queue Processing Flow

```
JobsListPage
  → GET /admin/jobs
  → POST /admin/jobs/:id/retry
    → JobsService.retry()
      → Resolve queue by queue_name
      → Re-add job with original payload (+ jobLogId for crawl)
```

---

## 18. Extraction Plan

Recommended order — each phase builds on the previous and produces a testable increment.

### Phase 1 — Foundation Infrastructure

**Extract:**
- `QueuesModule`, `queues.constants.ts`
- `PrismaModule`, Prisma schema subset (or new schema)
- `env.validation.ts` (scraper-related vars)
- `GcsIntegrationModule`, `gcs-folders`
- Shared guards/pipes/decorators (or minimal auth stub)

**Dependencies:** PostgreSQL, Redis, GCS credentials

**Domain removal:** None yet

**Expected outcome:** App boots, connects to DB/Redis/GCS, auth works

---

### Phase 2 — Data Model

**Extract / create:**
- Models: `ScrapeTarget` (from SourceAgency), `BlockRule`, `Scraper`, `ScraperVersion`, `ScraperGenerationRun`, `ComputerUseStep`, `CrawlRun`, `ScraperExecutionTrace`, `DiagnosticsPackage`, `DiagnosticsArtifact`, `JobLog`, `Document`, `PlatformConfig` (crawler fields)

**Domain removal:**
- Drop FKs to `UserTrackedAgency`, `SourceProperty`, `CmsSyncRun`, `AiBatchRun`
- Remove CMS/AI cost columns from `CrawlRun` or make nullable unused

**Expected outcome:** Migrations run, empty CRUD possible

---

### Phase 3 — Computer-Use / Generation Engine

**Extract:**
- Entire `api/src/integrations/computer-use/**`
- `ScraperGenerationModule` + `GenerationProcessor`
- Block handling utilities

**Refactor:**
- Replace `source_agency` with `scrape_target` in orchestrator
- Generalize `GENERATION_SYSTEM_PROMPT` (configurable schema section)

**Configuration:** `ANTHROPIC_API_KEY`, `SCRAPER_GENERATION_MODEL`, GCS

**Expected outcome:** Can create generation run, AI explores site, produces staged config, steps persisted with screenshots

---

### Phase 4 — Scraper Runtime / Crawler

**Extract:**
- Entire `api/src/integrations/crawler/**`
- `DiagnosticsCaptureService` + diagnostics module (read path)
- `CrawlerModule`

**Refactor:**
- Remove property-specific utils from crawl processor path
- Generic result storage (e.g., `CrawlResult` JSON table or `ExtractedItem`)

**Expected outcome:** Can execute a `ScraperConfig` against a URL manually (script or API) without full CrawlRun module

---

### Phase 5 — Crawl Orchestration

**Extract:**
- `CrawlRunsModule`, `CrawlProcessor`
- `ScrapersModule`
- `ScraperFailureHandlerService`
- Crons: watchdog, health (scheduler optional)

**Refactor:**
- Strip normalization/CMS from `CrawlProcessor` success path
- Replace `SourceProperty` upsert with generic extracted data persistence
- Decouple `runNow()` from `UserTrackedAgency`

**Expected outcome:** Full run-now → crawl → trace → success/failure lifecycle

---

### Phase 6 — Jobs & Queue Admin

**Extract:**
- `JobsModule`
- `BullBoardModule` (optional)

**Expected outcome:** Admin can view/retry/stop crawl jobs; Bull Board accessible

---

### Phase 7 — Frontend Admin UI

**Extract:**
- Feature modules: scraper-generation, crawl-runs, scrapers, diagnostics, jobs, platform-config
- Admin pages and components listed in §3.12–3.14
- Route wiring, API routes, dropdown constants

**Refactor:**
- Rename agency → target in UI
- Remove domain-specific crawl run detail sections (CMS sync, property history)

**Expected outcome:** Full admin UI for generation, scrapers, crawls, diagnostics, jobs

---

### Phase 8 — Self-Heal & Polish

**Extract:**
- Self-heal wiring (already in Phase 5)
- Notifications (optional, generic alert types)

**Refactor:**
- Configurable self-heal prompts per target type

**Expected outcome:** Broken scraper auto-triggers generation run; admin approves fix

---

### Phase 9 — Reference CLI (Optional)

**Extract:** `scripts/scraper-generator/generate/*` and `crawl/*` as dev tools (exclude `estateweb-login.js`)

**Expected outcome:** Local prototyping without full API stack

---

## 19. Missing / Hidden Dependencies

Items easy to overlook during extraction:

### 19.1 Shared Types & Enums

- All Prisma enums imported from `generated/prisma` — must regenerate client in new project
- `ScraperConfig`, `CrawlResult`, `GenerationAction` interfaces
- `PaginatedResult` pattern in service interfaces
- `DiagnosticsRunContext`, `DiagnosticsOutcome` interfaces

### 19.2 Utilities

- `extract-json.util.ts` — model output parsing
- `generation-message.util.ts` — resume URL extraction, message compaction
- `generation-action.util.ts` — Prisma enum mapping
- `block-handling.utils.ts` — shared between generation and crawl
- `stealth.utils.ts` — injected into browser contexts
- `contentHash()` — used if keeping change detection

### 19.3 Constants

- `crawler.constants.ts` — all DEFAULT_* values
- `generation.constants.ts` — model, lock duration, image turns
- `block-handling.constants.ts` — built-in detection patterns
- `GcsFolders` — path prefixes

### 19.4 Error Handling

- NestJS exceptions thrown from services (`NotFoundException`, `BadRequestException`)
- Processor-level try/catch with `NotificationsService.create(QUEUE_FAILURE)`
- Orchestrator cancel detection via DB status polling

### 19.5 Middleware & Auth

- Global JWT setup in auth module (not listed in scraper modules but required for all `/admin/*` routes)
- `RolesGuard` SUPER_ADMIN bypass
- Bull Board basic auth middleware (separate from JWT)

### 19.6 Database Helpers

- `PrismaService` with `$transaction` in approve flow
- Optimistic locking via `updateMany` with status checks (generation claim, cancel)
- Cascade deletes: generation run → steps; diagnostics package → artifacts

### 19.7 Queue Helpers

- `enqueueGenerationJob()` — sets jobId = run.id for deduplication/cancel
- Job removal on cancel (checks job state before remove)
- `JobsService` queue resolution map (must include `generation` and `crawl` queue names)
- Crawl retry injects `jobLogId` to reuse existing log row

### 19.8 Event / Notification Emitters

- `NotificationsService.create()` — not event-emitter based; direct service calls
- Dashboard activity feed includes recent generation/crawl runs (`DashboardService`)

### 19.9 Storage Helpers

- `Document` model links screenshots to generation steps
- `GcsService.deleteFiles()` called on generation run delete
- Signed URL generation in diagnostics read path

### 19.10 Browser Helpers

- `PlaywrightDriverService` instantiated with `new` in orchestrator (not in DI container)
- `StealthBrowserService` context restart after N contexts (`crawler_chromium_max_contexts_before_restart`)
- `CONTEXT_CLOSE_TIMEOUT_MS` for cleanup

### 19.11 Prompt Templates

- `GENERATION_SYSTEM_PROMPT` must stay synced with `scripts/scraper-generator/generate/prompt.js` (comment in source says keep in sync)

### 19.12 Validation Schemas

- Backend: Zod query schemas for all list endpoints
- Frontend: Zod form schemas for create generation run, create scraper/version
- `CreateGenerationRunDto` class-validator decorators

### 19.13 Module Circular Dependencies

- `CrawlRunsModule` imports `ScraperGenerationModule` (for self-heal)
- `CrawlRunsModule` uses `forwardRef(() => CmsSyncModule)` — **remove in generic platform**
- `ScraperGenerationModule` exports `ScraperGenerationService` for crawl module

### 19.14 App Module Registration

Scraper-related modules registered in `api/src/app.module.ts`:
- `ScraperGenerationModule`
- `CrawlRunsModule`
- `ScrapersModule` (not confirmed in grep — verify import exists)
- `JobsModule`
- `DiagnosticsModule`
- `PlatformConfigModule`
- `QueuesModule` (core)

### 19.15 Playwright System Dependency

Playwright requires Chromium binaries installed (`npx playwright install chromium`) in deployment environment — not just npm package.

### 19.16 Items Not Confirmed From Current Codebase

- Per-user Anthropic billing via `UserIntegration` (Swagger mentions, code uses platform key only)
- `GenerationTrigger.SCHEDULED` automation
- Exact Playwright timeout values inside `PlaywrightDriverService` (read file if needed during migration)
- Separate worker process deployment (docs describe target architecture; current code is in-process)

---

## Appendix A — ScraperConfig Schema Reference

Canonical TypeScript definition: `api/src/integrations/crawler/interfaces/scraper-config.interface.ts`

Production configs are stored as JSON in `ScraperVersion.config` and validated at generation time by `ScraperConfigVerificationService`.

---

## Appendix B — Queue Name Constants

File: `api/src/core/queues/queues.constants.ts`

Scraper-relevant: `GENERATION_QUEUE = 'generation'`, `CRAWL_QUEUE = 'crawl'`

Other queues in same file are domain-specific downstream processing.

---

## Appendix C — Existing Architecture Docs

| Document | Notes |
|----------|-------|
| `docs/scraping-generation-computer-use-architecture.md` | Generation architecture; verify AI provider (doc may say OpenAI, code uses Anthropic) |
| `docs/playwright-scraping-worker-architecture.md` | Describes splitting workers from API — not current deployment |
| `docs/PROJECT-SPECIFICATIONS.MD` | Product requirements with domain context |

---

*Document generated from repository analysis. All file paths relative to repository root: `property-sync/`.*
