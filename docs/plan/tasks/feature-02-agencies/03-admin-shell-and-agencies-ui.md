# Task: Admin shell layout + Agencies pages

## Feature group

`docs/plan/PROGRESS.md` → **Feature 02: Admin Shell & Agencies**

## Objective

Build the reusable admin dashboard shell (sidebar/navbar, distinct from the
existing user-facing `DashboardLayout`) and the first real admin pages:
Agencies list + detail/edit, replacing the Feature 01 placeholder route.

## Context — read this before touching anything

The user-facing dashboard shell already exists and is the pattern to mirror
for the admin shell:

- `app/src/pages/dashboard/layout.tsx` — layout composition (sidebar + navbar + `<Outlet />` + mobile drawer)
- `app/src/components/layout/sidebar.tsx` — collapsible desktop sidebar shell
- `app/src/components/layout/sidebar-content.tsx` — nav item list (this is
  the file that differs per shell — admin needs its own nav items)
- `app/src/components/layout/dashboard-navbar.tsx` — top navbar
- `app/src/components/layout/user-menu-popover.tsx` — reusable, no admin variant needed

Duplicate this structure for admin rather than parameterizing the existing
components — the two shells will diverge quickly (different nav items,
different branding treatment for "admin mode"). Reuse `UserMenuPopover` as-is
since it's identical in both contexts.

`app/src/routes/index.tsx` currently has a Feature-01 placeholder route at
`Routes.admin.root` rendering `pages/admin/index.tsx` directly (no layout).
Replace that with a nested route group under `AdminLayout`, matching the
`/dashboard/*` pattern already used for the user dashboard.

## Requirements

1. `app/src/components/layout/admin-sidebar-content.tsx` — nav items:
   `Dashboard` (`Routes.admin.root`, icon `LayoutDashboard`), `Agencies`
   (`Routes.admin.agencies.list`, icon `Building2`). Leave commented-out
   placeholders for the nav items later features will add (Scrapers,
   Generation Runs, Crawl Runs, Job Queue, Properties, CMS Targets,
   Notifications, Users) so later tasks have an obvious insertion point.
2. `app/src/components/layout/admin-dashboard-navbar.tsx` — same shape as
   `dashboard-navbar.tsx`; content can be identical for now.
3. `app/src/components/layout/admin-layout.tsx` — same shape as
   `pages/dashboard/layout.tsx` but importing the admin sidebar/navbar
   variants above.
4. Add to `app/src/routes/routes.ts`:
   ```ts
   admin: {
     root: "/admin",
     agencies: {
       list: "/admin/agencies",
       detail: (id: string) => `/admin/agencies/${id}`,
     },
   },
   ```
5. In `app/src/routes/index.tsx`, replace the Feature-01 placeholder route
   with a nested group (mirroring the `/dashboard/*` block):
   ```tsx
   <Route
     path="/admin/*"
     element={
       <ProtectedRoute loggedIn={true} requiredRoles={[RoleTypes.ADMIN, RoleTypes.SUPER_ADMIN, RoleTypes.SUPPORT]}>
         <AdminLayout />
       </ProtectedRoute>
     }
   >
     <Route index element={<AdminDashboardHome />} />
     <Route path="agencies" element={<AgenciesListPage />} />
     <Route path="agencies/:id" element={<AgencyDetailPage />} />
   </Route>
   ```
   `AdminDashboardHome` can stay as the simple placeholder from Feature 01
   for now (real KPIs are Feature 10) — just move it under the new layout.
6. `app/src/pages/admin/agencies/index.tsx` — list page:
   - Table (HeroUI table components) of agencies: name, base_url, status
     badge, country/city, last_success_at, last_failure_at
   - Search input (debounced) + status filter + pagination controls, all
     driving `useAgencies(query)` state (`useState` for the query object)
   - "New agency" button opening a create form (modal or dedicated route —
     prefer a HeroUI modal to avoid an extra route/page for a single form)
     using `useCreateAgency()` + the Zod schema + React Hook Form +
     `zodResolver`, per `.cursor/rules/app-code-structure-and-best-practices.mdc`
   - Row click navigates to `Routes.admin.agencies.detail(id)`
   - Row-level quick actions: enable/disable/archive using `useUpdateAgencyStatus()`
7. `app/src/pages/admin/agencies/[id].tsx` (or `detail.tsx` — follow existing
   project file-naming convention for dynamic pages if one exists, otherwise
   use `detail.tsx` and read `:id` via `useParams`):
   - Header with name, status badge, edit button (inline form or modal, same
     form component as create, pre-filled, using `useUpdateAgency()`)
   - Metadata panel: base_url, country/city, crawl_interval, notes,
     last_success_at/last_failure_at/last_error_message
   - Empty-state placeholder sections titled "Scrapers" and "Recent Crawl
     Runs" (each just a HeroUI empty-state component saying "Coming in a
     later phase") — Features 03 and 05 will replace these with real data,
     do not build fake data for them now
   - Delete button using `useDeleteAgency()` with a confirm dialog, disabled
     with a tooltip explaining why if the agency has dependent scrapers/crawl
     runs (rely on the `_count` from the detail response; if `_count.scrapers
     + _count.crawl_runs > 0`, disable and show "Archive instead" as the
     available action)

## Files to create or modify

### App (`app/`)

- `app/src/components/layout/admin-sidebar-content.tsx`
- `app/src/components/layout/admin-dashboard-navbar.tsx`
- `app/src/components/layout/admin-layout.tsx`
- `app/src/routes/routes.ts` (extend `admin` key)
- `app/src/routes/index.tsx` (replace placeholder route with nested group)
- `app/src/pages/admin/index.tsx` (keep as dashboard home placeholder, now rendered inside `AdminLayout`)
- `app/src/pages/admin/agencies/index.tsx` (new)
- `app/src/pages/admin/agencies/detail.tsx` (new)

## Subtasks

- [ ] Build `AdminLayout` + admin sidebar/navbar variants
- [ ] Wire nested `/admin/*` routes with role guard
- [ ] Build Agencies list page (table, search, filter, pagination, create modal, quick status actions)
- [ ] Build Agency detail page (metadata, edit, delete/archive, empty-state placeholders for Scrapers/Crawl Runs)
- [ ] Manual test: as seeded `ADMIN`, create an agency, see it in the list, open detail, edit it, disable it, confirm status badge updates, attempt delete (blocked if it somehow has dependents, otherwise succeeds)

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc` strictly:
  pages only consume `features/agencies/hooks/`, never call `axiosInstance`
  or `ApiRoutes` directly from a page component
- Use HeroUI React v3 components for table/modal/pagination/badge; consult
  the HeroUI docs (Context7) for exact API if unsure rather than
  hand-rolling table/pagination primitives
- All new shared, non-page-specific UI atoms (e.g. a `StatusBadge` if the
  same badge is needed in both list and detail) belong in
  `app/src/components/ui/`, not duplicated per page — **audit existing files
  there first** (`ActionButtonWithPending`, `PasswordInput`, `TableSkeleton`,
  `DetailSkeleton`, etc.)
- While queries are pending, use HeroUI `Skeleton` via shared components in
  `components/ui/` — never show loading text labels
- Destructive actions (delete agency, delete integration target, disconnect
  integration) must use `ConfirmationDialog` + `useOverlayState` from
  `components/ui/confirmation-dialog.tsx` — never mutate on first click

## Acceptance Criteria

- An `ADMIN` user can log in, see the admin shell with a working sidebar/navbar, and navigate to `/admin/agencies`
- The agencies list shows real data, supports search/filter/pagination
- Creating, editing, disabling/enabling/archiving, and deleting an agency all work end-to-end against the real API and update the UI without a manual refresh
- A `USER`-role account is still redirected away from `/admin/*` (regression check from Feature 01)
- `SUPPORT`-role account can view but write actions are hidden or disabled in the UI (matching the API's `403`)
