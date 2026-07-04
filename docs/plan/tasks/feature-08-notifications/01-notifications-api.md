# Task: Notifications API — real triggers + read management

## Feature group

`docs/plan/PROGRESS.md` → **Feature 08: Notifications**

## Objective

Build the `notifications` module and replace every stub `Notification`
creation left inline in Features 05–07 with calls to a real, reusable
`NotificationsService`.

## Context — read this before touching anything

`docs/plan/directions/01-product-spec.md` §20 defines the five (actually
six, per the schema) notification types this system must generate. The
`NotificationType` enum (`api/prisma/schema.prisma`, reuse — do not
redeclare): `BROKEN_SCRAPER`, `CMS_SYNC_FAILURE`, `PROPERTY_REMOVAL_SPIKE`,
`LARGE_CRAWL_FAILURE`, `QUEUE_FAILURE`, `WEBSITE_UNAVAILABLE`. Note
`CMS_SYNC_FAILURE` cannot be triggered in this phase (`CmsSyncRun` is out of
scope per Feature 09) — leave it defined but unused, do not build a fake
trigger for it.

Stub locations to replace (search for these before writing new code, do not
duplicate the notification-creation logic):

- Feature 05 task 02's `api/src/background/crawl.processor.ts` — inline
  `prisma.notification.create()` for `BROKEN_SCRAPER` on self-heal trigger
- Feature 07 task 01's `syncForProperty` — `// TODO(Feature 08)` comment left
  at the removal-detection call site

## Requirements

1. **`api/src/modules/notifications/`**:
   - `notifications.module.ts` — export `NotificationsService`
   - `notifications.service.ts`:
     - `create(input: { type: NotificationType; severity: NotificationSeverity;
       title: string; message: string; source_agency_id?: string; scraper_id?:
       string; crawl_run_id?: string }): Promise<Notification>` — wrapped in
       `setImmediate` + internal `try/catch` per the architecture rule for
       fire-and-forget side effects (a notification failing to write must
       never break the calling crawl/generation flow)
     - `findAll(query)`, `markRead(id)`, `markAllRead(): Promise<{ updated: number }>`
   - `notifications.controller.ts`:
     - `GET /admin/notifications` — `NotificationQuerySchema` (Zod: `page`,
       `limit`, `type?`, `severity?`, `is_read?`)
     - `PATCH /admin/notifications/:id/read`
     - `PATCH /admin/notifications/read-all`
     - `@Roles('ADMIN','SUPER_ADMIN','SUPPORT')` — `SUPPORT` allowed to mark
       read too (notifications aren't a mutation of core data)
2. **Replace the Feature 05 stub**: in `api/src/background/crawl.processor.ts`, replace the
   inline `prisma.notification.create()` with
   `notificationsService.create({ type: 'BROKEN_SCRAPER', severity: 'WARNING',
   title: ..., message: ..., source_agency_id, scraper_id, crawl_run_id })`.
3. **`PROPERTY_REMOVAL_SPIKE`**: in `api/src/background/crawl.processor.ts` (or the
   normalization service, whichever computed `total_removed` for this run),
   if `total_removed` exceeds a sane threshold relative to `total_found`
   (e.g. more than 30% of previously-tracked properties removed in one
   crawl) or removed count exceeds a raw absolute threshold (e.g. `> 10`),
   call `notificationsService.create({ type: 'PROPERTY_REMOVAL_SPIKE',
   severity: 'WARNING', ... })`. Keep thresholds as named constants, not
   magic numbers inline.
4. **`LARGE_CRAWL_FAILURE`**: when a `CrawlRun` ends `FAILED` (not just
   `BROKEN` scraper, but the run itself failing e.g. site totally
   unreachable), call `notificationsService.create({ type:
   'LARGE_CRAWL_FAILURE', severity: 'CRITICAL', ... })`.
5. **`WEBSITE_UNAVAILABLE`**: when `CrawlerService.runCrawl` (Feature 05)
   returns a network-level error (not a selector/extraction failure —
   distinguish these two failure modes in the returned `error_summary` or a
   typed error if practical) call `notificationsService.create({ type:
   'WEBSITE_UNAVAILABLE', severity: 'CRITICAL', ... })`.
6. **`QUEUE_FAILURE`**: in both `api/src/background/generation.processor.ts`
   (Feature 04) and `api/src/background/crawl.processor.ts` (Feature 05),
   wrap the processor body in a top-level
   `try/catch` (if not already present) that, on any unhandled exception,
   calls `notificationsService.create({ type: 'QUEUE_FAILURE', severity:
   'CRITICAL', ... })` before rethrowing (so BullMQ's own retry/failure
   handling still applies).
7. Resolve the Feature 07 `// TODO(Feature 08)` comment left at the
   removal-detection call site in `syncForProperty`: there is **no**
   dedicated per-property removal notification type in the `NotificationType`
   enum, so do not invent one. Simply delete the stale TODO comment —
   `PROPERTY_REMOVAL_SPIKE` (item 3 above) already covers this at the
   aggregate crawl level, which is the intended granularity per the schema.

## Files to create or modify

### API (`api/`)

- `api/src/modules/notifications/notifications.module.ts`
- `api/src/modules/notifications/notifications.controller.ts`
- `api/src/modules/notifications/notifications.service.ts`
- `api/src/modules/notifications/dto/notification-query.schema.ts`
- `api/src/modules/notifications/entities/notification.entity.ts`
- `api/src/modules/crawl-runs/crawl-runs.module.ts` (import `NotificationsModule`)
- `api/src/background/crawl.processor.ts` (replace stub, add spike/failure/unavailable triggers, wrap in try/catch)
- `api/src/modules/scraper-generation/scraper-generation.module.ts` (import `NotificationsModule` if not already available transitively)
- `api/src/background/generation.processor.ts` (wrap in try/catch → `QUEUE_FAILURE`)
- `api/src/modules/properties/services/property-normalization.service.ts` (remove stale TODO comment)
- `api/src/app.module.ts` (import `NotificationsModule`)

## Subtasks

- [ ] Build the `notifications` module (service + controller)
- [ ] Replace the Feature 05 `BROKEN_SCRAPER` stub with the real service call
- [ ] Add `PROPERTY_REMOVAL_SPIKE` detection with named threshold constants
- [ ] Add `LARGE_CRAWL_FAILURE` and `WEBSITE_UNAVAILABLE` triggers
- [ ] Add `QUEUE_FAILURE` try/catch wrapping in both processors
- [ ] Clean up the Feature 07 stale TODO comment

## Technical Notes

- Follow `.cursor/rules/api-code-structure-and-best-practices.mdc`
- `setImmediate` + internal `try/catch` for all `NotificationsService.create`
  calls, per the architecture's fire-and-forget side-effect pattern
- `{ data, pagination }` for the list endpoint

## Acceptance Criteria

- Forcing a scraper to break (bad selector) produces a real `BROKEN_SCRAPER`
  notification retrievable via `GET /admin/notifications`
- Forcing a large number of removed listings in one crawl produces a
  `PROPERTY_REMOVAL_SPIKE` notification
- Pointing a scraper at an unreachable host produces `WEBSITE_UNAVAILABLE`
  (not `BROKEN_SCRAPER`)
- `PATCH /admin/notifications/:id/read` and `.../read-all` work correctly
- `tsc --noEmit` passes in `api/`
