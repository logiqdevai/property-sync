# Task: Wire an admin-only route group on the frontend

## Feature group

`docs/plan/PROGRESS.md` → **Feature 01: Platform Foundation (Database, Auth & Roles)**

## Objective

Add a protected `/admin` route group so Feature 02 onward has somewhere to
mount admin pages, and prove role-based access control works end-to-end
against the real seeded users from task 01.

## Context — read this before touching anything

`app/src/routes/protected-route.tsx` **already implements** role checking —
`<ProtectedRoute requiredRoles={[...]}>` redirects non-matching roles to
`fallbackPath`, and `SUPER_ADMIN` always passes. Do not rebuild this, reuse
it exactly as-is.

`app/src/stores/auth.ts` already stores `role` from the login/register
response (`app/src/features/auth/services/auth.ts` already returns it via
`LoggedInUser`). No store changes are needed.

There is currently no `app/src/pages/admin/` directory and no `Routes.admin`
key — this task only adds the routing skeleton (a bare placeholder page),
not the real admin shell/sidebar (that is Feature 02, task
`tasks/feature-02-agencies/03-admin-shell-and-agencies-ui.md`).

## Requirements

1. Add an `admin` section to `app/src/routes/routes.ts`:
   ```ts
   admin: {
     root: "/admin",
   },
   ```
2. Create a minimal placeholder page `app/src/pages/admin/index.tsx` that
   renders a simple "Admin" heading — this gets replaced by the real
   dashboard home in Feature 10, and the real shell layout in Feature 02.
3. In `app/src/routes/index.tsx`, add an admin route group wrapped in
   `<ProtectedRoute loggedIn={true} requiredRoles={[RoleTypes.ADMIN, RoleTypes.SUPER_ADMIN, RoleTypes.SUPPORT]}>`
   rendering the placeholder page at `Routes.admin.root`. Import `RoleTypes`
   from `@/features/user/interfaces/user.interface`.
4. Do not build a layout component yet — render the placeholder directly
   (Feature 02 introduces `AdminLayout` with sidebar/navbar and nests routes
   under it, replacing this).

## Files to create or modify

### App (`app/`)

- `app/src/routes/routes.ts` (add `admin.root`)
- `app/src/pages/admin/index.tsx` (new placeholder)
- `app/src/routes/index.tsx` (add guarded `/admin` route)

## Subtasks

- [ ] Add `Routes.admin.root`
- [ ] Create placeholder `pages/admin/index.tsx`
- [ ] Add guarded route in `routes/index.tsx` using existing `ProtectedRoute`
- [ ] Manual test: log in as the seeded `USER` (from task 01's seed) → confirm navigating to `/admin` redirects away
- [ ] Manual test: log in as the seeded `ADMIN` → confirm `/admin` renders the placeholder

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc`
- No new frontend feature module is needed for this task (no API calls) —
  this is routing-only
- Do not hardcode `/admin` as a string anywhere outside `routes.ts`

## Acceptance Criteria

- A user with role `USER` who navigates to `/admin` is redirected to `Routes.dashboard.root`
- A user with role `ADMIN`, `SUPER_ADMIN`, or `SUPPORT` who navigates to `/admin` sees the placeholder page
- An unauthenticated visitor who navigates to `/admin` is redirected to `Routes.auth.sign_in`
