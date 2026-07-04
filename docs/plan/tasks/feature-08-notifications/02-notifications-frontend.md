# Task: Notifications frontend (data + UI)

## Feature group

`docs/plan/PROGRESS.md` → **Feature 08: Notifications**

## Objective

Give admins a notifications page and an unread-count indicator in the admin
shell.

## Requirements

1. Extend `app/src/config/api/routes.ts`:
   ```ts
   admin: {
     notifications: {
       prefix: "/admin/notifications",
       list: "/admin/notifications",
       markRead: (id: string) => `/admin/notifications/${id}/read`,
       markAllRead: "/admin/notifications/read-all",
     },
   },
   ```
2. `app/src/features/notifications/interfaces/notifications.interfaces.ts`
   — `Notification` (mirror entity), `NotificationType`/`NotificationSeverity`
   union types, `NotificationListQuery`
3. `app/src/features/notifications/services/notifications.services.ts` —
   list/markRead/markAllRead
4. `app/src/features/notifications/hooks/use-notifications.ts`:
   - `useNotifications(query)`
   - `useUnreadNotificationsCount()` — thin wrapper calling
     `useNotifications({ is_read: false, limit: 1 })` and reading
     `pagination.total`, with a short `refetchInterval` (e.g. 30s) so the
     admin shell badge stays reasonably fresh without a websocket
   - `useMarkNotificationRead()`, `useMarkAllNotificationsRead()` (toast +
     invalidate `['notifications']`)
5. Add to `app/src/routes/routes.ts` under `admin`:
   ```ts
   notifications: "/admin/notifications",
   ```
6. Add routes in `routes/index.tsx`, nav item "Notifications" in
   `admin-sidebar-content.tsx` with an unread-count badge using
   `useUnreadNotificationsCount()`.
7. `app/src/pages/admin/notifications/index.tsx` — list with type/severity
   badges, filters (type, severity, is_read), "Mark all read" button,
   per-row "Mark read" action, each row deep-links to the relevant source
   record (`source_agency_id` → `Routes.admin.agencies.detail`,
   `scraper_id` → `Routes.admin.scrapers.detail`, `crawl_run_id` →
   `Routes.admin.crawlRuns.detail` — whichever id is present takes priority
   in that order).

## Files to create or modify

### App (`app/`)

- `app/src/config/api/routes.ts` (extend `admin.notifications`)
- `app/src/routes/routes.ts` (add `admin.notifications`)
- `app/src/routes/index.tsx`
- `app/src/features/notifications/interfaces/notifications.interfaces.ts`
- `app/src/features/notifications/services/notifications.services.ts`
- `app/src/features/notifications/hooks/use-notifications.ts`
- `app/src/components/layout/admin-sidebar-content.tsx` (nav item + unread badge)
- `app/src/pages/admin/notifications/index.tsx` (new)

## Subtasks

- [ ] Extend `ApiRoutes`/`Routes`
- [ ] Build the `notifications` feature module including the unread-count hook
- [ ] Add the sidebar nav item with live unread badge
- [ ] Build the notifications list page with deep-links to source records

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc`

## Acceptance Criteria

- The admin sidebar shows a live (≤30s stale) unread notification count
- An admin can filter notifications, mark individual/all as read, and click
  through to the exact agency/scraper/crawl-run that triggered each one
- `tsc --noEmit` passes in `app/`
