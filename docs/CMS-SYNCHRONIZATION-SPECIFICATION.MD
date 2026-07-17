# CMS Synchronization Specification

Functional specification for pushing `UserProperty` data to external CMS instances via `UserIntegration` connections. **Out of scope for the current implementation phase** — see `PROJECT-SPECIFICATIONS.MD` (Implementation Scope). This document describes the full sync feature to be built after the crawl → `Property` → `UserProperty` → `PropertyHistory` pipeline is complete.

The **EstateWeb integration adapter** under `api/src/integrations/estateweb/` is already implemented and serves as the reference implementation for this specification (see section 3.5).

---

# 1. Overview

The platform aggregates listings from agency websites into normalized `Property` records and personal `UserProperty` copies for tracking users. This phase adds **outbound synchronization**: each user's `UserProperty` rows are pushed to their connected CMS account via `UserIntegration`.

Goals:

- Push new, updated, and removed listings to the user's CMS
- Support multiple CMS types via pluggable integration adapters (`IntegrationType` enum)
- Allow one user to hold **multiple `UserIntegration`s per CMS type** (e.g. multiple EstateWeb accounts with different email/password) and route the sync per tracked agency via `UserTrackedAgencyIntegrationLink`
- Guarantee no data loss on failure — every attempt is recorded and retried until success or manual resolution
- Provide full visibility into sync health for admins and users

**Prerequisite (current phase):** `IntegrationTarget` and `UserIntegration` configuration UI, crawl-time `UserProperty` create/update, `PropertyHistory`, and the `UserTrackedAgencyIntegrationLink` mapping UI must already be implemented. Sync builds on top of those; it does not replace them.

---

# 2. Data Model

Backed by Prisma models in `api/prisma/schema.prisma`.

> **Naming note:** the current schema uses generic `IntegrationTarget` / `UserIntegration` instead of the legacy `CmsTarget` / `UserCms`, because the same tables also hold AI-provider credentials (`OPENAI`, `ANTHROPIC`, `GEMINI`, `DEEPSEEK`). Only rows with `integration_type = ESTATEWEB` (and any future CMS-type additions) participate in this sync spec.

## 2.1 IntegrationTarget

Platform-defined integration type. Managed by admins (configuration UI exists in the current phase).

| Field | Purpose |
| --- | --- |
| `integration_type` | `IntegrationType` enum (e.g. `ESTATEWEB`) — selects the integration adapter |
| `auth_type` | `AuthType` enum — determines credential fields on `UserIntegration` |
| `base_url` | Default API/base URL for this integration type |
| `allow_multiple` | Whether one user may have multiple `UserIntegration` rows for this target (**required `true` for `ESTATEWEB`** so a user can hold several EstateWeb accounts) |
| `is_visible` | Whether the integration appears to non-admin users |
| `is_enabled` | Platform-wide enable; when false, no sync runs and users cannot connect/modify |

## 2.2 UserIntegration

Per-user connection to an `IntegrationTarget` with that user's credentials.

| Field | Purpose |
| --- | --- |
| `integration_target_id` | Parent target |
| `user_id` | Owning user |
| `api_key_secret` | Used when `auth_type` is `API_KEY` or `BEARER_TOKEN` |
| `email`, `username`, `password` | Used per `auth_type` (`EMAIL_PASSWORD`, `USERNAME_PASSWORD`) — **EstateWeb requires `email` + `password`** |
| `config` | JSON — CMS-specific field mapping, category defaults, cached session data (see 3.5), etc. |
| `is_active` | User-level enable; when false, sync is paused for this connection |
| `is_default` | Marks the user's default `UserIntegration` for that target (used as fallback when a `UserTrackedAgency` has no explicit link) |

Sync runs only when **both** `UserIntegration.is_active` and parent `IntegrationTarget.is_enabled` are true.

## 2.3 UserTrackedAgency

Which `SourceAgency` a user tracks. Crawl scheduling lives on `SourceAgency.crawl_interval`, not here (see below). This model holds **CMS outbound sync throttling** (`concurrent_insertions`, `insertion_interval_minutes`) for the linked integration (e.g. EstateWeb).

These two fields do **not** control Playwright crawl concurrency — that is governed separately by `CRAWL_WORKER_CONCURRENCY` on the crawl BullMQ worker.

| Field | Purpose |
| --- | --- |
| `user_id`, `source_agency_id` | Ownership + tracked agency |
| `enabled` | User-level tracker on/off |
| `concurrent_insertions` | Within one tracker's `CmsSyncRun` batch for a crawl, how many property pushes (CREATE/UPDATE/REMOVE combined) the orchestrator runs **concurrently** at a time (default `1`) |
| `insertion_interval_minutes` | Minimum delay **between successive chunks** of `concurrent_insertions` property pushes inside that same batch (default `5`). Throttles a large batch (hundreds of changed properties) so the CMS is not flooded in one burst |
| `track_new_listings`, `track_updated_listings`, `track_removed_listings` | Which change types are included in the tracker's sync batch at all |
| `use_ai_batching` | Opt into OpenAI Batch normalization for runs attributed to this tracker. Normalization otherwise always uses the platform default AI provider (`AiDefaults.provider`/`AiDefaults.model`) — there is no per-tracker `ai_provider`/`ai_model` field |

`UserTrackedAgency` has no scheduling field — `SourceAgency.crawl_interval` is the sole scheduling authority (one crawl per agency, shared across every tracker; see `PROJECT-SPECIFICATIONS.MD` §8).

`concurrent_insertions` and `insertion_interval_minutes` are **intra-batch** controls, not inter-job rate limits: there is exactly one `CmsSyncRun` per `(crawl_run, user_integration)` (see 2.5), so there's nothing to rate-limit *across* jobs — these two fields instead govern how the orchestrator paces the individual property push calls *inside* that one job. The orchestrator resolves the destination account via `UserTrackedAgencyIntegrationLink` → `UserIntegration` (e.g. one EstateWeb email/password login), then applies these limits while processing the batch for that tracker.

## 2.4 UserTrackedAgencyIntegrationLink (new)

Explicit 1:1 mapping between a `UserTrackedAgency` and the `UserIntegration` that should receive its property pushes.

| Field | Purpose |
| --- | --- |
| `user_tracked_agency_id` | Unique — one link per tracker |
| `user_integration_id` | Unique — one link per integration connection |

Rules:

- Currently only meaningful for `integration_type = ESTATEWEB`. Other integration types (AI providers) do not have per-agency links.
- Both sides are `@unique`, so a given `UserTrackedAgency` maps to exactly one `UserIntegration`, and each `UserIntegration` is used by at most one tracked agency. To share credentials across multiple trackers, the user creates multiple `UserIntegration` rows (allowed because `IntegrationTarget.allow_multiple = true`).
- On the sync path: after a crawl for `UserTrackedAgency X` produces `UserProperty` create/update/remove events, the orchestrator resolves the linked `UserIntegration` via this table and pushes to that specific CMS account. See `EstateWebIntegrationResolverService.resolveForTrackedAgency()` for the reference implementation.
- If no link exists for a tracked agency, the orchestrator MAY fall back to the user's `is_default = true` `UserIntegration` for the same `integration_type` (product decision — document at implementation time).

## 2.5 CmsSyncRun

**One row per `(crawl_run_id, user_integration_id)` pair** (`@@unique` constraint) — a batch of every CREATE/UPDATE/REMOVE that crawl produced for that user's tracked agencies on that integration, not one row per property. `CrawlRun` stays exactly **one row per scraper run** regardless of how many users track the agency (see `PROJECT-SPECIFICATIONS.MD`); `CmsSyncRun` is where per-user CRM outcomes live instead.

| Field | Purpose |
| --- | --- |
| `crawl_run_id` | The crawl that produced this batch (required — a sync batch always exists in response to a crawl) |
| `user_integration_id` | Connection the batch was pushed to |
| `status` | `PENDING`, `SUCCESS`, `FAILED`, `RETRYING` — status of the **whole batch** |
| `attempt` | Current attempt number — a retry updates this same row in place, it does not create a new row |
| `max_attempts` | Retry ceiling |
| `total_created`, `total_updated`, `total_removed`, `total_failed` | Outcome breakdown for this batch: how many of this user's affected properties were created/updated/removed in their CMS, and how many push attempts within the batch failed |
| `payload` | Request bodies sent to CMS for this batch (JSON — e.g. an array of per-property requests) |
| `response` | CMS responses for this batch (JSON). Should also record **which properties failed**, e.g. `{ failed_property_ids: [...] }`, since there is no per-property row to carry that — a retry reads this to know what's left to push instead of redoing the whole batch |
| `error_message` | Failure detail (batch-level, or the last failure if some properties succeeded) |
| `started_at`, `finished_at` | Timing |

`CrawlRun.total_created/total_updated/total_removed/total_failed` are the **sum of every `CmsSyncRun` for that crawl** (`CrawlRunsService.recalculateCmsSyncTotals`, called whenever a batch row is created or updated) — i.e. "how many CRM changes resulted from this crawl, across every user." This is distinct from `CrawlRun.total_found`/`total_new_listings`/`total_refreshed_listings`, which describe the raw scrape itself and are set independently of any CMS sync outcome.

The model retains the `cms_sync_runs` table name and `CmsSyncRun` class name even though it references `crawl_run_id`/`user_integration_id` rather than a single property — this keeps the sync-specific audit log distinct from generic integration usage logs.

---

# 3. Integration Service Architecture

## 3.1 Adapter pattern

Each `IntegrationType` value that participates in CMS sync maps to one integration module under `api/src/integrations/<integration-type>/`:

- Integration-specific auth (login, session, token refresh)
- Integration-specific HTTP client (auth headers, endpoints, error mapping)
- Payload mapper: `UserProperty` → integration listing format
- Notification bridge to `Notification` table for operator visibility
- No business logic in controllers — sync orchestration lives in a dedicated feature service

Reference layout (matches the implemented EstateWeb adapter):

```
integrations/
└── estateweb/
    ├── estateweb.module.ts
    ├── config/
    │   └── estateweb.config.ts
    ├── services/
    │   ├── estateweb-auth.service.ts
    │   ├── estateweb-session.service.ts
    │   ├── estateweb-client.service.ts
    │   ├── estateweb-property.service.ts
    │   ├── estateweb-integration-resolver.service.ts
    │   └── estateweb-notification.service.ts
    ├── interfaces/
    │   ├── estateweb-auth.interface.ts
    │   ├── estateweb-session.interface.ts
    │   ├── estateweb-property.interface.ts
    │   ├── estateweb-integration.interface.ts
    │   ├── estateweb-notification.interface.ts
    │   └── estateweb-config.interface.ts
    ├── utils/
    │   ├── estateweb-error.util.ts
    │   ├── estateweb-html.util.ts
    │   ├── estateweb-property-validation.util.ts
    │   └── estateweb-session-config.util.ts
    ├── exceptions/
    │   └── estateweb.exception.ts
    └── constants/
```

## 3.2 Sync orchestrator

A `CmsSyncService` (or equivalent feature module) responsible for:

- Resolving the correct adapter from `IntegrationTarget.integration_type`
- Resolving the target `UserIntegration` for a given `UserTrackedAgency` via `UserTrackedAgencyIntegrationLink` (with optional `is_default` fallback)
- Loading `UserIntegration` credentials and `UserProperty` data
- Calling adapter create / update / remove / upload-image methods
- Writing and updating `CmsSyncRun` rows
- Enqueueing retries on failure (BullMQ job via `JobLog`)
- Respecting `UserTrackedAgency.concurrent_insertions` and `insertion_interval_minutes` when draining the queue

## 3.3 Injection

Use NestJS custom provider tokens per adapter (e.g. `CMS_ADAPTER_ESTATEWEB`) or a factory keyed by `IntegrationType`. The orchestrator must not import SDK clients directly in feature modules — follow the `integrations/` encapsulation from the API rules. Adapters live in their own module and are re-exported (see `EstateWebModule`).

## 3.4 Out of scope for adapters

- Scraping or normalizing source data (handled upstream)
- Managing `UserIntegration` CRUD or `UserTrackedAgencyIntegrationLink` CRUD (handled by config UI in the current phase)
- Modifying canonical `Property` or `UserProperty` content beyond reading for push

## 3.5 EstateWeb reference implementation

Implemented in `api/src/integrations/estateweb/`. Summary of behaviour the orchestrator can rely on:

**Config (`EstateWebConfig`)**
Defaults: `baseUrl = https://app.estateweb.gr`, `sessionTtlMs = 6h`, `loginTimeoutMs = 45s`, `sessionCookie = estate_session`, headless Playwright. API paths: `POST /login`, `GET /app`, `/api/property`, `/api/property/:id`, `/api/property/:id/img`.

**Auth (`EstateWebAuthService`)**
Uses Playwright (`chromium.launch`) to load `/login`, read the `__csrf` input, submit `email` + `password`, and capture:

- `estate_session` cookie
- Bearer `token` scraped from the `/app` HTML (via `extractAppToken`)
- CSRF token

`refreshToken()` reuses the existing `estate_session` cookie against `/app` to pull a fresh bearer, falling back to full login if that fails.

**Session (`EstateWebSessionService`)**
Two-layer cache: in-memory `Map<userIntegrationId, CachedEstateWebSession>` + persisted in `UserIntegration.config.estateweb.session` (JSON). `getSession()` returns a cached session if not expired, otherwise it takes a per-integration login lock and calls `EstateWebAuthService.login()`. `invalidateSession()` clears both layers. `persistSession()` stores the session with `expiresAt = now + sessionTtlMs`.

**Client (`EstateWebClientService`)**
`request(userIntegrationId, options)`:

1. Get a valid session via `EstateWebSessionService`
2. Assert `estateSession` cookie and bearer `token` are present (else throw typed `EstateWebException`)
3. Build headers: `Cookie: estate_session=…`, `Authorization: Bearer …`, `Accept: application/json`, `Accept-Language`
4. `fetch()` with JSON body or `FormData` (multipart)
5. On `401/403` → invalidate session, refresh once, retry (single retry, `retryOnUnauthorized = false` on the second attempt)
6. Map HTTP status → typed exceptions: `401` → `ESTATEWEB_SESSION_EXPIRED`, `403` → `ESTATEWEB_UNAUTHORIZED`, `404` → `ESTATEWEB_NOT_FOUND`, `408/504` → `ESTATEWEB_REQUEST_TIMEOUT`, `429` → `ESTATEWEB_RATE_LIMITED`, `5xx` → `ESTATEWEB_SERVER_ERROR`, other → `ESTATEWEB_API_ERROR`
7. Enforce JSON content type; wrap parse errors as `ESTATEWEB_INVALID_JSON` / `ESTATEWEB_INVALID_RESPONSE`
8. On any failure, forward the error context to `EstateWebNotificationService.captureError()`

Multipart helpers: `createMultipartPayload(payload)` and `createMultipartImageUpload(payload, image, filename, mimeType)`.

**Property operations (`EstateWebPropertyService`)**
`listProperties`, `createProperty`, `updateProperty`, `uploadPropertyImage`, `getProperty`. Each call runs through `assertValidCreatePayload` / `assertValidPropertyId` / `assertValidImageUpload` / `assertValidListQuery` before hitting the client. `createProperty` sends the payload as `multipart/form-data` (single `payload` JSON field) and validates the response shape.

**Integration resolution (`EstateWebIntegrationResolverService`)**
Central entry point used by the sync orchestrator:

- `resolveByUserIntegrationId(userIntegrationId, userId?)` — direct lookup
- `resolveForTrackedAgency(userId, sourceAgencyId)` — resolves via `UserTrackedAgencyIntegrationLink`
- `resolveForUserTrackedAgencyId(userTrackedAgencyId, userId?)` — same as above but keyed by tracker id
- `listUserIntegrations(userId)` — all EstateWeb accounts for a user
- `listLinkedIntegrationsForUser(userId)` — all links for a user (returns `{ linkId, userTrackedAgencyId, sourceAgencyId, trackerEnabled, integration }`)
- `testConnection(userIntegrationId, userId?)` — forces a fresh login and persists the resulting session

All resolvers require `auth_type = EMAIL_PASSWORD` and both `email` + `password`; otherwise they throw `ESTATEWEB_MISSING_CREDENTIALS`.

**Notifications (`EstateWebNotificationService`)**
Wraps `NotificationsService.create()` for every failure captured by the adapter. Automatically deduplicates via a `WeakSet` so a single error object never fires two notifications. Resolves `source_agency_id` from the `UserTrackedAgencyIntegrationLink` (if any) so admins can pivot from a notification straight to the affected tracker. Severity mapping matches the `NotificationType` enum values listed in section 6.4.

**Exceptions**
All adapter errors are `EstateWebException` (extends `HttpException`) carrying:

- `message`
- `code: NotificationType` — one of the `ESTATEWEB_*` enum values
- `details?: Record<string, unknown>`

Consumers should catch `EstateWebException`, log/notify, and map to a `CmsSyncRun.status = FAILED` with the `code` stored in `error_message` / `response`.

---

# 4. Sync Triggers

## 4.1 Crawl pipeline (automatic)

The crawl itself (Playwright scrape + AI normalization) runs **once per `CrawlRun`, shared across every user tracking that agency** — see `PROJECT-SPECIFICATIONS.MD`. CMS sync is the per-user fan-out that happens after: once the shared crawl has created/updated canonical `Property` rows, written `PropertyHistory`, and created/updated each tracker's `UserProperty` rows (already per-tracker — see `UserPropertiesService.syncForProperty`), collect every affected `UserProperty` **per tracked agency's linked integration** into one batch:

```
… Create / Update / Remove (PropertyHistory) — one shared CrawlRun
↓
Create or update UserProperty for each tracking user (already per-tracker)
↓
Group this crawl's affected UserProperty rows by UserTrackedAgency
↓
For each UserTrackedAgency that has a UserTrackedAgencyIntegrationLink
pointing at an active UserIntegration + active IntegrationTarget:
  create/update ONE CmsSyncRun row for (this crawl_run, that user_integration)
  push the batch's creates/updates/removes, chunked by concurrent_insertions
  with insertion_interval_minutes between chunks
  accumulate total_created/total_updated/total_removed/total_failed on that row
↓
CrawlRunsService.recalculateCmsSyncTotals(crawl_run_id) — rolls the batch(es) up onto CrawlRun
↓
Generate reports
```

The link lookup replaces the old "for each active UserCms" fan-out: the sync target is deterministic per tracked agency, not per user. Within one tracker's batch, `track_new_listings`/`track_updated_listings`/`track_removed_listings` (on `UserTrackedAgency`) still decide which of that crawl's changes are included at all.

### New listing

First time a tracking user gets a `UserProperty` for a listing → included as a `CREATE` push in that tracker's `CmsSyncRun` batch for this crawl; counted in `total_created` on success. Adapter also uploads images via `uploadPropertyImage` after create (EstateWeb requires a separate multipart request per image).

### Updated listing

Canonical change detected and `UserProperty` updated (or user copy refreshed) → included as an `UPDATE` push in the batch; counted in `total_updated`. Only changed fields need be sent if the adapter supports partial update (EstateWeb `PATCH /api/property/:id` supports partial payload).

### Removed listing

`SourceProperty` marked `REMOVED`, `PropertyHistory` written, user's `UserProperty` reflects removal → included as a `REMOVE` push in the batch; counted in `total_removed`.

## 4.2 Connect / link (manual)

When a user completes an EstateWeb `UserIntegration` connect flow **and links it to a tracked agency** via `UserTrackedAgencyIntegrationLink`:

1. Create or update `UserIntegration` with `is_active: true` and valid `email` + `password`
2. Create/update `UserTrackedAgencyIntegrationLink`
3. Optionally call `EstateWebIntegrationResolverService.testConnection()` to force a login and persist a working session before the first sync runs
4. **Enqueue initial backfill** — one `CmsSyncRun` batch (not tied to any `CrawlRun` in this case — see note below) containing a `CREATE` push per existing `UserProperty` for that tracked agency (respecting `is_modified` policy: optionally skip or push user-edited copies based on product decision; chunk by `concurrent_insertions` / `insertion_interval_minutes` when pushing)

Note: `CmsSyncRun.crawl_run_id` is required for crawl-driven batches (4.1). A backfill batch has no crawl to attach to — either relax the FK to nullable specifically for this case, or synthesize a no-op `CrawlRun` for the backfill so the constraint holds and `recalculateCmsSyncTotals` still works uniformly (product/implementation decision).

## 4.3 Manual retry (admin)

From the CMS Sync subpage, admin can retry any failed `CmsSyncRun` batch — resets status to `PENDING` or `RETRYING`, re-enqueues, and (per 2.5) should only re-push the properties recorded as failed in `response`, not the whole batch, when that information is available.

## 4.4 Manual retry (user)

Optional: user-facing "Retry failed syncs" on Integrations page for their connection.

---

# 5. Retry and No-Data-Loss Guarantees

- The first property push for a `(crawl_run, user_integration)` pair creates the `CmsSyncRun` row for that batch; every subsequent push in the same batch, and every retry, updates that same row in place — nothing per-property is ever a separate row
- As each property push resolves, increment `total_created`/`total_updated`/`total_removed` (success) or `total_failed` (failure) on the row, and append the outcome to `response` (e.g. `{ failed_property_ids: [...] }`) so a retry knows exactly what's left, not just that "something" failed
- On any failure within the batch: set `status: FAILED` or `RETRYING`, store `error_message`, increment `attempt`
- Background worker retries the batch (re-pushing only the properties recorded as failed, per `response`) with exponential backoff until `attempt >= max_attempts`
- On 401/403 the adapter internally invalidates and re-logs-in **once**; if the retry still fails, the batch moves to `FAILED` with `ESTATEWEB_SESSION_EXPIRED` / `ESTATEWEB_UNAUTHORIZED`
- Failed batches remain visible in admin CMS Sync subpage until `SUCCESS` or manual resolution
- **Nothing is silently dropped** — if the CMS was unreachable, the row persists and retries; a batch that partially succeeds is `SUCCESS` for the properties that landed and `RETRYING`/`FAILED` for the rest, tracked via `total_failed` rather than a separate row per property
- On full success: `status: SUCCESS`, store `response`, set `finished_at`
- After any update to a `CmsSyncRun` row, call `CrawlRunsService.recalculateCmsSyncTotals(crawl_run_id)` so `CrawlRun`'s rolled-up totals stay current

When `max_attempts` is exhausted:

- Row stays `FAILED` (with whichever properties never succeeded reflected in `total_failed` / `response`)
- Generate `Notification` (`type: CMS_SYNC_FAILURE` or a specific `ESTATEWEB_*` type — see 6.4, link to `UserIntegration` / `UserTrackedAgency` / `CrawlRun`)
- Admin can manually retry or investigate

---

# 6. Admin Dashboard

## 6.1 Dashboard home KPIs (additions)

- CMS Synchronization Status — pending / failed `CmsSyncRun` counts across all `UserIntegration` connections
- Active CMS Connections — `UserIntegration` with `is_active: true` and `integration_type` participating in sync (currently `ESTATEWEB`) / total configured

## 6.2 Integration Targets (`/admin/integration-targets`) — sync extensions

Extends the configuration-only subpage from the current phase:

- Connected accounts table adds **recent sync success/failure counts** per `UserIntegration`
- Disabling a target (`is_enabled: false`) **pauses sync** for all linked `UserIntegration` rows (no new jobs enqueued; in-flight jobs should complete or fail gracefully)

## 6.3 CMS Sync (`/admin/cms-sync`) — new subpage

Backed by: `CmsSyncRun` (one row per crawl per user integration), `UserIntegration`, `CrawlRun`, `UserTrackedAgencyIntegrationLink`

- List / filter by `status`, `user_integration`, tracked agency, user, `crawl_run`, date range — no `action` or `property` filter, since a row now covers a whole crawl's worth of changes for one user, not a single property/action
- Detail view: `total_created`/`total_updated`/`total_removed`/`total_failed` breakdown, payload sent, response received (including which properties failed, if any), `error_message`, attempt count, linked `UserIntegration`, `UserTrackedAgency`, and the source `CrawlRun`
- **Retry sync** action on failed rows — re-pushes only the properties recorded as failed in `response`, not the whole batch
- Bulk retry for selected failed rows (optional)

## 6.4 Notifications (`/admin/notifications`) — addition

- Generic `CMS_SYNC_FAILURE` notification type for adapter-agnostic sync failures
- Adapter-specific `ESTATEWEB_*` notification types already defined in the `NotificationType` enum and emitted by `EstateWebNotificationService`:

  `ESTATEWEB_NETWORK_ERROR`, `ESTATEWEB_REQUEST_TIMEOUT`, `ESTATEWEB_UNAUTHORIZED`, `ESTATEWEB_SESSION_EXPIRED`, `ESTATEWEB_API_ERROR`, `ESTATEWEB_NOT_FOUND`, `ESTATEWEB_RATE_LIMITED`, `ESTATEWEB_INVALID_RESPONSE`, `ESTATEWEB_MISSING_PROPERTY_ID`, `ESTATEWEB_VALIDATION_FAILED`, `ESTATEWEB_LOGIN_FAILED`, `ESTATEWEB_MISSING_CSRF`, `ESTATEWEB_MISSING_SESSION_COOKIE`, `ESTATEWEB_LOGIN_REDIRECT_FAILED`, `ESTATEWEB_MISSING_CREDENTIALS`, `ESTATEWEB_INTEGRATION_INACTIVE`, `ESTATEWEB_INTEGRATION_NOT_FOUND`, `ESTATEWEB_MISSING_TOKEN`, `ESTATEWEB_INVALID_JSON`, `ESTATEWEB_SERVER_ERROR`, `ESTATEWEB_EMPTY_IMAGE`, `ESTATEWEB_INVALID_PROPERTY_ID`, `ESTATEWEB_LINK_NOT_FOUND`, `ESTATEWEB_SESSION_PERSIST_FAILED`

All notifications deep-link to the failed `CmsSyncRun`, its `UserIntegration`, and (when resolvable) the `SourceAgency` behind the linked `UserTrackedAgency`.

## 6.5 Users subpage — addition

- Per-user detail shows sync summary per `UserIntegration` connection (last success, pending/failed counts) and lists all `UserTrackedAgencyIntegrationLink` rows so admins can see which tracker uses which credentials

---

# 7. User Integrations Page (`/integrations`) — sync extensions

Extends the configuration-only Integrations page from the current phase.

### Connected accounts (additions)

- **Sync status summary** — recent `CmsSyncRun` counts (pending, failed, last success)
- Link to **per-connection sync history** (read-only list of `CmsSyncRun` for that `UserIntegration`)
- **Enable / Disable** — disabling pauses sync without deleting credentials (already in config phase; now affects job enqueueing)
- **Default connection** — toggle `is_default` for the fallback when a `UserTrackedAgency` has no explicit link

### Tracker → integration linking

- For each `UserTrackedAgency` on the tracker management screen, allow selecting a `UserIntegration` for the same `integration_type` (creates/updates the `UserTrackedAgencyIntegrationLink`)
- Warn when a tracker has no link and no `is_default` connection exists — sync will not run

### Connect flow (addition)

Step 5 after creating or linking a `UserIntegration`:

- Call the adapter's test-connection method (e.g. `EstateWebIntegrationResolverService.testConnection()`) to persist a working session
- Enqueue **initial backfill sync** for all existing `UserProperty` rows belonging to the linked `UserTrackedAgency`

### Disconnect (addition)

- Warn if pending `CmsSyncRun`s exist for the connection
- Warn if any `UserTrackedAgencyIntegrationLink` still references this `UserIntegration` — disconnecting will cascade-delete the link (`onDelete: Cascade`), and subsequent crawls will have no target
- Policy: cancel pending jobs, or let them complete before delete (product decision — document in implementation)

---

# 8. Property Update and Removal Behaviour

## 8.1 Updates

When crawl detects field changes on a canonical `Property`:

1. Write `PropertyHistory`
2. Update tracking users' `UserProperty` (respect `is_modified` — do not overwrite user edits without explicit re-sync)
3. For each affected `UserProperty` whose owning `UserTrackedAgency` has an active `UserTrackedAgencyIntegrationLink`, include it as an `UPDATE` push in that tracker's `CmsSyncRun` batch for this crawl, with changed fields only where the adapter supports it (EstateWeb: `PATCH /api/property/:id` with partial payload)

## 8.2 Removals

When a listing is removed from source:

1. `SourceProperty.status` → `REMOVED`
2. `PropertyHistory` (`REMOVED`)
3. Update `UserProperty` to reflect removal
4. Include it as a `REMOVE` push in the linked `UserIntegration`'s batch for this crawl

## 8.3 Reappearance

When a removed listing reappears:

1. `PropertyHistory` (`REAPPEARED`)
2. Restore `UserProperty` status
3. Include it as a `CREATE` or `UPDATE` push in the linked `UserIntegration`'s batch (adapter decides based on whether the CMS still has the listing — EstateWeb should probe with `GET /api/property/:id` when a local reference exists)

---

# 9. Background Jobs

Sync execution runs outside the HTTP request path:

- Queue: dedicated CMS sync queue (e.g. `cms-sync`) via BullMQ
- **One job per `CmsSyncRun` batch** — i.e. one job per `(crawl_run, user_integration)` pair, not one job per property. The job creates the row (if not already present from a prior attempt) and processes every affected property for that tracker within it
- Jobs linked to `JobLog` for monitoring on `/admin/jobs`
- Worker calls orchestrator → adapter (via `EstateWebPropertyService` etc.) → external CMS API, once per property in the batch
- Failed jobs respect retry policy and update the batch's `CmsSyncRun` row atomically (see §5)

**Per-tracker CMS throttling** — now an **intra-job** concern rather than inter-job rate limiting, since there is only one job per tracker per crawl. The worker MUST honour the two fields on `UserTrackedAgency` while processing that one batch:

- `concurrent_insertions` — how many of the batch's property pushes (CREATE, UPDATE, REMOVE combined) the worker runs concurrently at a time. Typical value `1` avoids racing the same EstateWeb account with parallel writes.
- `insertion_interval_minutes` — minimum delay between successive chunks of `concurrent_insertions` pushes within the batch. Prevents flooding EstateWeb (or another CMS adapter) when a crawl produced hundreds of changed `UserProperty` rows for one tracker.

Implement as a simple chunked loop inside the batch job (push `concurrent_insertions` properties, await all, sleep `insertion_interval_minutes`, repeat) — no BullMQ job-group/rate-limit machinery needed for this, since it's pacing work within a single job rather than across jobs.

**Per-integration concurrency** — separately, cap how many *different trackers'* batch jobs for the same `UserIntegration` run at once (should typically be 1, since one `UserIntegration` maps to at most one `UserTrackedAgencyIntegrationLink` — see 2.4) to avoid CMS-side rate limits (EstateWeb returns `429` → `ESTATEWEB_RATE_LIMITED`).

---

# 10. Security

- Credentials on `UserIntegration` must never be returned in API responses or logs — mask in UI
- Encrypt `api_key_secret`, `password` at rest (application-level or DB-level — implementation detail)
- Adapters receive decrypted credentials only in memory during sync execution
- OAuth flow (`auth_type: OAUTH`) stores tokens in `config` or dedicated fields — refresh before expiry
- EstateWeb session data (`estate_session` cookie, bearer token, CSRF) is persisted inside `UserIntegration.config.estateweb.session` with an `expiresAt` and MUST be treated as a secret with the same protection as `password`
- Playwright login runs headless server-side; never expose the browser or its screenshots to end users

---

# 11. Logging

Log events specific to this phase:

- CMS sync batch job enqueued (`crawl_run_id`, `user_integration_id`, `user_tracked_agency_id`)
- CMS sync attempt started / succeeded / failed, per property within the batch and for the batch as a whole
- CMS sync retry scheduled (including 401/403 session-refresh retry)
- CMS sync max attempts exhausted
- CMS sync manual retry triggered (admin/user)
- Initial backfill started / completed
- EstateWeb session created / refreshed / invalidated / persisted (already logged by `EstateWebSessionService` and `EstateWebAuthService`)
- Adapter-level notifications published (already handled by `EstateWebNotificationService`)

---

# 12. Future Expansion

- Additional `IntegrationType` values participating in CMS sync (WordPress, custom REST, etc.) — each adds its own `integrations/<type>/` module following the EstateWeb layout
- Webhook callbacks from CMS on publish confirmation
- Two-way sync (CMS edits pulled back — out of initial sync scope)
- Per-field mapping UI instead of raw `config` JSON
- Sync timing as a per-tracker override — e.g. delaying a whole batch to run overnight instead of immediately after its crawl, independent of `insertion_interval_minutes` (which paces *within* a batch, not *when* the batch runs)
- Rate-limit-aware adaptive concurrency per CMS provider (auto-tune `concurrent_insertions` on repeated `429`s)
- Multi-target link table (`UserTrackedAgencyIntegrationLink` becomes many-to-many) if a single tracker ever needs to push to multiple CMS accounts

---

# 13. Success Criteria

When this specification is fully implemented:

**Administrators can:**

- View pending and failed sync operations across all users on `/admin/cms-sync`
- Retry failed syncs individually or in bulk
- See sync health KPIs on the dashboard home
- See per-connection sync stats on Integration Targets and Users subpages
- Receive `CMS_SYNC_FAILURE` and adapter-specific (`ESTATEWEB_*`) notifications and act on them

**Users can:**

- See sync status (pending, failed, last success) for each connected integration on `/integrations`
- Hold multiple `UserIntegration` rows per CMS type (multiple EstateWeb accounts) and link each `UserTrackedAgency` to the correct one
- Tune per-agency throttling via `concurrent_insertions` and `insertion_interval_minutes`
- Browse per-connection sync history
- Trigger backfill automatically on connect/link
- Rely on crawl-driven automatic push for new, updated, and removed listings

**System guarantees:**

- Every crawl's push to a user's CMS is recorded as one `CmsSyncRun` batch (`crawl_run_id` + `user_integration_id`); `CrawlRun` itself stays one row per scraper run no matter how many users track the agency, with its totals rolled up from `cms_sync_runs`
- Failed syncs are retried up to `max_attempts` and never silently dropped — partial batch failures are tracked via `total_failed` and the failed-property list in `response`, so a retry re-pushes only what's left
- Sync only runs for active `UserIntegration` + active parent `IntegrationTarget`
- Sync target for each `UserTrackedAgency` is resolved deterministically via `UserTrackedAgencyIntegrationLink` (with optional `is_default` fallback)
- Per-tracker throttling (`concurrent_insertions`, `insertion_interval_minutes`) paces property pushes **within** each tracker's batch
- Each participating `IntegrationType` is isolated in its own `integrations/<type>/` module with no scraping or normalization logic — the EstateWeb module is the reference implementation

---

# 14. Related Documents

- `PROJECT-SPECIFICATIONS.MD` — main platform spec; current phase ends at `UserProperty` + `PropertyHistory`. Also defines `CrawlRun` as one row per scraper run (shared across trackers) and `SourceAgency.crawl_interval` as the sole crawl-scheduling authority — this spec's `CmsSyncRun` batches are the per-user layer built on top of that shared crawl
- `api/prisma/schema.prisma` — `CrawlRun`, `IntegrationTarget`, `UserIntegration`, `UserTrackedAgency`, `UserTrackedAgencyIntegrationLink`, `CmsSyncRun`, `NotificationType`, `IntegrationType`, `AuthType` enums
- `api/src/integrations/estateweb/` — reference adapter implementation (auth, session, client, property, resolver, notifications, exceptions)
- `scraping-generation-computer-use-architecture.md` — upstream crawl pipeline (sync step plugs in after `UserProperty` update)
