# System Architecture — Property Sync

> Canonical architecture rules (must be followed by every task file in this plan):
> - Frontend: `.cursor/rules/app-code-structure-and-best-practices.mdc`
> - Backend: `.cursor/rules/api-code-structure-and-best-practices.mdc`

## Monorepo layout

```
property-sync/
├── app/          # React 19 + TypeScript + HeroUI (Vite)
├── api/          # NestJS + Prisma + PostgreSQL
└── docs/plan/    # This plan (directions, tasks, PROGRESS.md)
```

## Frontend stack (`app/`)

- React 19, TypeScript, Vite. UI: HeroUI React v3 + Tailwind v4 + shadcn-style primitives in `components/ui/`.
- Routing: React Router, all paths centralized in `app/src/routes/routes.ts` (`Routes` object). Current file only has `auth.*` and `dashboard.root` — every feature below adds its own keys.
- Server state: TanStack Query, hooks in `features/<name>/hooks/`.
- Client state: Zustand (`stores/`), existing `stores/auth.ts` already holds session + role.
- HTTP: shared `axiosInstance` (`config/api/axios.ts`); endpoints via `ApiRoutes` in `app/src/config/api/routes.ts` (currently only `auth`, `users`, `google_maps` — every feature below adds its own keys).
- Forms: React Hook Form + `zodResolver` + Zod schemas.

### New top-level frontend structure this plan introduces

```
app/src/
├── components/layout/
│   ├── admin-layout.tsx              # Admin shell (sidebar + navbar), role-gated
│   ├── admin-sidebar-content.tsx
│   └── admin-dashboard-navbar.tsx
├── pages/
│   ├── admin/
│   │   ├── index.tsx                 # Dashboard Home (KPIs + activity feed)
│   │   ├── agencies/
│   │   ├── scrapers/
│   │   ├── generation-runs/
│   │   ├── crawl-runs/
│   │   ├── jobs/
│   │   ├── properties/
│   │   ├── cms-targets/
│   │   ├── notifications/
│   │   └── users/
│   ├── agencies/                     # user-facing tracked-agencies page
│   ├── properties/                   # user-facing UserProperty pages
│   └── integrations/                 # user-facing CMS connections page
└── features/
    ├── agencies/
    ├── scrapers/
    ├── scraper-generation/
    ├── crawl-runs/
    ├── jobs/
    ├── properties/
    ├── user-tracked-agencies/
    ├── user-properties/
    ├── notifications/
    ├── cms-targets/
    ├── user-cms/
    └── dashboard/
```

Every one of these follows the Feature Module Pattern (`hooks/`, `interfaces/`, `services/`, optional `validation-schemas/`) exactly as defined in `app-code-structure-and-best-practices.mdc`.

### Role-based routing

`stores/auth.ts` already carries the logged-in user; extend the stored shape (if not already present) to include `role: AuthRole`. Add an `AdminProtectedRoute` (or extend the existing `ProtectedRoute`) that:
- Redirects to `Routes.auth.sign_in` when not logged in (existing behavior).
- Redirects to `Routes.dashboard.root` when logged in but `role === 'USER'` and the route requires `ADMIN | SUPER_ADMIN | SUPPORT`.
- Allows `SUPPORT` into admin routes but the UI must hide/disable mutation actions for that role (read-only browsing of logs/traces per spec §3).

## Backend stack (`api/`)

- NestJS + TypeScript, Prisma + PostgreSQL via `PrismaService` (no repository classes), JWT + Passport auth (already scaffolded in `api/src/modules/auth/`), `class-validator` for body DTOs, Zod + `ZodValidationPipe` for query params, `@nestjs/config` + Zod env validation.
- Already present and reused by this plan: `PrismaModule`, `RedisModule`, `QueuesModule` (`@nestjs/bullmq` wired to Redis, see `api/src/core/queues/queues.module.ts`), `AiIntegrationModule` (`api/src/integrations/ai/`), `JwtGuard` / `RolesGuard` / `@CurrentUser()` (`api/src/shared/`).

### New dependencies required by this plan

| Package | Why | Added in |
| --- | --- | --- |
| `playwright` | Production `CrawlRun` execution + Playwright driver for the computer-use loop | Feature 04 (loop) / Feature 05 (crawl engine) |
| `openai` | Computer Use tool (Responses API `computer-use-preview`) — the existing `ai`/`@ai-sdk/openai` packages do not expose the computer-use tool; call the official `openai` SDK directly from a dedicated integration | Feature 04 |
| `openai` (Batch API + webhooks) | Property normalization batch path when all enabled trackers for an agency have `UserTrackedAgency.use_ai_batching: true` and resolved `ai_provider: OPENAI` — upload `.jsonl`, create batch, receive `batch.completed` webhook, download results | Feature 06 |
| `anthropic` / `gemini` (sync) | Property normalization sync path when resolved `UserTrackedAgency.ai_provider` is `ANTHROPIC` or `GEMINI` (batch API not used) | Feature 06 |
| `@nestjs/bullmq` processors | Already installed — add new queues (`crawl`, `generation`, `ai-batch-complete`) | Feature 04 / 05 / 06 |

### Top-level backend layout additions

```
api/src/
├── modules/
│   ├── agencies/
│   ├── scrapers/                  # Scraper + ScraperVersion
│   ├── scraper-generation/        # ScraperGenerationRun + ComputerUseStep
│   ├── crawl-runs/                # CrawlRun + ScraperExecutionTrace
│   ├── jobs/                      # JobLog read/monitor API
│   ├── properties/                # Property, SourceProperty, PropertySourceLink, PropertyHistory
│   ├── user-tracked-agencies/
│   ├── user-properties/
│   ├── notifications/
│   ├── cms-targets/                # admin CmsTarget CRUD + connected accounts view
│   ├── user-cms/                   # user-facing UserCms CRUD + admin per-account actions
│   ├── users/                      # admin Users subpage (list/detail aggregation)
│   └── dashboard/                  # KPI + activity-feed aggregation endpoint
├── integrations/
│   ├── ai/                         # existing — sync Chat Completions via Vercel AI SDK (normalization fast path)
│   ├── ai-batch/                   # new: OpenAI Batch API client (files upload, batches.create/retrieve/cancel, output download)
│   └── computer-use/               # new: OpenAI computer-use loop client + Playwright bridge
├── core/queues/
│   ├── crawl.queue.ts / crawl.processor.ts        # BullMQ: production CrawlRun execution
│   ├── generation.queue.ts / generation.processor.ts  # BullMQ: computer-use generation runs
│   └── ai-batch-complete.processor.ts             # BullMQ: finish normalization after webhook (keeps webhook handler fast)
└── background/
    ├── crawl-scheduler.cron.ts     # reads SourceAgency.crawl_interval, enqueues CrawlRuns
    └── scraper-health.cron.ts      # recomputes Scraper.health / success_rate / avg_runtime_ms
```

`integrations/computer-use/` holds the OpenAI computer-use client + the Playwright bridge that executes each returned action and captures screenshots — this is a pure integration facade; `modules/scraper-generation/` is the only feature module allowed to call it (per the "feature modules import facades, never SDKs directly" rule).

## Database

PostgreSQL via Prisma. **`api/prisma/schema.prisma` already models every entity needed for the in-scope current phase** (including `CmsTarget` / `UserCms` / `CmsSyncRun`, though `CmsSyncRun` stays unused until the future sync phase). No new models are required by this plan — see `03-domain-model.md` for the entity map per feature and the one required action: **run the initial migration** (none exists yet).

## Auth system

JWT access token issued by `api/src/modules/auth/`, stored via the existing `stores/auth.ts` + `axios-token-refresher` provider. Roles (`AuthRole`: `USER`, `ADMIN`, `SUPER_ADMIN`, `SUPPORT`) are already on `User.role` and enforced backend-side with `@UseGuards(JwtGuard, RolesGuard)` + `@Roles(...)`, frontend-side with route guarding (see above). `SUPPORT` gets read access only — enforce this per-endpoint with a role check that allows `GET` but not mutating verbs, or by simply excluding `SUPPORT` from `@Roles()` on mutating endpoints while including it on list/detail `GET` endpoints.

## External services / integrations

| Service | Used by | Facade location |
| --- | --- | --- |
| OpenAI Computer Use (Responses API) | AI scraper generation loop | `api/src/integrations/computer-use/` |
| OpenAI Batch API + webhooks | Deferred property normalization when all trackers opt into `use_ai_batching` | `api/src/integrations/ai-batch/` + `api/src/modules/openai-webhooks/` |
| Playwright | Computer-use loop execution + production `CrawlRun` execution | `api/src/integrations/computer-use/` (loop) and `api/src/modules/crawl-runs/` (production runner, may share a `shared/services/playwright/` browser-session helper) |
| Redis + BullMQ | Crawl queue, generation queue, ai-batch completion queue, job monitoring | `api/src/core/queues/` (existing) |
| Document storage (existing `integrations/storage/gcs`) | Computer-use step screenshots (`Document` model) | reused as-is |

## Deployment approach

No change from the existing setup: `api/` deploys as a NestJS service (with a long-running worker process for BullMQ processors — Playwright-heavy jobs should run in a separate worker deployment from the HTTP API in production, but for this phase both can run in-process via `@Processor()` classes registered in `AppModule`). `app/` deploys as a static Vite build. Environment-specific `.env.*` files per existing convention (`shared/config/env/`).

## Cross-cutting planning rules (repeated from the architect skill, do not violate)

- Never hardcode URLs or API paths — always add to `Routes` / `ApiRoutes` first.
- Vertical slices touch `api/src/modules/<feature>/` and `app/src/features/<feature>/` (+ pages/routes) together.
- Pagination: `{ data, pagination }` from API; frontend services return `response.data`.
- Mutations: frontend hooks `toast()` + `invalidateQueries` with the base key.
- Backend fire-and-forget (notifications, self-heal triggers) via `setImmediate` + internal `try/catch`.
