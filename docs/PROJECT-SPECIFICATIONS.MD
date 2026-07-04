# Real Estate Property Aggregation Platform

## Functional Project Specification (v2 — updated for computer-use generation + admin dashboard)

# 1. Project Overview

The platform is a centralized property aggregation system that automatically collects real estate listings from multiple public real estate agency websites and synchronizes them with a customer's CMS.

The system is designed to support hundreds of independent property sources, with the ability to continuously add new websites over time without changing the core platform. Scrapers themselves can now be **generated and repaired by an AI computer-use agent**, rather than hand-written.

The application focuses on:

- Property discovery
- Automatic updates
- Property removal detection
- Duplicate property entry detection
- Centralized management
- AI-assisted scraper generation and self-healing
- Scraper monitoring
- Manual and scheduled execution
- High visibility into scraper health
- CMS synchronization with guaranteed retry/no-data-loss
- Admin notifications

---



# 2. Main Objectives

The system shall:

- Collect properties from many agency websites.
- Normalize property information into a common structure.
- Detect new listings.
- Detect listing updates.
- Detect removed listings.
- Detect duplicate entries.
- Keep historical crawl information.
- Keep historical property-change information (price, images, status).
- Generate and self-heal scrapers using an AI computer-use agent, with a full replayable audit trail.
- Synchronize data with the customer's CMS, with retries and a durable sync log.
- Provide complete monitoring of every scraper, crawl, job, and generation run.
- Notify admins of failures and anomalies.
- Allow new scrapers to be added independently.

---



# 3. User Authentication

Users can:

- Register
- Login

Roles: `USER`, `ADMIN`, `SUPER_ADMIN`, `SUPPORT`. Admin dashboard sections below are gated to `ADMIN` / `SUPER_ADMIN` (SUPPORT gets read-only access to logs and traces for troubleshooting).

---



# 4. Admin Dashboard



## 4.1 Dashboard Home

Top-level KPIs:

- Total Scrapers / Active / Broken
- Total Agencies / Active / Disabled / Archived
- Running Scrapers (live `CrawlRun`s)
- Failed Scrapers (crawl failures in last 24h)
- Last Crawl Time
- Properties Imported / Updated / Removed Today
- Failed Properties
- Total Properties
- Queue Status (waiting / running / failed `JobLog` counts)
- Active `ScraperGenerationRun`s (computer-use sessions currently running)
- CMS Synchronization Status (pending / failed `CmsSyncRun`s)
- Unread Notifications count

Recent activity feed, each row deep-linking into the relevant subpage:

- Latest crawls
- Failed crawls
- New listings
- Removed listings
- Broken scrapers
- Recent AI generation/self-heal runs



## 4.2 Subpages

Each subpage below maps directly to one or more Prisma models, so the dashboard has no data it can't account for.

### Agencies (`/admin/agencies`)

Backed by: `SourceAgency`

- List / search / filter by `status` (Active, Disabled, Archived), , `country`, `city`
- Create / Edit agency: name, base_url, country, city, crawl_interval, notes
- Enable / Disable / Archive (updates `status`)
- Detail view: linked Scraper(s), recent `CrawlRun`s, recent `Notification`s, `last_success_at` / `last_failure_at`



### Scrapers (`/admin/scrapers`)

Backed by: `Scraper`, `ScraperVersion`

- List / search / filter by `status` (Testing, Active, Inactive, Deprecated, Broken), `health`
- Detail view:
  - Current health card: `health`, `success_rate`, `avg_runtime_ms`, `consecutive_failures`, `last_success_at`, `last_failure_at`
  - **Version history** (`ScraperVersion` list) — diff any two versions' `config`, see `created_by` (AI/USER) and `notes`, roll back by re-activating an older version (`Scraper.active_version_id`)
  - "Run Now" button → creates a `CrawlRun` immediately regardless of schedule (spec §7)
  - "Regenerate / Fix with AI" button → creates a `ScraperGenerationRun` with `trigger: MANUAL`
  - Toggle `self_healing_enabled`
  - Edit `validation_rules`



### Crawl Runs (`/admin/crawl-runs`)

Backed by: `CrawlRun`, `ScraperExecutionTrace`, `JobLog`

- List / filter by `status`, agency, scraper, date range
- Detail view: totals (found/created/updated/removed/failed), duration, `error_message`, linked `ScraperExecutionTrace` (step-by-step Playwright log), linked `JobLog` entries
- "Re-run" action → re-queues the same scraper/agency as a new `CrawlRun`



### Computer-Use Generation Runs (`/admin/generation-runs`)

Backed by: `ScraperGenerationRun`, `ComputerUseStep`, `ScraperVersion`

- List / filter by `status` (Queued, Running, Awaiting Review, Success, Failed, Cancelled), `trigger` (Manual, Self-Heal, Scheduled), agency, scraper
- **Session replay view**: every `ComputerUseStep` in order — action type, payload, before/after screenshots (via `Document`), and the model's `model_reasoning` if present. This is the audit trail for "what did the AI actually do."
- Review screen for runs in `AWAITING_REVIEW`: shows `staged_config`, diffs it against the scraper's current active version, and lets an admin **Approve** (promotes to a new `ScraperVersion` + activates it) or **Reject** (marks `FAILED` with a reason)
- Manual trigger: "Generate scraper for this agency" (creates a run with no `scraper_id`, i.e. first-time generation)



### Job Queue (`/admin/jobs`)

Backed by: `JobLog`

- List / filter by `status` (Waiting, Active, Completed, Failed, Delayed, Paused, Stalled), queue name
- Detail view: payload, result, error_message, stack_trace, attempt/max_attempts, duration, linked `CrawlRun`
- "Retry" action for failed jobs



### Properties (`/admin/properties`)

Backed by: `Property`, `PropertySourceLink`, `PropertyHistory`, `SourceProperty`

- List / search / filter by status, listing_type, property_type, city, price range, duplicate_group_id
- Detail view:
  - Current normalized data
  - Linked `SourceProperty` rows (which agencies this listing came from, via `PropertySourceLink`, with `confidence_score` / `is_primary_source`)
  - **History timeline** (`PropertyHistory`): created, price changes, images added/removed, status changes, removed, reappeared — each with old/new value and the `CrawlRun` that detected it
  - Duplicate group members (other properties sharing `duplicate_group_id`), with an admin action to merge/split groups



### CMS Sync (`/admin/cms-sync`)

Backed by: `CmsTarget`, `CmsSyncRun`

- CmsTarget CRUD: name, cms_type, auth_type, base_url, api_key_secret, config, is_active
- Sync log: list/filter `CmsSyncRun` by `status` (Pending, Success, Failed, Retrying), `action` (Create/Update/Remove), target, property
- Detail view: payload sent, response received, error_message, attempt count
- "Retry sync" action on failed rows — this is what guarantees spec §15's "failures should never lose data": a failed sync stays as a row here until it succeeds or is manually resolved, it is never silently dropped



### Notifications (`/admin/notifications`)

Backed by: `Notification`

- List / filter by `type` (Broken Scraper, CMS Sync Failure, Property Removal Spike, Large Crawl Failure, Queue Failure, Website Unavailable), `severity`, read/unread
- Mark read / mark all read
- Each notification deep-links to the relevant Agency / Scraper / CrawlRun



### Users (`/admin/users`)

Backed by: `User`, `UserTrackedAgency`, `UserProperty`

- List/search users, view role
- Per-user detail: tracked agencies (with per-notification-type toggles), saved properties, and whether any saved copies have diverged (`is_modified`) from canonical data

---



# 5. Source Agencies

Each source agency contains:

- Name
- Website URL
- Country
- City
- Status (`Active` / `Disabled` / `Archived`)
- Crawl Interval (Cron)
- Notes

Admin Users can:

- View agencies
- Search agencies
- Enable
- Disable
- Archive
- View crawl history
- View scraper history
- View AI generation history (see §4.2 Computer-Use Generation Runs)

Users can:

- View their agencies
- Enable / Disable tracking
- View added listings
- View removed listings
- Configure per-agency notification preferences (new / removed / updated listings) — see §21

---



# 6. Scraper Management

Each agency has its own scraper.

Each scraper has:

- Version (current pointer to a `ScraperVersion`; full version history retained)
- Status: Testing, Active, Inactive, Deprecated, **Broken**
- Last Success / Last Failure timestamps
- Average Runtime
- Success Rate
- Current Health (Excellent / Good / Warning / Critical / Broken)
- Configuration (always read from the active version — never edited in place; a config change is a new version)
- Validation Rules (expected selectors/fields, used to detect breakage)
- Self-healing toggle (whether a failure is allowed to auto-trigger an AI fix run)

Every config change — whether produced by the AI or a human — is a new immutable `ScraperVersion`, so any scraper can be rolled back to a prior version at any time.

---



# 7. Manual Scraping

Every scraper must support manual execution.

From the interface the user can:

Run Scraper Now

This immediately creates a crawl job (`CrawlRun`), regardless of the configured schedule.

---



# 8. Scheduled Scraping

Every scraper has its own cron schedule (via its agency's `crawl_interval`).

Examples:

- Every hour
- Every 6 hours
- Every day
- Every week

Each scraper runs independently. The scheduler automatically creates queue jobs (`JobLog` + `CrawlRun`), and only for agencies with `status: ACTIVE`.

---



# 9. Crawl Process

Each crawl performs:

Discover properties
↓
Collect property URLs
↓
Visit property pages
↓
Extract data
↓
Normalize
↓
Compare with existing data
↓
Create / Update / Remove (each change logged to `PropertyHistory`)
↓
Synchronize CMS (creates `CmsSyncRun` rows)
↓
Generate reports

If a crawl fails and the scraper's `self_healing_enabled` is true, a `ScraperGenerationRun` with `trigger: SELF_HEAL` is created automatically (see §11).

---



# 10. Property Discovery

The crawler should discover:

New properties, existing properties, updated properties, removed properties, unavailable pages, redirected pages, duplicate listings.

---



# 11. Property Removal Detection

The platform must detect when a property has been removed from a source website.

Removal may occur because: Listing deleted, sold, rented, URL removed, 404 page, listing hidden.

The system compares every crawl with previous crawls. If a previously discovered listing no longer exists, its `SourceProperty.status` becomes `REMOVED`, a `PropertyHistory` row (`event_type: REMOVED`) is written, and the corresponding `Property` is marked for CMS removal (a `CmsSyncRun` with `action: REMOVE` is created).

The user can see:

- Removal date
- Source website
- Previous data
- Removal reason if detectable

If a previously removed listing reappears, a `PropertyHistory` row (`event_type: REAPPEARED`) is written and the property's status is restored.

---



# 12. Property Updates

When a property changes: Price, Description, Images, Bedrooms, Bathrooms, Surface, Address, Features.

The system detects differences. Only changed fields are synchronized to the CMS. Every detected difference writes a `PropertyHistory` row with the specific `field`, `old_value`, and `new_value` — this is what powers the property history timeline (§4.2).

---



# 13. Duplicate Detection

Duplicate properties should be detected using: External ID, Source URL, Address, Coordinates, Images, Similar title, Similar description, Price, Area.

Duplicates are grouped via `Property.duplicate_group_id`. Admins can merge or split groups from the Properties subpage.

---



# 14. Property History

Every property keeps history via the append-only `PropertyHistory` model. History includes:

- Created
- Updated
- Price Changes
- Images Added
- Images Removed
- Status Changes
- Removal
- Reappearance

Each entry records `field`, `old_value`, `new_value`, and (where applicable) the `CrawlRun` that detected it, so every change is traceable to a specific crawl.

---



# 15. CMS Synchronization

The system synchronizes: New Properties, Updated Properties, Removed Properties.

Every sync attempt is recorded as a `CmsSyncRun` row (`action`: Create/Update/Remove; `status`: Pending/Success/Failed/Retrying) with the payload sent and response received. Synchronization must support retries — a failed sync is retried up to `max_attempts` and remains visible in the CMS Sync subpage (§4.2) until resolved. Failures never lose data because the row persists until success.

---



# 16. Crawl History

Every crawl (`CrawlRun`) stores: Start Time, Finish Time, Duration, Properties Found/Created/Updated/Removed, Errors, Warnings, and linked `JobLog` / `ScraperExecutionTrace` for deeper worker/CPU/memory-level detail.

---



# 17. Job Queue Monitoring

`JobLog` rows (backing BullMQ jobs) should be monitored and displayed with: Waiting, Running, Completed, Failed, Retries, Attempts, Duration, Worker, Queue, Payload, Result, Stack Trace, Error Message.

---



# 18. Scraper Health Monitoring

Every scraper continuously calculates its health via cached fields on `Scraper`:

- `success_rate`
- `avg_runtime_ms`
- `last_success_at` / `last_failure_at`
- `consecutive_failures`
- `health` (recomputed by a background job from recent `CrawlRun` outcomes)

Health score is displayed as: Excellent, Good, Warning, Critical, Broken.

---



# 19. Broken Scraper Detection

The system automatically identifies broken scrapers from signals such as: no properties found, selectors no longer work, website layout changed, website unavailable, repeated failures, authentication failure, timeouts, blocked by website, HTTP errors.

When a scraper is considered broken:

- `Scraper.status` is set to `BROKEN`
- A `Notification` (`type: BROKEN_SCRAPER`) is generated
- It surfaces on the dashboard and Notifications subpage
- If `self_healing_enabled` is true, a `ScraperGenerationRun` (`trigger: SELF_HEAL`) is created automatically
- Scheduled execution is suspended (optional, configurable); manual execution and manual "Regenerate with AI" remain available for testing

---



# 20. Notifications

Persisted via the `Notification` model (`type`, `severity`, `title`, `message`, links to agency/scraper/crawl run, `is_read`). Notifications exist for:

- Broken scraper
- CMS synchronization failure
- Property removal spike
- Large crawl failure
- Queue failures
- Website unavailable

Managed from the Notifications subpage (§4.2): filter, mark read, deep-link to the source record.

---



# 21. User Tracked Agencies

Backed by `UserTrackedAgency`. A user can track any `SourceAgency` and independently control which kinds of change generate a notification for them:

- `track_new_listings` — notify when a new `SourceProperty`/`Property` appears from this agency
- `track_removed_listings` — notify on removal
- `track_updated_listings` — notify on price/detail changes

`enabled` toggles tracking on/off without deleting the preference record. This closes the previous gap where tracking existed but had no per-change-type granularity.

---



# 22. User Properties

Backed by `UserProperty` — a full, independently editable copy of a `Property`, created automatically the first time a tracked agency surfaces a matching listing.

- Users can edit their own copy (notes, corrections, personal categorization) without affecting the canonical `Property` or other users' copies.
- `is_modified` flags whether the copy has diverged from the canonical property since it was last synced.
- `last_synced_at` records when it was last refreshed from canonical data.
- Users can manually **re-sync** a copy (overwriting their edits with current canonical data) or keep their modified version — the UI should warn before an overwrite if `is_modified` is true.
- This is distinct from `SourceProperty` (raw per-agency scrape data) and `Property` (canonical normalized record) — `UserProperty` is the personal, user-owned layer on top of both.

---



# 23. Logs

Every action should be logged. Examples: Manual crawl, Scheduled crawl, CMS synchronization, Property removed, Property updated, Scraper failure, Job failure, Retry, AI generation run started/completed/failed, Scraper version promoted/rolled back.

---



# 24. Future Expansion

The architecture should support:

- Unlimited agencies
- Unlimited scrapers
- Multiple CMS integrations (`CmsType` enum is extensible)
- AI-assisted scraper generation (already modeled)
- Automatic selector validation (via `validation_rules`)
- Automatic layout change detection
- Webhook integrations
- REST API
- Multiple workers
- Distributed crawling

---



# 25. Success Criteria

The platform should allow an administrator to:

- Add a new agency and configure its crawl/proxy/robots settings.
- Attach a dedicated scraper, generated by the AI computer-use agent or created manually.
- Execute it manually.
- Schedule automatic crawls.
- Detect new, updated, and removed listings, with full history.
- Automatically synchronize changes to the CMS, with guaranteed retry and a durable audit log.
- Monitor every crawl, every BullMQ job, and every AI generation session (with full step replay).
- Detect broken scrapers and have them self-heal automatically, or review/approve AI-proposed fixes manually.
- Review crawl history and property history.
- Review and act on notifications.
- Scale to hundreds of agency websites without modifying the core application.

