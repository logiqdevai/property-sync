# Task: Dashboard Home page + Users admin page

## Feature group

`docs/plan/PROGRESS.md` → **Feature 10: Dashboard Home & Users Admin**

## Objective

Replace the current `/admin` placeholder (from Feature 01) with a real KPI
dashboard, and build the Users admin subpage — the final vertical slice
that completes the current-phase admin experience end to end.

## Requirements

1. Extend `app/src/config/api/routes.ts`:
   ```ts
   admin: {
     dashboard: { root: "/admin/dashboard" },
     users: {
       prefix: "/admin/users",
       list: "/admin/users",
       detail: (id: string) => `/admin/users/${id}`,
     },
   },
   ```
2. `app/src/features/dashboard/interfaces/dashboard.interfaces.ts` —
   `DashboardKpis` (mirror every field from the API entity), `ActivityFeedItem`
   (`type` discriminator + deep-link fields + timestamp + summary text)
3. `app/src/features/dashboard/services/dashboard.services.ts` +
   `hooks/use-dashboard.ts` — `useDashboard()` with a short `refetchInterval`
   (e.g. 60s) so KPIs feel live without manual refresh
4. Extend `app/src/features/users/` (interfaces/services/hooks already
   exist per the codebase — check before adding new files) with admin
   `useAdminUsers(query)` / `useAdminUser(id)` hooks and matching interfaces
   (`AdminUserDetail` with `tracked_agencies`, `saved_properties` incl.
   `is_modified`, `user_integrations` masked)
5. Add to `app/src/routes/routes.ts`:
   ```ts
   admin: {
     root: "/admin",
     users: {
       list: "/admin/users",
       detail: (id: string) => `/admin/users/${id}`,
     },
   },
   ```
   (Feature 01 already added an `admin.root` placeholder key — replace/reuse
   it, do not create a second one)
6. Replace whatever placeholder currently renders at `/admin` (Feature 01's
   stub route) with `app/src/pages/admin/dashboard/index.tsx`: KPI cards
   grid (grouped logically — Scrapers, Agencies, Properties, Queue, AI
   Generation, Integrations, Notifications) + the activity feed list, each row
   deep-linking via the discriminator (`crawl` →
   `Routes.admin.crawlRuns.detail`, `generation` →
   `Routes.admin.generationRuns.detail`, `scraper` →
   `Routes.admin.scrapers.detail`, etc.)
7. `app/src/pages/admin/users/index.tsx` — list/search users, role badge.
8. `app/src/pages/admin/users/detail.tsx` — user info + tracked agencies
   (with per-type toggle states shown read-only) + saved properties table
   (with an "edited" badge where `is_modified`) + linked integration connections
   (masked, with enable/disable shortcuts reusing the admin integration account
   mutation hooks from Feature 09).
9. Add nav item "Users" to `admin-sidebar-content.tsx` (Dashboard Home is
   presumably already the root/first item from Feature 02 — confirm it
   links to the real page now, not a placeholder).

## Files to create or modify

### App (`app/`)

- `app/src/config/api/routes.ts`
- `app/src/routes/routes.ts`
- `app/src/routes/index.tsx`
- `app/src/components/layout/admin-sidebar-content.tsx`
- `app/src/features/dashboard/interfaces/dashboard.interfaces.ts`
- `app/src/features/dashboard/services/dashboard.services.ts`
- `app/src/features/dashboard/hooks/use-dashboard.ts`
- `app/src/features/users/` (extend existing interfaces/services/hooks with admin variants)
- `app/src/pages/admin/dashboard/index.tsx` (new, replaces Feature 01 placeholder)
- `app/src/pages/admin/users/index.tsx` (new)
- `app/src/pages/admin/users/detail.tsx` (new)

## Subtasks

- [ ] Extend `ApiRoutes`/`Routes` for dashboard and users
- [ ] Build the `dashboard` feature module
- [ ] Extend the existing `users` feature module with admin hooks (don't duplicate the module)
- [ ] Build the Dashboard Home page with grouped KPI cards + deep-linking activity feed
- [ ] Build Users list + detail pages
- [ ] Manual smoke test: exercise Features 02–09 (create an agency, run a scraper, generate one with AI, track it as a user, connect an integration target) and confirm every KPI and activity feed entry reflects that real data

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc`
- This is the last feature — after this, do a final pass confirming every
  admin sidebar nav item points at a real page, not a stub

## Acceptance Criteria

- `/admin` shows live KPI cards and an activity feed matching real platform
  data, replacing the Feature 01 placeholder entirely
- `/admin/users` lists real users; a user's detail page shows their real
  tracked agencies, saved properties (with divergence flags), and integration
  connections
- Every admin sidebar link resolves to a real, working page
