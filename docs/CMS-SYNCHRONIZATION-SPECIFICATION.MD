# CMS Synchronization Specification

Functional specification for pushing `UserProperty` data to external CMS instances. **Out of scope for the current implementation phase** — see `PROJECT-SPECIFICATIONS.MD` (Implementation Scope). This document describes the full sync feature to be built after the crawl → `Property` → `UserProperty` → `PropertyHistory` pipeline is complete.

---

# 1. Overview

The platform aggregates listings from agency websites into normalized `Property` records and personal `UserProperty` copies for tracking users. This phase adds **outbound synchronization**: each user's `UserProperty` rows are pushed to their connected CMS account via `UserCms`.

Goals:

- Push new, updated, and removed listings to the user's CMS
- Support multiple CMS types via pluggable integration adapters
- Guarantee no data loss on failure — every attempt is recorded and retried until success or manual resolution
- Provide full visibility into sync health for admins and users

**Prerequisite (current phase):** `CmsTarget` and `UserCms` configuration UI, crawl-time `UserProperty` create/update, and `PropertyHistory` must already be implemented. Sync builds on top of those; it does not replace them.

---

# 2. Data Model

Backed by Prisma models in `api/prisma/schema.prisma`.

## 2.1 CmsTarget

Platform-defined CMS type. Managed by admins (configuration UI exists in the current phase).

| Field | Purpose |
| --- | --- |
| `cms_type` | `CmsType` enum (e.g. `ESTATEWEB`) — selects the integration adapter |
| `auth_type` | `AuthType` enum — determines credential fields on `UserCms` |
| `base_url` | Default API/base URL for this CMS type |
| `allow_multiple` | Whether one user may have multiple connections to this target |
| `is_active` | Platform-wide enable; when false, no sync runs for linked connections |

## 2.2 UserCms

Per-user connection to a `CmsTarget` with that user's credentials.

| Field | Purpose |
| --- | --- |
| `cms_target_id` | Parent target |
| `user_id` | Owning user |
| `api_key_secret` | Used when `auth_type` is `API_KEY` or `BEARER_TOKEN` |
| `email`, `username`, `password` | Used per `auth_type` (`EMAIL_PASSWORD`, `USERNAME_PASSWORD`) |
| `config` | JSON — CMS-specific field mapping, category defaults, etc. |
| `is_active` | User-level enable; when false, sync is paused for this connection |

Sync runs only when **both** `UserCms.is_active` and parent `CmsTarget.is_active` are true.

## 2.3 CmsSyncRun

Append-only audit log of every push attempt for a `UserCms` + `UserProperty` pair. Rows are never deleted on failure.

| Field | Purpose |
| --- | --- |
| `user_cms_id` | Connection used for the push |
| `user_property_id` | Property copy being synced (nullable for edge cases) |
| `action` | `CREATE`, `UPDATE`, or `REMOVE` |
| `status` | `PENDING`, `SUCCESS`, `FAILED`, `RETRYING` |
| `attempt` | Current attempt number |
| `max_attempts` | Retry ceiling |
| `payload` | Request body sent to CMS (JSON) |
| `response` | CMS response (JSON) |
| `error_message` | Failure detail |
| `started_at`, `finished_at` | Timing |

---

# 3. Integration Service Architecture

## 3.1 Adapter pattern

Each `CmsType` value maps to one integration module under `api/src/integrations/<cms-type>/`:

- CMS-specific HTTP client (auth, endpoints, error mapping)
- Payload mapper: `UserProperty` → CMS listing format
- No business logic in controllers — sync orchestration lives in a dedicated service

Example layout:

```
integrations/
└── estateweb/
    ├── estateweb.module.ts
    ├── estateweb.client.ts
    ├── estateweb.mapper.ts
    └── estateweb.types.ts
```

## 3.2 Sync orchestrator

A `CmsSyncService` (or equivalent feature module) responsible for:

- Resolving the correct adapter from `CmsTarget.cms_type`
- Loading `UserCms` credentials and `UserProperty` data
- Calling adapter create/update/remove methods
- Writing and updating `CmsSyncRun` rows
- Enqueueing retries on failure (BullMQ job via `JobLog`)

## 3.3 Injection

Use NestJS custom provider tokens per adapter (e.g. `CMS_ADAPTER_ESTATEWEB`) or a factory keyed by `CmsType`. The orchestrator must not import SDK clients directly in feature modules — follow `integrations/` encapsulation from the API rules.

## 3.4 Out of scope for adapters

- Scraping or normalizing source data (handled upstream)
- Managing `UserCms` CRUD (handled by config UI in the current phase)
- Modifying canonical `Property` or `UserProperty` content beyond reading for push

---

# 4. Sync Triggers

## 4.1 Crawl pipeline (automatic)

After the crawl pipeline creates/updates canonical `Property`, writes `PropertyHistory`, and creates/updates `UserProperty` for tracking users, **enqueue sync jobs** for each affected `UserProperty` × active `UserCms` pair:

```
… Create / Update / Remove (PropertyHistory)
↓
Create or update UserProperty for tracking users
↓
For each (UserProperty, active UserCms) where user owns the copy:
  enqueue CmsSyncRun (CREATE | UPDATE | REMOVE)
↓
Generate reports
```

### New listing

First time a tracking user gets a `UserProperty` for a listing → `CmsSyncRun` with `action: CREATE`.

### Updated listing

Canonical change detected and `UserProperty` updated (or user copy refreshed) → `CmsSyncRun` with `action: UPDATE`. Only changed fields need be sent if the CMS adapter supports partial update.

### Removed listing

`SourceProperty` marked `REMOVED`, `PropertyHistory` written, user's `UserProperty` reflects removal → `CmsSyncRun` with `action: REMOVE` per active `UserCms`.

## 4.2 Connect / backfill (manual)

When a user completes the Integrations connect flow (or an admin creates `UserCms` on their behalf):

1. Create `UserCms` with `is_active: true`
2. **Enqueue initial backfill** — one `CREATE` sync job per existing `UserProperty` for that user (respecting `is_modified` policy: optionally skip or push user-edited copies based on product decision)

## 4.3 Manual retry (admin)

From the CMS Sync subpage, admin can retry any failed `CmsSyncRun` — resets status to `PENDING` or `RETRYING` and re-enqueues.

## 4.4 Manual retry (user)

Optional: user-facing "Retry failed syncs" on Integrations page for their connection.

---

# 5. Retry and No-Data-Loss Guarantees

- Every sync attempt creates or updates a `CmsSyncRun` row before calling the external CMS
- On failure: set `status: FAILED` or `RETRYING`, store `error_message` and `response`, increment `attempt`
- Background worker retries with exponential backoff until `attempt >= max_attempts`
- Failed rows remain visible in admin CMS Sync subpage until `SUCCESS` or manual resolution
- **Nothing is silently dropped** — if the CMS was unreachable, the row persists and retries
- On success: `status: SUCCESS`, store `response`, set `finished_at`

When `max_attempts` is exhausted:

- Row stays `FAILED`
- Generate `Notification` (`type: CMS_SYNC_FAILURE`, link to `UserCms` / property)
- Admin can manually retry or investigate

---

# 6. Admin Dashboard

## 6.1 Dashboard home KPIs (additions)

- CMS Synchronization Status — pending / failed `CmsSyncRun` counts across all `UserCms` connections
- Active CMS Connections — `UserCms` with `is_active: true` / total configured (unchanged from config phase; now includes sync health context)

## 6.2 CMS Targets (`/admin/cms-targets`) — sync extensions

Extends the configuration-only subpage from the current phase:

- Connected accounts table adds **recent sync success/failure counts** per `UserCms`
- Disabling a target (`is_active: false`) **pauses sync** for all linked `UserCms` rows (no new jobs enqueued; in-flight jobs should complete or fail gracefully)

## 6.3 CMS Sync (`/admin/cms-sync`) — new subpage

Backed by: `CmsSyncRun`, `UserCms`, `UserProperty`

- List / filter by `status`, `action`, `user_cms`, user, property, date range
- Detail view: payload sent, response received, `error_message`, attempt count, linked `UserCms` and `UserProperty`
- **Retry sync** action on failed rows
- Bulk retry for selected failed rows (optional)

## 6.4 Notifications (`/admin/notifications`) — addition

- `CMS_SYNC_FAILURE` notification type — deep-links to the failed `CmsSyncRun` or `UserCms`

## 6.5 Users subpage — addition

- Per-user detail shows sync summary per `UserCms` connection (last success, pending/failed counts)

---

# 7. User Integrations Page (`/integrations`) — sync extensions

Extends the configuration-only Integrations page from the current phase.

### Connected accounts (additions)

- **Sync status summary** — recent `CmsSyncRun` counts (pending, failed, last success)
- Link to **per-connection sync history** (read-only list of `CmsSyncRun` for that `UserCms`)
- **Enable / Disable** — disabling pauses sync without deleting credentials (already in config phase; now affects job enqueueing)

### Connect flow (addition)

Step 5 after creating `UserCms`:

- Enqueue **initial backfill sync** for all existing `UserProperty` rows belonging to the user

### Disconnect (addition)

- Warn if pending `CmsSyncRun`s exist for the connection
- Policy: cancel pending jobs, or let them complete before delete (product decision — document in implementation)

---

# 8. Property Update and Removal Behaviour

## 8.1 Updates

When crawl detects field changes on a canonical `Property`:

1. Write `PropertyHistory`
2. Update tracking users' `UserProperty` (respect `is_modified` — do not overwrite user edits without explicit re-sync)
3. For each active `UserCms` owned by those users, enqueue `UPDATE` sync with changed fields only where the adapter supports it

## 8.2 Removals

When a listing is removed from source:

1. `SourceProperty.status` → `REMOVED`
2. `PropertyHistory` (`REMOVED`)
3. Update `UserProperty` to reflect removal
4. Enqueue `REMOVE` sync per active `UserCms`

## 8.3 Reappearance

When a removed listing reappears:

1. `PropertyHistory` (`REAPPEARED`)
2. Restore `UserProperty` status
3. Enqueue `CREATE` or `UPDATE` sync per active `UserCms` (adapter decides based on whether CMS still has the listing)

---

# 9. Background Jobs

Sync execution runs outside the HTTP request path:

- Queue: dedicated CMS sync queue (e.g. `cms-sync`) via BullMQ
- Each job processes one `CmsSyncRun` (or creates one then processes)
- Jobs linked to `JobLog` for monitoring on `/admin/jobs`
- Worker calls orchestrator → adapter → external CMS API
- Failed jobs respect retry policy and update `CmsSyncRun` atomically

Concurrency: limit per `UserCms` to avoid rate-limiting by CMS providers (configurable).

---

# 10. Security

- Credentials on `UserCms` must never be returned in API responses or logs — mask in UI
- Encrypt `api_key_secret`, `password` at rest (application-level or DB-level — implementation detail)
- Adapters receive decrypted credentials only in memory during sync execution
- OAuth flow (`auth_type: OAUTH`) stores tokens in `config` or dedicated fields — refresh before expiry

---

# 11. Logging

Log events specific to this phase:

- CMS sync job enqueued (user_cms_id, user_property_id, action)
- CMS sync attempt started / succeeded / failed
- CMS sync retry scheduled
- CMS sync max attempts exhausted
- CMS sync manual retry triggered (admin/user)
- Initial backfill started / completed

---

# 12. Future Expansion

- Additional `CmsType` values and adapters (WordPress, custom REST, etc.)
- Webhook callbacks from CMS on publish confirmation
- Two-way sync (CMS edits pulled back — out of initial sync scope)
- Per-field mapping UI instead of raw `config` JSON
- Sync scheduling (batch overnight pushes vs immediate)
- Rate-limit-aware adaptive concurrency per CMS provider

---

# 13. Success Criteria

When this specification is fully implemented:

**Administrators can:**

- View pending and failed sync operations across all users on `/admin/cms-sync`
- Retry failed syncs individually or in bulk
- See sync health KPIs on the dashboard home
- See per-connection sync stats on CMS Targets and Users subpages
- Receive `CMS_SYNC_FAILURE` notifications and act on them

**Users can:**

- See sync status (pending, failed, last success) for each connected CMS on `/integrations`
- Browse per-connection sync history
- Trigger backfill automatically on connect
- Rely on crawl-driven automatic push for new, updated, and removed listings

**System guarantees:**

- Every push attempt is recorded in `CmsSyncRun`
- Failed syncs are retried up to `max_attempts` and never silently dropped
- Sync only runs for active `UserCms` + active parent `CmsTarget`
- Each `CmsType` is isolated in its own integration module with no scraping or normalization logic

---

# 14. Related Documents

- `PROJECT-SPECIFICATIONS.MD` — main platform spec; current phase ends at `UserProperty` + `PropertyHistory`
- `api/prisma/schema.prisma` — `CmsTarget`, `UserCms`, `CmsSyncRun`, enums
- `scraping-generation-computer-use-architecture.md` — upstream crawl pipeline (sync step plugs in after `UserProperty` update)
