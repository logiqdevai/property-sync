# IP & Software Ownership Audit — Property Sync

**Repository:** `C:\Users\Maria\Documents\property-sync` (remote `logiqdev/property-sync`) — 198 commits, 2026‑07‑03 → 2026‑07‑26, single author (Petros Rodinos).
**Scope:** NestJS API (`api/`), React/HeroUI frontend (`app/`), scraper/API-generator tooling (`scripts/`), documentation (`docs/`).
**Nature of this document:** technical/commercial map for contract negotiation, not a legal opinion. Ownership, copyright assignment, licensing, and exclusivity are legally distinct concepts, treated separately below.

---

## 1. Executive Summary

Property Sync is a real-estate-listing aggregation platform built for a Greek real-estate client whose CMS of record is **EstateWeb** (`app.estateweb.gr`). The system scrapes agency websites with Playwright, uses an AI "computer-use" agent to generate and self-heal the scrapers themselves, normalizes listings with LLMs (OpenAI/Anthropic), and (in the next phase) pushes normalized listings into the client's EstateWeb CRM.

The most important finding: **the repository did not start from a blank slate.** The very first substantive commit (`e8d9a7c5`, day 1, 2026‑07‑03) added **380 files / ~63,000 lines** of a generic, already-built full-stack SaaS scaffold — Stripe billing, Twilio SMS, Resend email, Telegram bot, GCS storage, Elasticsearch, generic auth/RBAC/JWT, a HeroUI-based admin dashboard shell, and a minimal Prisma schema — with **zero real-estate content**. The backend package is still named `lifehub-api` and the frontend `hero-ui-starter`; both names were set once in that first commit and never touched again in 198 commits. Live, shipped files still contain unmodified leftovers from at least three unrelated prior products (`AppointMy`, `Sentify`, `Appointly`) — a booking-app email config, medical-business categories, and a `ShortCodeType.appointly` SMS constant. This is strong, concrete evidence that a substantial layer of this codebase is a pre-existing, reusable developer framework/starter kit, not work product created for this client.

Client-specific business logic (real estate aggregation, EstateWeb CMS synchronization, AI-driven scraper generation/self-healing, Greek-market normalization) was layered on top starting day 2, per `docs/plan/directions/01-product-spec.md`. That layer is substantial and genuinely novel — the AI computer-use scraper-generation engine in particular is architecturally domain-independent and represents the single highest-value, most commercially sensitive piece of IP in the repository.

**Practical upshot for the SDA:** a blanket "developer assigns all IP in the repository to client" clause would sweep in the reusable starter kit, the generic RBAC/queue/notification/integration-vault infrastructure, and the domain-independent AI-scraper-generation engine — none of which the client's business rationale requires them to own outright. The IP terms should instead assign the real-estate/EstateWeb business logic and data, license the reusable infrastructure the client needs to operate the product, and explicitly exclude third-party code/services.

---

## 2. Product Feature Inventory

| # | Feature | Core modules |
|---|---|---|
| 1 | Authentication & RBAC | `api/src/modules/auth`, `shared/guards`, `shared/decorators`, `app/src/features/auth`, `stores/auth.ts` |
| 2 | User Management (admin + self-service) | `api/src/modules/users`, `app/src/features/users`, `features/user` |
| 3 | Source Agency Registry (scrape targets) | `api/src/modules/agencies`, `app/src/features/agencies` |
| 4 | Scraper Management & Versioning | `api/src/modules/scrapers`, `app/src/features/scrapers` |
| 5 | AI Computer-Use Scraper Generation & Self-Healing | `api/src/integrations/computer-use`, `api/src/modules/scraper-generation`, `app/src/features/scraper-generation` |
| 6 | Playwright Crawling Engine | `api/src/integrations/crawler`, `api/src/background/crawl.processor.ts` |
| 7 | Crawl Run Monitoring | `api/src/modules/crawl-runs`, `app/src/features/crawl-runs` |
| 8 | Property Normalization Pipeline (AI) | `api/src/modules/properties`, `api/src/integrations/ai`, `api/src/integrations/ai-batch`, `api/src/modules/openai-webhooks` |
| 9 | Property/Listing Data Model & History | `Property`, `SourceProperty`, `PropertyHistory`, `PropertySourceLink` (Prisma), `app/src/features/properties`, `source-properties` |
| 10 | Per-User Property Copies & Tracking | `api/src/modules/user-properties`, `user-tracked-agencies`, corresponding `app/src/features/*` |
| 11 | Integration / Credential Vault (pluggable) | `api/src/modules/integration-targets`, `user-integrations`, `app/src/features/integration-targets`, `user-integrations` |
| 12 | EstateWeb CMS Adapter & Sync | `api/src/integrations/estateweb`, `api/src/modules/estateweb`, `app/src/features/estateweb`, `integration-property` |
| 13 | Duplicate Detection & Merge | `Property.duplicate_group_id` logic in `property-normalization.utils.ts` |
| 14 | Watermark Removal (image processing) | `api/src/integrations/dewatermark`, `api/src/background/watermark-removal.processor.ts` |
| 15 | Notification System | `api/src/modules/notifications`, `integrations/notifications` (Telegram/Resend/Twilio), `app/src/features/notifications` |
| 16 | Job Queue Monitoring (BullMQ admin) | `api/src/modules/jobs`, `core/queues`, `app/src/features/jobs` |
| 17 | Diagnostics (scraper failure forensics) | `api/src/modules/diagnostics`, `integrations/diagnostics`, `app/src/features/diagnostics` |
| 18 | Admin Dashboard / User Dashboard (KPIs) | `api/src/modules/dashboard`, `user-dashboard`, `app/src/features/dashboard`, `user-dashboard` |
| 19 | Platform Configuration (crawler/AI tuning) | `api/src/modules/platform-config`, `app/src/features/platform-config` |
| 20 | Health Checks | `api/src/modules/health`, `app/src/features/health` |
| 21 | Billing (Stripe) — present but largely dormant/unadapted | `api/src/integrations/stripe` |
| 22 | Google Maps / Timezone utility | `api/src/modules/google-maps`, `shared/services/google-maps` (unwired) |
| 23 | Reverse-engineering tooling for EstateWeb API | `scripts/api-generator` |
| 24 | Standalone scraper-generation CLI (pre-production prototype) | `scripts/scraper-generator` |

---

## 3. IP Classification by Feature

### Feature: Authentication & RBAC
**Modules:** `auth.module.ts`, `strategies/jwt.strategy.ts`, `shared/guards/{jwt,roles}.guard.ts`, `shared/decorators/roles.decorator.ts`, `AuthRole` enum
**Purpose:** Email/password login, JWT issuance, password reset, admin-impersonation, 4-tier RBAC (`USER/ADMIN/SUPER_ADMIN/SUPPORT`)
**Classification:** Mixed (predominantly Reusable/Background)
**Recommended treatment:** Retain (license to client)
**Reason:** `@Roles()` decorator + `RolesGuard` + `JwtGuard` is textbook, generically-named NestJS RBAC boilerplate present in the day-1 scaffold before any client requirement existed.
**Client-specific elements:** "admin provisions users, no public self-registration" policy; "Property Sync" branding strings in emails
**Reusable elements:** JWT strategy, password-reset token flow, RBAC decorator/guard pair, admin-impersonation pattern
**Third-party dependencies:** `passport`, `passport-jwt`, `bcrypt`, `@nestjs/jwt` (all MIT/permissive)
**Confidence:** High

### Feature: User Management
**Modules:** `modules/users/*`, `app/src/features/users`, `features/user`
**Classification:** Mixed
**Recommended treatment:** Transfer (client-specific joins) / Retain (CRUD scaffold)
**Reason:** Generic admin-CRUD-with-guardrails pattern (can't demote/delete self, can't delete a super-admin) populated with real-estate-domain joins (`tracked_agencies`, `saved_properties`, `user_integrations`).
**Client-specific elements:** Admin detail view joining agency-tracking/property/integration data
**Reusable elements:** Self-service + admin CRUD pattern, guardrail logic
**Third-party dependencies:** None beyond framework
**Confidence:** High

### Feature: Source Agency Registry
**Modules:** `modules/agencies/*`, `SourceAgency` model, `app/src/features/agencies`
**Classification:** Client-Specific
**Recommended treatment:** Transfer
**Reason:** Models "a real-estate agency website that gets scraped," with cron-based `crawl_interval`, CMS-insertion throttling (`concurrent_insertions`, `insertion_interval_seconds`), and title/description truncation rules (`text_truncate_pieces`) — a scraping-target registry, not a generic "organization" entity.
**Client-specific elements:** Entire feature
**Reusable elements:** None distinguishable from the business concept itself
**Third-party dependencies:** None
**Confidence:** High

### Feature: Scraper Management & Versioning
**Modules:** `modules/scrapers/*`, `Scraper`/`ScraperVersion` models
**Classification:** Reusable/Generic (engine) — client-specific only by subject matter
**Recommended treatment:** Retain (license runtime use to client) — see §7 High-Value IP
**Reason:** Immutable-version + active-pointer + health-scoring (`success_rate`, `avg_runtime_ms`, `consecutive_failures`, Excellent→Broken) rollback model is completely domain-independent; nothing in this module mentions real estate.
**Client-specific elements:** None found
**Reusable elements:** Entire versioning/rollback/health-scoring model
**Third-party dependencies:** None
**Confidence:** High

### Feature: AI Computer-Use Scraper Generation & Self-Healing
**Modules:** `integrations/computer-use/*` (orchestrator, Playwright driver, config verifier), `modules/scraper-generation/*`, `ScraperGenerationRun`/`ComputerUseStep` models
**Classification:** Mixed — engine Reusable/High-Value, one prompt string + consuming wiring Client-Specific
**Recommended treatment:** Retain engine, license output/usage to client; the one prompt constant can be handed over or rewritten
**Reason:** The screenshot→LLM→action→Playwright→verify loop, the step-replay audit trail, and self-heal trigger are vertical-agnostic (documented as such in `docs/scraping-generation-computer-use-architecture.md`, which explicitly separates "AI = exploration," "Playwright = execution," "Database = memory" from the real-estate-specific output tail). Only `GENERATION_SYSTEM_PROMPT` (a string naming "real estate website"/"property card") and the `SourceAgency` wiring are client-specific.
**Client-specific elements:** System prompt content, `SourceAgency` FK wiring
**Reusable elements:** Orchestrator, Playwright driver, config verifier, message-compaction utilities, `ComputerUseStep` audit-trail pattern
**Third-party dependencies:** Anthropic Claude (computer-use/vision), Playwright
**Confidence:** High — see §7 for full high-value writeup

### Feature: Playwright Crawling Engine
**Modules:** `integrations/crawler/*` (`CrawlerService`, `StealthBrowserService`, `FieldExtractionService`, `DetailEnrichmentService`, `crawler.utils.ts`)
**Classification:** Mixed, majority Reusable
**Recommended treatment:** Retain (license use to client)
**Reason:** Config-driven generic crawler (`ScraperConfig` schema, `next_button`/`load_more`/`infinite_scroll`/`url_param` pagination, browser-pool management with stealth/anti-bot measures) is ~70% of the directory by line count and vertical-agnostic. `crawler.utils.ts` (Greek "Κωδικός ακινήτου" regex, property-field denormalization) and detail-page fallback selectors (`.property-description`) are real-estate/Greek-specific.
**Client-specific elements:** `crawler.utils.ts`, fallback CSS selectors, price strikethrough heuristic
**Reusable elements:** `StealthBrowserService` (browser pool), pagination engine, generic field extractor, `ScraperConfig` schema
**Third-party dependencies:** Playwright/Chromium (Apache-2.0/BSD)
**Confidence:** High

### Feature: Crawl Run Monitoring
**Modules:** `modules/crawl-runs/*`, `background/crawl.processor.ts`, `crawl-scheduler.cron.ts`, `crawl-run-watchdog.cron.ts`, `scraper-failure-handler.service.ts`, `scraper-health.cron.ts`
**Classification:** Mixed
**Recommended treatment:** Retain scheduling/health engine; transfer reporting layer/data
**Reason:** Scheduling, stale-job watchdog, health-scoring cron, and failure→self-heal trigger are fully generic (zero domain terms). `crawl.processor.ts`'s persistence tail (from `sourceProperty.upsert` onward) and `CrawlRun.findOne()`'s eager joins into `PropertyHistory`/`CmsSyncRun` are real-estate/CMS-specific.
**Client-specific elements:** Persistence tail, property/CMS-sync rollup fields
**Reusable elements:** Cron scheduler, watchdog, health-scoring algorithm, generic failure-handler/self-heal trigger
**Third-party dependencies:** BullMQ/Redis
**Confidence:** High

### Feature: Property Normalization Pipeline (AI)
**Modules:** `modules/properties/services/property-normalization.service.ts`, `constants/normalization-prompt.ts`, `integrations/ai/*`, `integrations/ai-batch/*`, `modules/openai-webhooks/*`
**Classification:** Mixed
**Recommended treatment:** Retain generic LLM abstraction; transfer normalization business logic and prompts
**Reason:** `AiService`/`AiConfig` (provider-agnostic `generateText`/`generateObject`/cost tracking) and `AiBatchClientService` (generic OpenAI Batch API wrapper) contain zero domain content. `PropertyAiBatchService`, `PropertyNormalizationService`, and `NORMALIZATION_STATIC_INSTRUCTIONS` are Greek-real-estate-specific (Greek labels, EstateWeb-aligned schema, price/location heuristics).
**Client-specific elements:** Normalization prompts, batch orchestration business logic
**Reusable elements:** `AiService`, `AiConfig`, `AiBatchClientService`, webhook signature-verification pattern (mirrors Stripe's)
**Third-party dependencies:** OpenAI, Anthropic (paid APIs, ToS-governed)
**Confidence:** High

### Feature: Property/Listing Data Model & History
**Modules:** `Property`, `SourceProperty`, `PropertyHistory`, `PropertySourceLink` (Prisma), `app/src/features/properties`, `source-properties`
**Classification:** Client-Specific (core deliverable)
**Recommended treatment:** Transfer
**Reason:** Canonical real-estate schema (listing_type, property_type, price/sqm/bedrooms, `estateweb_type_id`/`estateweb_location_id`/`estateweb_scope_id`) and append-only change-history model are the platform's core business output.
**Client-specific elements:** Entire feature
**Reusable elements:** The append-only audit-log *pattern* is generic, but this instance is hard-wired to `Property` only (not polymorphic) — not separable as a standalone reusable component without refactoring
**Third-party dependencies:** None
**Confidence:** High

### Feature: Per-User Property Copies & Tracking
**Modules:** `modules/user-properties`, `user-tracked-agencies`, `UserProperty`/`UserTrackedAgency` models
**Classification:** Client-Specific
**Recommended treatment:** Transfer
**Reason:** Personal editable listing copies with CMS-push state (`pending_crm_update`, `estateweb_*` IDs) and per-agency tracking preferences (concurrency/throttling/watermark/AI-batching toggles) are core product logic.
**Confidence:** High

### Feature: Integration / Credential Vault
**Modules:** `modules/integration-targets`, `user-integrations`, `IntegrationTarget`/`UserIntegration`/`UserIntegrationSettings` models
**Classification:** Mixed — architecture Reusable, populated content Client-Specific
**Recommended treatment:** Retain architecture (license to client); transfer specific configured integrations/data
**Reason:** `applyCredentialFields()`/`validateCredentialsForAuthType()`/`maskUserIntegration()` are fully generic, auth-type-driven (EMAIL_PASSWORD/USERNAME_PASSWORD/API_KEY/BEARER_TOKEN/OAUTH) and provider-agnostic — a reusable "connect any third-party service" vault pattern comparable to Zapier/Make connection management. `IntegrationType` enum values (`ESTATEWEB`, `DEWATERMARK`) and provider-specific special-casing (EstateWeb admin-only status toggle, Dewatermark single-connection rule) are client-specific.
**Client-specific elements:** `IntegrationType.ESTATEWEB`/`DEWATERMARK` enum values, `EstateWebIntegrationSettings` shape, provider special-casing
**Reusable elements:** Entire vault architecture, masking utilities, validation-by-auth-type logic
**Third-party dependencies:** None (vault itself); stores credentials for OpenAI/Anthropic/Gemini/DeepSeek/EstateWeb/Dewatermark
**Confidence:** High

### Feature: EstateWeb CMS Adapter & Sync
**Modules:** `integrations/estateweb/*` (auth/session/client/property/reconciliation/resolver/notification services, `estateweb-init.constants.ts`, `estateweb-locations.data.json`), `modules/estateweb`, `modules/cms-sync` (interface layer)
**Classification:** Mixed, explicitly separable
**Recommended treatment:** Transfer client-specific content; retain/license the adapter-pattern template
**Reason (generic side):** Session-cache-with-TTL, retry-once-on-401, typed-exception-mapping, and notification-bridging architecture, plus the platform's own `CmsSyncAdapter` interface (`pushCreate/pushUpdate/pushRemove`), form a reusable "third-party CMS adapter" template usable for a different CMS/client with limited rework.
**Reason (client-specific side):** The literal `app.estateweb.gr` REST contract, the ~3,000-line EstateWeb field/property-type catalog (vendor-owned taxonomy, not developer-authored), the 2.7MB Greek-geography location dataset, Greek-genitive-case normalization rules, and hard-coded Greek portal names (Spitogatos, re1.gr, etc.) are irreducibly tied to this CMS vendor and the Greek market.
**Client-specific elements:** EstateWeb REST contract, catalogs/location data, Greek-language matching logic, portal list
**Reusable elements:** Session/retry/exception/notification architecture, `CmsSyncAdapter` interface shape
**Third-party dependencies:** EstateWeb (client's own CMS vendor — no public API, integration via scraped browser session)
**Confidence:** High

### Feature: Duplicate Detection & Merge
**Modules:** `property-normalization.utils.ts`, `Property.duplicate_group_id`
**Classification:** Client-Specific
**Recommended treatment:** Transfer
**Reason:** Matching heuristics (title/city/price proximity) tuned to this listing domain.
**Confidence:** Medium (not independently deep-dived at the algorithm level)

### Feature: Watermark Removal
**Modules:** `integrations/dewatermark/*`, `background/watermark-removal.processor.ts`
**Classification:** Third-Party wrapper (generic adapter shape) + Client-Specific usage
**Recommended treatment:** License/Exclude (third-party service) — retain adapter pattern
**Reason:** Wraps Dewatermark.ai (`platform.dewatermark.ai`), a genuine external SaaS, via a clean, generic typed-REST-client pattern identical in shape to the EstateWeb/Stripe adapters. Not ownable third-party technology; the adapter *pattern* is reusable.
**Third-party dependencies:** Dewatermark.ai (proprietary, credit-billed, API-key gated) — **LICENSE REQUIRES LEGAL/DEPENDENCY REVIEW**
**Confidence:** High

### Feature: Notification System
**Modules:** `modules/notifications`, `integrations/notifications/{resend,telegram,twillio}`
**Classification:** Mixed, majority Reusable
**Recommended treatment:** Retain delivery architecture; transfer trigger content/data
**Reason:** DB-log + fire-and-forget external-channel push (Telegram/Resend/Twilio), read/unread tracking, and admin CRUD are generic and directly evidenced as reused from prior products (see §5). Spike-threshold constants (`PROPERTY_REMOVAL_SPIKE_*`) and agency/scraper/crawl-run FK payload shape are client-specific. `NotificationType` enum is dominated (24/30 values) by `ESTATEWEB_*` codes.
**Client-specific elements:** Spike thresholds, FK payload shape, `ESTATEWEB_*` enum values
**Reusable elements:** Delivery mechanism, Telegram/Resend/Twilio wrappers, admin CRUD pattern
**Third-party dependencies:** Twilio, Resend, Telegram Bot API
**Confidence:** High

### Feature: Job Queue Monitoring
**Modules:** `modules/jobs`, `core/queues`, `JobLog` model
**Classification:** Mixed, majority Reusable
**Recommended treatment:** Retain
**Reason:** `JobLog` persistence-mirroring-BullMQ, paginated admin listing, retry/stop/delete-with-active-guard is explicitly commented in the schema as usable "independent of the scraping domain model." Queue *names* (crawl/generation/cms-sync/watermark-removal) are client-specific.
**Confidence:** High

### Feature: Diagnostics
**Modules:** `modules/diagnostics`, `integrations/diagnostics`
**Classification:** Mixed
**Recommended treatment:** Retain capture engine; transfer stored data
**Reason:** `DiagnosticsCaptureService` (generic Playwright tracing/video/HAR wrapper with signed-URL retrieval) has no domain content; it's tied to the scraping-pipeline only via FK naming.
**Confidence:** High

### Feature: Admin/User Dashboards
**Modules:** `modules/dashboard`, `user-dashboard`
**Classification:** Client-Specific
**Recommended treatment:** Transfer
**Reason:** Every KPI (scrapers/agencies/crawls/properties/generation-runs) is a real-estate-scraping-domain metric; the aggregation *technique* (Promise.all KPI fetch + merged activity feed) is a generic, easily-reproduced pattern, not separable IP of real value.
**Confidence:** High

### Feature: Platform Configuration
**Modules:** `modules/platform-config`, `PlatformConfig` model
**Classification:** Mixed
**Recommended treatment:** Retain caching mechanism; transfer configured values
**Reason:** Singleton-row-with-TTL-cache pattern is generic; every current field name (`crawler_max_pages`, `normalization_ai_raw_description_max_chars`) is product-specific tuning.
**Confidence:** High

### Feature: Health Checks
**Modules:** `modules/health`
**Classification:** Reusable/Generic
**Recommended treatment:** Retain
**Reason:** Standard `@nestjs/terminus` DB/Redis/uptime check, zero domain logic.
**Confidence:** High

### Feature: Billing (Stripe)
**Modules:** `integrations/stripe/*`
**Classification:** Mixed — generic wrapper live, business logic appears to be dead code from an unrelated project
**Recommended treatment:** Retain wrapper; the commented-out webhook handler bodies should be discussed with counsel/removed rather than assigned as if written for this client
**Reason:** `StripeConfig`/`StripeProductsService` are generic, functioning Stripe wrappers. `StripePaymentsWebhooksService`'s event-handler bodies are almost entirely **commented-out dead code** referencing `booking_uuid`, `BookingStatus`, `this.prisma.booking`, `CreditsCosts` — concepts that do not exist in Property Sync's schema. This strongly suggests code copied from a prior, unrelated appointment/booking-marketplace product and left unadapted.
**Client-specific elements:** None currently functional
**Reusable elements:** SDK wrapper, webhook signature verification
**Third-party dependencies:** Stripe (regulated payment processor — cannot be owned/transferred)
**Confidence:** Medium — **ownership/provenance of the booking-domain code cannot be determined from the codebase alone**

### Feature: Google Maps / Timezone Utility
**Modules:** `modules/google-maps` (unwired/dead), `shared/services/google-maps`
**Classification:** Reusable/Generic
**Recommended treatment:** Retain
**Reason:** Thin proxy over Google's Time Zone API; `GoogleMapsModule` is not even imported in `app.module.ts` — orphaned scaffold code.
**Confidence:** High

### Feature: Reverse-engineering tooling (`scripts/api-generator`)
**Classification:** Mixed — capture tool Reusable, output data Client-Specific
**Recommended treatment:** Retain tool; transfer captured EstateWeb data as reference material
**Reason:** The Playwright-based HTTP-traffic-capture + Postman-collection generator (`estateweb-api/`) is self-described in its own README as a general-purpose tool for capturing traffic against "any configured `startUrl`." The captured JSON/Postman artifacts documenting EstateWeb's actual API are pure client-specific reconnaissance data.
**Confidence:** High

### Feature: Standalone scraper-generation CLI (`scripts/scraper-generator`)
**Classification:** Mixed dev tooling, not shipped product
**Recommended treatment:** Needs Review
**Reason:** Local prototype mirroring the production computer-use engine; explicitly the *source* the production prompt was "ported verbatim" from (per code comment). `crawl/normalize.js` and `estateweb-login.js` are Greek-real-estate-specific; `promote/index.js` writes directly to production Prisma tables via manual CLI. Internal developer tooling, but touches production data — flag for review of who retains this and whether it's needed for the client's ongoing operations.
**Confidence:** Medium

---

## 4. Client-Specific IP (candidates for transfer)

- Source Agency registry & scraping-target configuration (`SourceAgency`, `UserTrackedAgency`)
- Canonical property/listing data model and history (`Property`, `SourceProperty`, `PropertyHistory`, `PropertySourceLink`, `UserProperty`)
- All real, non-scaffold data currently in the database (scraped listings, agency records, users, notifications generated in production)
- EstateWeb-specific integration content: REST contract mapping, the ~3,000-line field/type catalog transcription, the 2.7MB Greek location dataset, Greek-language matching/alias rules, named Greek portal list
- Property normalization prompts and Greek-market business rules (`normalization-prompt.ts`, duplicate-detection heuristics)
- Admin/user dashboards' specific KPI definitions and activity-feed content
- Notification trigger business rules (spike thresholds) and `ESTATEWEB_*` notification taxonomy
- Platform-config tuning values (current crawler/AI settings — the *values*, not the caching mechanism)
- Frontend feature screens under `app/src/features/{agencies,properties,scrapers,crawl-runs,scraper-generation,estateweb,notifications,platform-config,source-properties,user-properties,user-tracked-agencies,integration-property,cms-sync-runs}` and `DESIGN.md` (the explicitly client-branded design system)
- The `scripts/api-generator` captured EstateWeb API documentation/data

---

## 5. Developer Background IP (should normally remain developer-owned, excluded from assignment)

Concrete, code-level evidence of pre-existing, cross-project developer IP:

| Evidence | Location | What it shows |
|---|---|---|
| Day-1 scaffold commit | `e8d9a7c5`, 380 files/63k lines, 2026-07-03 | Full generic SaaS skeleton pre-existed any client requirement |
| `"name": "lifehub-api"` | `api/package.json`, set once, never renamed | Backend originates from a differently-branded internal project/starter |
| `"name": "hero-ui-starter"` | `app/package.json`, set once, never renamed | Frontend originates from a generic HeroUI starter kit |
| `# project-starters` | root `README.md`, first commit | Repo self-identifies as generated from a "starters" template family |
| Stock `nest new` / `create-vite` READMEs | `api/README.md`, `app/README.md` | Never customized — confirms scaffold origin |
| `info@appointmy.com`, `Bookings`/`CreditsUsage` error codes, medical `account-categories.ts` (Dentist/Psychiatrist/…) | `api/src/shared/config/{email,error-codes,account}/*` | Dead, unreferenced leftovers from an unrelated healthcare/booking SaaS ("AppointMy") |
| `'Sentify - Waitlist'` string | `api/src/shared/constants/email.ts` (live file) | Second unrelated prior product ("Sentify") bled into production code |
| `ShortCodeType.appointly` / `'APPOINTLY'` | `integrations/notifications/twillio/*` | Third unrelated prior product ("Appointly") embedded in the live Twilio SMS module |
| Commented-out `booking_uuid`/`BookingStatus`/`CreditsCosts` handlers | `integrations/stripe/services/stripe-payments-webhooks.service.ts` | Stripe webhook business logic apparently ported from the same unrelated booking product |
| Orphaned chat subsystem (`use-chat-websocket.ts`, `WEBSOCKET_EVENTS.CHAT.*`) | `app/src/features/websocket/domains/chat/` | Never imported anywhere in the product — generic starter-kit feature never removed |
| `.cursor/skills/*` + `skills-lock.json` | repo root, added day 1 | Pinned to named public third-party GitHub repos (`kadajett/agent-nestjs-skills`, `anthropics/skills`, `vercel-labs/agent-skills`, etc.) — generic AI-coding-assistant tooling, not owned by either party |
| `app/RULES.md`, `app/AGENTS.md` | day-1 scaffold | Product-agnostic frontend engineering conventions (folder layout, naming, Zustand/TanStack Query rules) with zero real-estate references; `AGENTS.md` is HeroUI's own generic doc index |

**Recommendation:** the SDA should explicitly carve out the pre-existing scaffold/framework layer (auth/RBAC/JWT scaffolding, generic config/env/cache/queue/health infra, the notification/Stripe/Twilio/Resend wrapper shells, and the `.cursor` tooling) as Developer Background IP, licensed for the client's use in the delivered product but not assigned.

---

## 6. Reusable Developer IP (generic components built during this engagement, not client-specific)

These were *authored or substantially extended during* the Property Sync engagement but are domain-independent and reusable elsewhere without disclosing any client information:

- **AI computer-use browser-agent engine** — `ComputerUseOrchestratorService`, `PlaywrightDriverService`, `ScraperConfigVerificationService`, message-compaction utilities (`integrations/computer-use/*`) — only the system-prompt text and consuming-module wiring are real-estate-specific
- **Config-driven Playwright crawling engine** — `CrawlerService`, `StealthBrowserService`, pagination handling, `ScraperConfig` schema (`integrations/crawler/*`)
- **Scraper versioning/rollback + health-scoring model** — `Scraper`/`ScraperVersion`, `scraper-health.cron.ts` algorithm
- **Generic LLM provider abstraction** — `AiService`/`AiConfig` (`integrations/ai/*`), `AiBatchClientService` (`integrations/ai-batch/*`)
- **Generic third-party CMS/service adapter template** — the session-cache/retry-on-401/typed-exception/notification-bridge shape shared by the EstateWeb and Dewatermark integrations, plus the `CmsSyncAdapter` plug-in interface (`modules/cms-sync`)
- **Integration/credential vault** — `IntegrationTarget`/`UserIntegration`/`UserIntegrationSettings` architecture and its auth-type-driven validation/masking utilities
- **BullMQ job-log admin pattern** — `JobLog` model + `modules/jobs` retry/stop/delete-with-guard admin tooling
- **Playwright diagnostics/observability wrapper** — `DiagnosticsCaptureService` (generic tracing/video/HAR capture)
- **GCS/Elasticsearch storage wrappers** — `integrations/storage/*`
- **Generic notification delivery architecture** — DB-log + Telegram/Resend/Twilio fire-and-forget dispatch
- **Generic HeroUI-based admin UI kit** — `app/src/components/ui/{confirmation-dialog, table-skeleton, detail-skeleton, form, password-input, date-picker-field, bulk-actions-menu, table-row-actions-menu, toast}.tsx`
- **`scripts/api-generator/estateweb-api` capture tool** — self-described general-purpose HTTP-traffic capturer/Postman-collection generator, usable against any target API

---

## 7. High-Value Reusable Developer IP

### 7.1 AI Computer-Use Scraper Generation & Self-Healing Engine
**What it does:** Drives a real Chromium browser via an LLM (Anthropic) in a screenshot→action→execute→verify loop, persists every step (`ComputerUseStep`) for replay/audit, and outputs an immutable, versioned scraper configuration; automatically re-triggers itself when a production scraper breaks.
**Why reusable:** Nothing in the orchestrator, Playwright driver, or verification service names real estate — only the system-prompt text and the `SourceAgency` consuming wiring do. This is the architecture of a standalone "AI writes and maintains web scrapers for you" product.
**Location:** `api/src/integrations/computer-use/*`, `api/src/modules/scraper-generation/*`, documented in `docs/scraping-generation-computer-use-architecture.md`.
**Client-specific dependencies today:** `GENERATION_SYSTEM_PROMPT` string; FK to `SourceAgency`; output feeds a real-estate-specific `ScraperVersion.config` DSL.
**Difficulty to separate:** Low — swap the prompt, generalize the config schema, and the engine works for any scrapeable vertical (e-commerce, job boards, classifieds).
**Why exclusivity would restrict the developer:** This is architecturally the seed of a general-purpose "self-healing scraper as a service" SaaS product. Barring the developer from reusing or commercializing it elsewhere would foreclose an entire product category built on work that is not, in substance, real-estate-specific.

### 7.2 Playwright Crawling & Browser-Pool Engine
**What it does:** Config-driven, declarative field-extraction crawler with pagination-strategy abstraction and a stealth, pooled/recycled Chromium browser manager built for Docker/production concurrency.
**Why reusable:** ~70% of the code by volume has no domain terms; driven entirely by a generic `ScraperConfig` JSON.
**Location:** `api/src/integrations/crawler/*` (excluding `crawler.utils.ts` and detail-page fallback heuristics).
**Client-specific dependencies:** Greek-regex field parsing and property-specific fallback selectors, isolated to two files.
**Difficulty to separate:** Low.
**Why exclusivity matters:** Directly reusable as the crawling backbone for any future scraping-based product or client engagement.

### 7.3 Generic LLM Provider Abstraction & Batch Pipeline
**What it does:** Provider-agnostic text/object/stream generation with retry-on-schema-failure and cost accounting; a generic OpenAI Batch API client.
**Why reusable:** Zero domain content; a clean "call any LLM" library.
**Location:** `api/src/integrations/ai/*`, `AiBatchClientService` in `integrations/ai-batch/*`.
**Difficulty to separate:** Trivial — already isolated from the calling business logic.
**Why exclusivity matters:** Core infrastructure any future AI feature (for any client) would need; barring reuse would force the developer to rebuild this from scratch per engagement.

### 7.4 Integration/Credential Vault Pattern
**What it does:** A pluggable "connect any third-party account" system (provider definitions + per-user credentialed connections + masked display + auth-type-driven validation).
**Why reusable:** Already proven generic in this codebase — it stores AI provider keys, a CMS login, and an image-processing API key through the identical mechanism.
**Location:** `api/src/modules/integration-targets`, `user-integrations`.
**Difficulty to separate:** Low — remove the `ESTATEWEB`/`DEWATERMARK` enum values and provider special-casing.
**Why exclusivity matters:** Directly reusable as the credential-management layer of any future multi-integration SaaS.

### 7.5 Third-Party Adapter Template (session/retry/exception/notification pattern)
**What it does:** A repeatable shape for wrapping any authenticated third-party REST service: cached session with TTL, single-retry-on-401, typed exception hierarchy, and automatic operator notification on failure.
**Location:** Demonstrated in both `integrations/estateweb/*` and `integrations/dewatermark/*`.
**Why reusable:** Proven twice already in this codebase against two unrelated vendors.
**Why exclusivity matters:** This is exactly the kind of "how we integrate with any janky third-party system" methodology a developer builds up over many engagements; assigning it exclusively to one client would prevent applying the same proven approach to the next client's CMS/vendor integration.

---

## 8. Third-Party IP & Open-Source Dependencies

Full dependency review is in the appendix table (§11 covers transfer status). Key points:

| Category | Examples | License posture | Notes |
|---|---|---|---|
| Backend framework | NestJS suite, Apollo/GraphQL, Prisma, class-validator/transformer | MIT/Apache-2.0, fully OSS | No restrictions |
| Frontend framework | React, React Router, HeroUI (MIT, confirmed in package's own `package.json`), TanStack Query, Zustand, Tailwind | MIT, fully OSS | HeroUI also sells a paid "Pro" template marketplace — confirm none was purchased/used (undeterminable from dependencies alone) |
| Queue/cache | BullMQ, Bull-Board, ioredis, cache-manager | MIT, OSS | Requires a running Redis instance (self-hosted or managed) |
| Browser automation | Playwright | Apache-2.0, OSS | Bundles Chromium/Firefox/WebKit under their own upstream licenses; production image is `mcr.microsoft.com/playwright:v1.61.1-jammy` |
| Search | `@elastic/elasticsearch` client | Client: Apache-2.0 | **Flag:** the Elasticsearch *server* (post-7.11) ships under SSPL/Elastic License, not pure OSS — confirm actual deployment (self-hosted vs. Elastic Cloud vs. OpenSearch fork) — **LICENSE REQUIRES LEGAL/DEPENDENCY REVIEW** |
| AI providers | OpenAI, Anthropic (SDKs: Apache-2.0/MIT) | SDKs OSS; **underlying APIs are paid, ToS-governed, account-gated** | Not ownable/transferable; client needs own accounts |
| Cloud infra | Google Cloud Storage, Google Maps Platform, google-auth-library | Client libs OSS | Underlying GCP/Maps services are paid, account-gated |
| Payments | Stripe | SDK MIT | Regulated third-party payment processor; not ownable |
| Comms | Twilio, Resend, node-telegram-bot-api, twitter-api-v2 | MIT (SDKs) | All require client-owned third-party accounts/credentials; X/Twitter API access is increasingly paid/restricted |
| Image processing | **Dewatermark.ai** | Proprietary hosted SaaS — **LICENSE REQUIRES LEGAL/DEPENDENCY REVIEW** | Credit-billed, API-key gated; recommend legal review of its ToS re: rights to remove watermarks from third-party-sourced photos |
| Hosting | Vercel (frontend), Railway (backend) | Proprietary platforms | Not code IP; client needs own accounts; Railway is Docker-based so migration is feasible |
| Dev tooling | `.cursor/skills/*` (caveman, copywriting, frontend-design, nestjs-best-practices, openai-docs, vercel-react-best-practices) | Pinned to named public GitHub repos (MIT-style per their own headers, e.g. `kadajett/agent-nestjs-skills`) | Third-party AI-assistant configuration, not proprietary to either party |

**Repository-level license note:** `api/package.json` declares `"license": "UNLICENSED"` (proprietary/all-rights-reserved custom code — normal for work-for-hire); there is no root LICENSE file. This governs the custom code only, not the third-party dependencies listed above.

**Recommendation for the SDA:** state explicitly that all OSS libraries remain under their original licenses (no ownership claimed by either party), and that the 10+ external paid services listed require the client to independently hold its own accounts/credentials — these are contractual relationships with the vendor, not assignable IP.

---

## 9. Client-Owned Materials

- The client's own EstateWeb account and its data (property listings, CRM contacts, catalogs pulled via `/api/init`) — this data is EstateWeb's/the client's, not the developer's, even though the *code* that talks to it is discussed above
- Any business rules, terminology, or process descriptions the client supplied that shaped `docs/PROJECT-SPECIFICATIONS.MD` / `CMS-SYNCHRONIZATION-SPECIFICATION.MD` (**note:** these documents themselves appear to be developer-authored specifications, not client-supplied source material — **ownership of the specification documents' authorship cannot be determined from the codebase alone**; confirm with the client whether these encode client-dictated business requirements or developer-authored functional design)
- The Greek real-estate agency websites' publicly scraped content is neither party's proprietary IP — it belongs to the respective source agencies; the platform only holds a normalized copy for aggregation purposes (raises data-rights/ToS considerations separate from software IP, flagged for legal, not resolved here)
- Any logos/branding/domain names/credentials the client provided for `Property Sync` (currently a placeholder `Building2` icon is in use per `app-logo.tsx` — no proprietary logo asset exists yet in the repo)
- Client's own third-party account credentials (EstateWeb login, any Stripe/Twilio/OpenAI accounts opened in the client's name)

**OWNERSHIP CANNOT BE DETERMINED FROM CODEBASE ALONE:** whether the EstateWeb field/property-type catalog data (`estateweb-init.constants.ts`, `estateweb-locations.data.json`) is (a) EstateWeb's copyrighted data merely referenced under the client's own account access, (b) freely reusable factual/API-schema data, or (c) something the client separately licenses from EstateWeb — this is a question about EstateWeb's own terms of service, not answerable from this repository.

---

## 10. Mixed Components

Already broken out in detail above; the clearest examples for the negotiation:

**AI Computer-Use Scraper Generation** — Reusable: orchestrator loop, Playwright driver, verification service, step-audit-trail model. Client-specific: system prompt content, real-estate config-field naming, `SourceAgency` wiring.

**EstateWeb CMS Adapter** — Reusable: session/retry/exception/notification-bridge architecture, `CmsSyncAdapter` interface. Client-specific: REST contract, vendor catalog data, Greek-location dataset/normalization rules, named portal list.

**Integration/Credential Vault** — Reusable: `IntegrationTarget`/`UserIntegration` architecture, auth-type validation, secret masking. Client-specific: which providers are wired in, EstateWeb/Dewatermark special-case business rules.

**Notification System** — Reusable: DB-log + multi-channel dispatch architecture. Client-specific: spike-threshold constants, `ESTATEWEB_*` taxonomy, FK payload shape.

**Job Queue Monitoring** — Reusable: `JobLog` admin pattern. Client-specific: queue names/retry special-casing.

**Playwright Crawling Engine** — Reusable: browser pool, pagination engine, generic extractor. Client-specific: Greek-regex utility file, fallback selectors.

---

## 11. IP Transfer Matrix

| Feature / Component | Classification | Transfer to Client? | Developer Retains? | Client License Needed? | Third-Party IP? | Reason |
|---|---|---|---|---|---|---|
| Source Agency registry | Client-Specific | YES | NO | — | NO | Core business data model |
| Property/listing data model & history | Client-Specific | YES | NO | — | NO | Core deliverable |
| Per-user property tracking | Client-Specific | YES | NO | — | NO | Core deliverable |
| EstateWeb REST contract mapping/catalog data | Client-Specific | YES | NO | — | PARTIAL (vendor data) | Vendor-owned taxonomy; review EstateWeb ToS |
| EstateWeb adapter session/retry/notification architecture | Reusable | PARTIAL | YES | YES | NO | Generic template, needed to run the product |
| AI computer-use orchestrator/driver/verifier | Reusable, High-Value | NO | YES | YES | NO | Domain-independent engine; client needs runtime license, not ownership |
| AI generation system prompt text | Client-Specific | YES | NO | — | NO | Trivial string, no reason to withhold |
| Playwright crawling engine (browser pool, pagination, extractor) | Reusable | NO | YES | YES | NO | Domain-independent; needed to run the product |
| Crawler Greek-regex utility / fallback selectors | Client-Specific | YES | NO | — | NO | Small, separable, real-estate-specific |
| Scraper versioning/rollback/health-scoring model | Reusable | NO | YES | YES | NO | Domain-independent |
| Generic LLM provider abstraction (`AiService`) | Reusable | NO | YES | YES | NO | Domain-independent infra |
| Property normalization prompts & business rules | Client-Specific | YES | NO | — | NO | Greek-market tuned |
| Integration/credential vault architecture | Reusable | NO | YES | YES | NO | Reusable pattern; client needs it operational |
| Configured integrations (EstateWeb/OpenAI/etc. wiring) | Mixed | PARTIAL | PARTIAL | YES | NO | Vault generic; specific provider wiring client-relevant |
| Notification delivery architecture | Reusable | NO | YES | YES | NO | Generic multi-channel dispatch |
| Notification trigger rules & taxonomy | Client-Specific | YES | NO | — | NO | Business alerting logic |
| Job queue monitoring (`JobLog` admin) | Reusable | NO | YES | YES | NO | Generic ops tooling |
| Diagnostics capture engine | Reusable | NO | YES | YES | NO | Generic Playwright observability wrapper |
| Admin/user dashboards (KPI content) | Client-Specific | YES | NO | — | NO | Business-specific metrics |
| Platform-config caching mechanism | Reusable | NO | YES | YES | NO | Generic pattern |
| Platform-config current values | Client-Specific | YES | NO | — | NO | Operational tuning data |
| Health-check module | Reusable | NO | YES | YES | NO | Boilerplate |
| Auth/RBAC/JWT scaffolding | Reusable/Background | NO | YES | YES | NO | Pre-existing scaffold (day-1 commit) |
| Generic HeroUI admin UI kit components | Reusable | NO | YES | YES | NO | Starter-kit components |
| Client-specific frontend feature screens | Client-Specific | YES | NO | — | NO | Business UI |
| `DESIGN.md` (Property Sync design system) | Client-Specific | YES | NO | — | NO | Explicitly client-branded |
| `RULES.md`/`AGENTS.md` (frontend conventions) | Background | NO | YES | NO | NO | Product-agnostic internal tooling convention |
| Orphaned chat subsystem | Background (unused) | NO | YES | NO | NO | Dead starter-kit feature, irrelevant to product |
| Stripe integration wrapper | Background/Reusable | NO | YES | YES (if activated) | Third-party (Stripe) | Generic SDK wrapper |
| Stripe webhook business-logic bodies (booking-domain) | REVIEW REQUIRED | REVIEW REQUIRED | REVIEW REQUIRED | — | REVIEW REQUIRED | Dead code, provenance from unrelated project undetermined |
| Dewatermark adapter pattern | Reusable | NO | YES | YES | Third-party (Dewatermark.ai) | Generic adapter shape; vendor is third-party |
| `.cursor/skills`, `skills-lock.json` | Third-Party | NO | NO | NO | YES | Pulled from named public repos, owned by their authors |
| All OSS npm dependencies | Third-Party | NO | NO | NO | YES | MIT/Apache-2.0 licensed, freely usable by anyone |
| Paid third-party services (OpenAI, Anthropic, Stripe, Twilio, Resend, Dewatermark, GCP, Google Maps, Elastic, Vercel, Railway) | Third-Party | NO | NO | N/A (client needs own accounts) | YES | Account-gated, ToS-governed, not assignable via IP clause |
| `scripts/api-generator` capture tool | Reusable | NO | YES | Optionally, as delivered artifact | NO | Self-described general-purpose tool |
| `scripts/api-generator` captured EstateWeb data | Client-Specific | YES | NO | — | PARTIAL | Documents client's vendor's API |
| `scripts/scraper-generator` CLI (prototype) | Needs Review | REVIEW REQUIRED | REVIEW REQUIRED | — | NO | Internal dev tool touching production schema directly |

---

## 12. Recommended IP Structure

### Client receives ownership of
- Source Agency registry, canonical Property/SourceProperty/PropertyHistory data model and all production data within it
- User-property tracking data and configuration
- EstateWeb-specific integration content built for this engagement (REST mapping, catalog transcription, location dataset, Greek matching rules) — noting the underlying vendor-catalog data itself may be subject to EstateWeb's own terms (§9)
- Property normalization prompts and business rules tuned for this client's market
- Notification trigger business rules and taxonomy
- All client-specific frontend feature screens and the `DESIGN.md` design system
- Current `PlatformConfig` values and operational data
- Captured EstateWeb API documentation (`scripts/api-generator` output)

### Developer retains ownership of
- Pre-existing scaffold/background IP: auth/RBAC/JWT infrastructure, generic env/config/cache/queue/health modules, notification-delivery wrappers (Telegram/Resend/Twilio), Stripe SDK wrapper, generic Google Maps/Storage/Elasticsearch wrappers
- The AI computer-use scraper-generation engine (orchestrator, Playwright driver, verifier)
- The Playwright crawling/browser-pool engine (excluding the small real-estate-specific utility file)
- The generic LLM provider abstraction and OpenAI Batch client
- The integration/credential-vault architecture
- The third-party-adapter template pattern (session/retry/exception/notification shape)
- The job-queue monitoring pattern and diagnostics-capture engine
- The generic HeroUI admin UI component kit and `RULES.md`/`AGENTS.md` frontend conventions
- The orphaned/unused chat subsystem and any other unused starter-kit remnants
- `scripts/api-generator`'s capture tool and `scripts/scraper-generator`'s reusable engine components (excluding client-specific normalization/login scripts)

### Client receives a license to
- All of the above "developer retains" items, to the extent embedded in the delivered, running Property Sync application — a perpetual, non-exclusive license to use, host, and receive support/maintenance on this infrastructure as part of the product, without ownership transfer and without the right to extract and resell it as a standalone product or scraper-generation platform
- Any future bug fixes/security patches the developer makes to the shared infrastructure, to the extent they affect the client's deployed instance (subject to a maintenance/support agreement)

### Third-party components excluded from transfer
- All OSS dependencies (remain under their own licenses; no representation of ownership needed)
- OpenAI, Anthropic, Stripe, Twilio, Resend, Telegram, Twitter/X, Google Cloud/Maps, Elasticsearch/Elastic Cloud, Dewatermark.ai, Vercel, Railway — all require the client's own accounts/credentials and are governed by each vendor's own ToS
- `.cursor/skills/*` third-party AI-assistant configuration packages
- EstateWeb's own catalog/taxonomy data, to the extent it is EstateWeb's proprietary content rather than developer-authored code

### Client already owns
- Its EstateWeb account, CRM data, and any business documents/specifications it supplied
- Any branding, domain names, and business process descriptions it provided
- Data scraped on the client's behalf from third-party agency websites (subject to those sites' own terms — a data-rights question outside this codebase)

---

## 13. Full IP Assignment Risks

If the client requests "transfer to us all intellectual property contained in this repository":

| Risk | Rank | Explanation |
|---|---|---|
| AI computer-use scraper-generation engine | **CRITICAL** | The single highest-value, most domain-independent asset in the repo; a blanket transfer would hand over what is functionally a standalone AI-agent-scraping product architecture, foreclosing the developer's ability to build or license a similar system elsewhere |
| Playwright crawling/browser-pool engine | **HIGH** | Substantial, reusable, largely domain-independent (per line-count analysis, ~70% generic); losing it removes a core piece of infrastructure reusable across any scraping-based engagement |
| Generic LLM provider abstraction (`AiService`/`AiConfig`) | **MEDIUM-HIGH** | Small in code size but foundational — every future AI feature the developer builds for any client would otherwise need to be rebuilt from scratch |
| Integration/credential vault architecture | **MEDIUM-HIGH** | A generalized "connect any third-party service" pattern with proven versatility (already used for 6 different provider types); losing it is a meaningful loss of reusable connector infrastructure |
| Third-party adapter template (session/retry/exception pattern) | **MEDIUM** | A proven methodology demonstrated twice already; not code-heavy but represents accumulated integration know-how |
| Pre-existing scaffold (auth/RBAC/JWT/config/cache/queue/health) | **MEDIUM** | Genuinely predates this engagement (day-1 commit evidence); a blanket transfer would improperly assign IP that was never created for this client |
| Job-queue monitoring & diagnostics-capture patterns | **LOW-MEDIUM** | Useful, reusable, but replicable without excessive effort if lost |
| Generic HeroUI admin UI kit / `RULES.md` conventions | **LOW** | Convenient but not commercially differentiating; easily reconstructed |
| Stripe/Twilio/Resend/Telegram wrapper shells | **LOW** | Thin wrappers over well-documented public SDKs; low replacement cost |
| Orphaned chat subsystem, dead leftover files | **LOW** (but reputational/administrative risk) | Not valuable, but a blanket clause naively transferring "everything in the repo" would nonsensically also purport to assign an unrelated healthcare SaaS's dead code, a red flag worth cleaning up before signing regardless of the IP terms chosen |

---

## 14. Exclusivity Risks

A clause barring the developer from reusing, commercializing, adapting, or providing "substantially similar technology" to another customer would be **materially broader** than an ownership transfer and would hit different, larger targets:

| Feature | Why exclusivity specifically restricts the developer |
|---|---|
| **AI computer-use scraper-generation & self-healing engine** | This is architecturally a candidate for a standalone "AI writes/maintains scrapers for you" SaaS product. Exclusivity would prevent the developer from ever offering this capability — even fully rebuilt with different code — to any other client, effectively barring an entire future product category and any scraping-adjacent client work generally, since "substantially similar" self-healing-scraper technology is hard to avoid once conceived |
| **Playwright crawling/browser-pool architecture with stealth measures** | Bars the developer from taking on *any* future web-scraping engagement for a different client, since the core browser-management approach would likely be "substantially similar" by necessity (there are only so many sound ways to pool/recycle headless Chromium) |
| **Integration/credential-vault pattern** | This exact architecture (provider definitions + per-user credentialed connections + auth-type-driven validation) is a common SaaS building block; exclusivity would prevent the developer from building this same reasonable design into completely unrelated future products |
| **LLM provider abstraction & AI batch pipeline** | Nearly every AI feature the developer builds for any future client will need some version of "call an LLM, handle retries, track cost" — exclusivity here would functionally bar the developer from doing AI-integration work at all without risk of a "substantially similar technology" claim |
| **Third-party adapter template (session/retry/notification pattern)** | A generalizable integration methodology; exclusivity would restrict the developer's ability to integrate with *any* other authenticated third-party system using the same sound engineering pattern for a different client |
| **General web-scraping-as-a-service positioning** | Taken together, the AI generation engine + crawling engine + versioning/health-scoring model is close to a complete generic scraping platform; exclusivity over "substantially similar" technology could be read to bar the developer from the entire web-scraping-services market, not just from serving a competing real-estate aggregator |

**Recommendation:** if the client wants some assurance of competitive differentiation, prefer a **narrow non-compete** (e.g., "developer will not build a competing real-estate listing aggregation product using this client's specific EstateWeb integration and normalization rules for 12–24 months") over a broad "no substantially similar technology" clause, which as drafted would sweep in generic scraping/AI infrastructure with no real-estate specificity at all.

---

## 15. Questions for Lawyer

1. Does the client's business rationale require *ownership* (copyright assignment) of the AI scraper-generation engine and crawling infrastructure, or would a broad, perpetual, non-exclusive license to use/host/modify it within the delivered product satisfy their operational needs?
2. How should the agreement treat the pre-existing scaffold discovered in the repository's first commit (dated before any documented client engagement) — should it be presumptively excluded from assignment as background IP predating the engagement, and does the client need documentation/attestation of that pre-existing date?
3. What is the correct legal treatment of the leftover, unreferenced code from unrelated prior products found in "live" files (e.g., the `Sentify`/`Appointly` strings) — should these be scrubbed before signing regardless of the IP structure chosen, to avoid ambiguity about what was "delivered" under this engagement?
4. Does EstateWeb's own terms of service impose any restriction on the client's (or developer's) ability to store, transmit, or reuse EstateWeb's field/property-type catalog and location-tree data (`estateweb-init.constants.ts`, `estateweb-locations.data.json`)? Should the client independently confirm its rights under its EstateWeb account agreement?
5. Should the Stripe webhook handler's apparently-ported "booking marketplace" dead code be investigated for its actual origin before the agreement is finalized, given that its provenance (which project/client it may have come from) cannot be determined from this repository alone?
6. What non-compete or non-solicitation scope (if any) is appropriate given that a broad "no substantially similar technology" clause would, per this audit, functionally bar the developer from general web-scraping and AI-agent-integration work — is a narrower, real-estate/EstateWeb-scoped restriction acceptable to the client?
7. Who should hold the ongoing contractual relationships (and bear the cost) for the third-party services listed in §8/§11 (OpenAI, Anthropic, Stripe, Twilio, Resend, Dewatermark.ai, GCP, Google Maps, Elasticsearch/Elastic Cloud, Vercel, Railway) post-handoff, and does the agreement need a transition/assistance clause for the developer to help the client establish independent accounts?
8. Should the specification documents (`PROJECT-SPECIFICATIONS.MD`, `CMS-SYNCHRONIZATION-SPECIFICATION.MD`) be treated as developer work product (and thus part of the deliverable being licensed/assigned like the code) or as reflecting client-dictated business requirements — does authorship of these documents affect the IP analysis?
9. If the client later wants CMS adapters for a second CMS vendor (per the "Future Expansion" notes in `CMS-SYNCHRONIZATION-SPECIFICATION.MD`), does the client's license extend to derivative adapters built on the same reusable `CmsSyncAdapter` pattern, or would that require a separate engagement/license?
10. Does use of Playwright-based scraping against third-party real-estate agency websites raise contractual or legal exposure (ToS violations, robots.txt, data-scraping regulations) that should be addressed in the agreement's indemnification/warranty sections, separate from the software-IP terms?

---

*Analysis performed by static code, schema, dependency, and git-history review only — no code was modified. Where the repository could not establish a fact with confidence, this report says so explicitly rather than inferring legal ownership from file location.*
