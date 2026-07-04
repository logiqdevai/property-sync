# Task: Dashboard aggregation API + admin Users API

## Feature group

`docs/plan/PROGRESS.md` → **Feature 10: Dashboard Home & Users Admin**

## Objective

Build the single dashboard-home aggregation endpoint (real KPIs + activity
feed across every feature built so far) and the admin Users list/detail
endpoints — the final feature, since it reads across all prior features'
data.

## Context — read this before touching anything

`docs/PROJECT-SPECIFICATIONS.MD` §4.1 defines the exact KPI list — implement
every one listed, do not add or drop items:

- Total Scrapers / Active / Broken (`Scraper.status` counts)
- Total Agencies / Active / Disabled / Archived (`SourceAgency.status` counts)
- Running Scrapers (count of `CrawlRun` where `status: RUNNING`)
- Failed Scrapers (count of `CrawlRun` where `status: FAILED` and
  `created_at >= now() - 24h`)
- Last Crawl Time (max `CrawlRun.finished_at`)
- Properties Imported / Updated / Removed Today (count `PropertyHistory`
  rows with `event_type: CREATED`/`UPDATED`/`REMOVED` and `created_at >=`
  start of today)
- Failed Properties — not a distinct model field; interpret as count of
  `SourceProperty` extraction failures, which in this schema surfaces as
  `ScraperExecutionTrace` rows with `success: false` created today (note
  this interpretation in a code comment since the spec doesn't map it to an
  exact column)
- Total Properties (`Property` count)
- Queue Status — waiting/running/failed counts from `JobLog.status`
  (`WAITING`, `ACTIVE`, `FAILED`)
- Active `ScraperGenerationRun`s (count where `status` is `QUEUED` or `RUNNING`)
- Active CMS Connections / Total configured (`UserCms` count where
  `is_active: true` / total count) — **configuration count only, no sync
  metrics**
- Unread Notifications count (`Notification` where `is_read: false`)

Recent activity feed: latest crawls, failed crawls, new listings, removed
listings, broken scrapers, recent AI generation/self-heal runs — merge these
into one chronological feed (each item tagged with a `type` discriminator
and a deep-link target), capped to a reasonable count (e.g. last 20).

**Performance requirement**: build every count query as an independent
promise and run them all via `Promise.all()` (per the React/Next best
practices doc's "Promise.all() for Independent Operations" principle,
equally applicable here on the NestJS side) — do not `await` each count
sequentially.

## Requirements

1. **`api/src/modules/dashboard/`**:
   - `dashboard.controller.ts` — `GET /admin/dashboard`,
     `@Roles('ADMIN','SUPER_ADMIN','SUPPORT')`
   - `dashboard.service.ts` — `getDashboard(): Promise<DashboardResponse>`
     computing every KPI above via `Promise.all()` of independent
     `prisma.*.count()`/`aggregate()` calls, plus the merged activity feed
     (fetch each activity source's latest N rows in parallel, merge + sort
     by timestamp client-side in the service, take top 20)
   - `entities/dashboard.entity.ts` — typed response shape
2. **`api/src/modules/users/`** (admin-facing; distinct from the existing
   `auth`/`users.controller.ts` `GET /users/me` — check what already exists
   at `api/src/modules/users/` before adding, since Feature 01 already
   created a `users.controller.ts` for `me` — extend that module rather than
   creating a duplicate one):
   - `GET /admin/users` — `UserQuerySchema` (Zod: `page`, `limit`, `search?`,
     `role?`), `@Roles('ADMIN','SUPER_ADMIN','SUPPORT')`
   - `GET /admin/users/:id` — user + `tracked_agencies:
     UserTrackedAgency[]` + `saved_properties: UserProperty[]` (include
     `is_modified`) + `user_cms: UserCms[]` (masked, reuse
     `mask-credentials.util.ts` from Feature 09) — `@Roles('ADMIN','SUPER_ADMIN','SUPPORT')`

## Files to create or modify

### API (`api/`)

- `api/src/modules/dashboard/dashboard.module.ts`
- `api/src/modules/dashboard/dashboard.controller.ts`
- `api/src/modules/dashboard/dashboard.service.ts`
- `api/src/modules/dashboard/entities/dashboard.entity.ts`
- `api/src/modules/users/users.controller.ts` (extend with admin endpoints — check existing file first)
- `api/src/modules/users/users.service.ts` (extend)
- `api/src/modules/users/dto/user-query.schema.ts`
- `api/src/app.module.ts` (import `DashboardModule` if not already present)

## Subtasks

- [ ] Check the existing `api/src/modules/users/` module from Feature 01 before extending
- [ ] Build the dashboard KPI aggregation with `Promise.all()`
- [ ] Build the merged, sorted, capped activity feed
- [ ] Extend `users` module with admin list/detail (masked CMS credentials)

## Technical Notes

- Follow `.cursor/rules/api-code-structure-and-best-practices.mdc`
- All independent counts run in parallel via `Promise.all()`
- `{ data, pagination }` for the users list endpoint

## Acceptance Criteria

- `GET /admin/dashboard` returns every KPI listed in spec §4.1 with values
  matching what's actually in the database, and an activity feed spanning
  crawls/listings/scrapers/generation runs sorted by recency
- `GET /admin/users` and `.../:id` return real data including divergence
  (`is_modified`) flags and masked CMS credentials
- `tsc --noEmit` passes in `api/`
