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

Which `SourceAgency` a user tracks. Includes **crawl scheduling** (`crawl_interval`) and **CMS outbound sync throttling** (`concurrent_insertions`, `insertion_interval_minutes`) for the linked integration (e.g. EstateWeb).

These two fields do **not** control Playwright crawl concurrency — that is governed separately by `CRAWL_WORKER_CONCURRENCY` on the crawl BullMQ worker.

| Field | Purpose |
| --- | --- |
| `user_id`, `source_agency_id` | Ownership + tracked agency |
| `enabled` | User-level tracker on/off |
| `crawl_interval` | Cron expression for scheduled **source-agency scrapes** (default `0 */6 * * *`) — unrelated to CMS push rate |
| `concurrent_insertions` | Max parallel **CMS sync jobs** (`CmsSyncRun`) pushed to the linked `UserIntegration` after a crawl (default `1`). Despite the name, this limit applies to **CREATE, UPDATE, and REMOVE** sync actions — not only new listings |
| `insertion_interval_minutes` | Minimum delay between consecutive **CMS sync jobs** for this tracker (default `5`). Throttles bulk push to the integration (e.g. EstateWeb `POST/PATCH/DELETE /api/property`) after a large crawl so the CMS is not flooded |
| `track_new_listings`, `track_updated_listings`, `track_removed_listings` | Which change types enqueue CMS sync at all |
| `use_ai_batching`, `ai_provider`, `ai_model` | AI-assisted normalization settings (upstream of sync) |

`concurrent_insertions` and `insertion_interval_minutes` are read from the `UserTrackedAgency` that produced the `UserProperty` change. The orchestrator resolves the destination account via `UserTrackedAgencyIntegrationLink` → `UserIntegration` (e.g. one EstateWeb email/password login), then applies these limits when enqueueing and processing `CmsSyncRun` jobs for that tracker.

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

Append-only audit log of every push attempt for a `UserIntegration` + `UserProperty` pair. Rows are never deleted on failure.

| Field | Purpose |
| --- | --- |
| `user_integration_id` | Connection used for the push |
| `user_property_id` | Property copy being synced (nullable for edge cases) |
| `action` | `CREATE`, `UPDATE`, or `REMOVE` |
| `status` | `PENDING`, `SUCCESS`, `FAILED`, `RETRYING` |
| `attempt` | Current attempt number |
| `max_attempts` | Retry ceiling |
| `payload` | Request body sent to CMS (JSON) |
| `response` | CMS response (JSON) |
| `error_message` | Failure detail |
| `started_at`, `finished_at` | Timing |

The model retains the `cms_sync_runs` table name and `CmsSyncRun` class name even though it references `user_integration_id` — this keeps the sync-specific audit log distinct from generic integration usage logs.

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

After the crawl pipeline creates/updates canonical `Property`, writes `PropertyHistory`, and creates/updates `UserProperty` for tracking users, **enqueue sync jobs** for each affected `UserProperty`:

```
… Create / Update / Remove (PropertyHistory)
↓
Create or update UserProperty for tracking users
↓
For each affected UserProperty owned by a UserTrackedAgency
that has a UserTrackedAgencyIntegrationLink pointing at an
active UserIntegration + active IntegrationTarget:
  enqueue CmsSyncRun (CREATE | UPDATE | REMOVE)
  respecting concurrent_insertions and insertion_interval_minutes
↓
Generate reports
```

The link lookup replaces the old "for each active UserCms" fan-out: the sync target is deterministic per tracked agency, not per user.

### New listing

First time a tracking user gets a `UserProperty` for a listing → `CmsSyncRun` with `action: CREATE`. Adapter also uploads images via `uploadPropertyImage` after create (EstateWeb requires a separate multipart request per image).

### Updated listing

Canonical change detected and `UserProperty` updated (or user copy refreshed) → `CmsSyncRun` with `action: UPDATE`. Only changed fields need be sent if the adapter supports partial update (EstateWeb `PATCH /api/property/:id` supports partial payload).

### Removed listing

`SourceProperty` marked `REMOVED`, `PropertyHistory` written, user's `UserProperty` reflects removal → `CmsSyncRun` with `action: REMOVE`.

## 4.2 Connect / link (manual)

When a user completes an EstateWeb `UserIntegration` connect flow **and links it to a tracked agency** via `UserTrackedAgencyIntegrationLink`:

1. Create or update `UserIntegration` with `is_active: true` and valid `email` + `password`
2. Create/update `UserTrackedAgencyIntegrationLink`
3. Optionally call `EstateWebIntegrationResolverService.testConnection()` to force a login and persist a working session before the first sync runs
4. **Enqueue initial backfill** — one `CREATE` sync job per existing `UserProperty` for that tracked agency (respecting `is_modified` policy: optionally skip or push user-edited copies based on product decision; respect `concurrent_insertions` / `insertion_interval_minutes` when queuing)

## 4.3 Manual retry (admin)

From the CMS Sync subpage, admin can retry any failed `CmsSyncRun` — resets status to `PENDING` or `RETRYING` and re-enqueues.

## 4.4 Manual retry (user)

Optional: user-facing "Retry failed syncs" on Integrations page for their connection.

---

# 5. Retry and No-Data-Loss Guarantees

- Every sync attempt creates or updates a `CmsSyncRun` row before calling the external CMS
- On failure: set `status: FAILED` or `RETRYING`, store `error_message` and `response`, increment `attempt`
- Background worker retries with exponential backoff until `attempt >= max_attempts`
- On 401/403 the adapter internally invalidates and re-logs-in **once**; if the retry still fails, the `CmsSyncRun` moves to `FAILED` with `ESTATEWEB_SESSION_EXPIRED` / `ESTATEWEB_UNAUTHORIZED`
- Failed rows remain visible in admin CMS Sync subpage until `SUCCESS` or manual resolution
- **Nothing is silently dropped** — if the CMS was unreachable, the row persists and retries
- On success: `status: SUCCESS`, store `response`, set `finished_at`

When `max_attempts` is exhausted:

- Row stays `FAILED`
- Generate `Notification` (`type: CMS_SYNC_FAILURE` or a specific `ESTATEWEB_*` type — see 6.4, link to `UserIntegration` / `UserTrackedAgency` / property)
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

Backed by: `CmsSyncRun`, `UserIntegration`, `UserProperty`, `UserTrackedAgencyIntegrationLink`

- List / filter by `status`, `action`, `user_integration`, tracked agency, user, property, date range
- Detail view: payload sent, response received, `error_message`, attempt count, linked `UserIntegration`, `UserTrackedAgency`, and `UserProperty`
- **Retry sync** action on failed rows
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
3. For each affected `UserProperty` whose owning `UserTrackedAgency` has an active `UserTrackedAgencyIntegrationLink`, enqueue `UPDATE` sync with changed fields only where the adapter supports it (EstateWeb: `PATCH /api/property/:id` with partial payload)

## 8.2 Removals

When a listing is removed from source:

1. `SourceProperty.status` → `REMOVED`
2. `PropertyHistory` (`REMOVED`)
3. Update `UserProperty` to reflect removal
4. Enqueue `REMOVE` sync via the linked `UserIntegration`

## 8.3 Reappearance

When a removed listing reappears:

1. `PropertyHistory` (`REAPPEARED`)
2. Restore `UserProperty` status
3. Enqueue `CREATE` or `UPDATE` sync via the linked `UserIntegration` (adapter decides based on whether the CMS still has the listing — EstateWeb should probe with `GET /api/property/:id` when a local reference exists)

---

# 9. Background Jobs

Sync execution runs outside the HTTP request path:

- Queue: dedicated CMS sync queue (e.g. `cms-sync`) via BullMQ
- Each job processes one `CmsSyncRun` (or creates one then processes)
- Jobs linked to `JobLog` for monitoring on `/admin/jobs`
- Worker calls orchestrator → adapter (via `EstateWebPropertyService` etc.) → external CMS API
- Failed jobs respect retry policy and update `CmsSyncRun` atomically

**Per-tracker CMS throttling** — the `cms-sync` worker MUST honour the two fields on `UserTrackedAgency` when pushing to the linked `UserIntegration` (EstateWeb account):

- `concurrent_insertions` — max in-flight CMS sync jobs (`CmsSyncRun`) for the same `UserTrackedAgency` at any moment. Applies to CREATE, UPDATE, and REMOVE. Typical value `1` avoids racing the same EstateWeb account with parallel writes.
- `insertion_interval_minutes` — minimum delay between consecutive CMS sync jobs for the same tracker. Prevents flooding EstateWeb (or another CMS adapter) after a bulk crawl that produced hundreds of new or updated `UserProperty` rows.

Implement via BullMQ job group / rate-limit keyed on `user_tracked_agency_id`, or a scheduler that meters job enqueueing per tracker before calling `EstateWebPropertyService.createProperty` / `updateProperty` / etc.

**Per-integration concurrency** — separately, cap concurrent sync jobs per `UserIntegration` to avoid CMS-side rate limits (EstateWeb returns `429` → `ESTATEWEB_RATE_LIMITED`).

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

- CMS sync job enqueued (`user_integration_id`, `user_property_id`, `action`, `user_tracked_agency_id`)
- CMS sync attempt started / succeeded / failed
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
- Sync scheduling (batch overnight pushes vs immediate) as a per-tracker override of `insertion_interval_minutes`
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

- Every push attempt is recorded in `CmsSyncRun`
- Failed syncs are retried up to `max_attempts` and never silently dropped
- Sync only runs for active `UserIntegration` + active parent `IntegrationTarget`
- Sync target for each `UserTrackedAgency` is resolved deterministically via `UserTrackedAgencyIntegrationLink` (with optional `is_default` fallback)
- Per-tracker throttling honours `concurrent_insertions` and `insertion_interval_minutes`
- Each participating `IntegrationType` is isolated in its own `integrations/<type>/` module with no scraping or normalization logic — the EstateWeb module is the reference implementation

---

# 14. Related Documents

- `PROJECT-SPECIFICATIONS.MD` — main platform spec; current phase ends at `UserProperty` + `PropertyHistory`
- `api/prisma/schema.prisma` — `IntegrationTarget`, `UserIntegration`, `UserTrackedAgency`, `UserTrackedAgencyIntegrationLink`, `CmsSyncRun`, `NotificationType`, `IntegrationType`, `AuthType` enums
- `api/src/integrations/estateweb/` — reference adapter implementation (auth, session, client, property, resolver, notifications, exceptions)
- `scraping-generation-computer-use-architecture.md` — upstream crawl pipeline (sync step plugs in after `UserProperty` update)
