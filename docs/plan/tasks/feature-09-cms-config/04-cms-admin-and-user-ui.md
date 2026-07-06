# Task: Integration Targets admin page + user Integrations page

## Feature group

`docs/plan/PROGRESS.md` → **Feature 09: Integration Targets & User Integrations (configuration only)**

## Objective

Admin page with full CRUD for `IntegrationTarget` plus inspect/manage user
connections; user-facing page to connect their own accounts.

**Status note:** Not implemented yet — no admin routes, pages, or sidebar nav
exist in `app/` today. This task adds them from scratch.

## Requirements

1. Add to `app/src/routes/routes.ts`:
   ```ts
   admin: {
     integrationTargets: {
       list: "/admin/integration-targets",
       detail: (id: string) => `/admin/integration-targets/${id}`,
     },
   },
   dashboard: {
     integrations: "/dashboard/integrations",
   },
   ```
2. Add routes in `routes/index.tsx`; nav item **"Integration Targets"** in
   the admin sidebar; nav item **"Integrations"** in the user-facing
   `sidebar-content.tsx`.
3. `app/src/pages/admin/integration-targets/index.tsx` — **list + create**:
   - Table columns: `integration_type`, `auth_type`, `base_url`, `allow_multiple`,
     `is_visible` toggle, connected account count
   - Row click → detail page
   - Create modal/form: `integration_type`, `auth_type`, optional `base_url`,
     `allow_multiple`, `is_visible` (defaults per schema)
   - Edit/delete or navigate to detail for full edit
4. `app/src/pages/admin/integration-targets/detail.tsx` — **read/update/delete**:
   - Editable target fields (`integration_type`, `auth_type`, `base_url`,
     `allow_multiple`, `is_visible`)
   - Connected accounts table (masked credential indicators, e.g. "API key
     set ✓" instead of any value) with enable/disable/edit actions
   - Add account on behalf of a user (user picker + credential fields per
     `auth_type`; let API 400 when `allow_multiple` is false and user already
     has a connection — surface via toast)
5. `app/src/pages/dashboard/integrations/index.tsx` — list of visible integration
   targets, each showing connect/connected state; "Connect" opens a form
   (fields driven by the target's `auth_type`, using the discriminated Zod
   schema); connected accounts show masked indicators + enable/disable/edit/
   disconnect actions.

## Shared UI — reuse before creating

**First step:** read every file in `app/src/components/ui/` and reuse what fits.

| Existing primitive | Use on these pages |
| --- | --- |
| `ActionButtonWithPending` | Create / save / connect / disconnect / visibility toggle actions |
| `ConfirmationDialog` | Delete / disconnect confirmations (`@/components/ui/confirmation-dialog`) |
| `PasswordInput` | `EMAIL_PASSWORD` / `USERNAME_PASSWORD` credential fields |
| `form.tsx` wrappers | All connect / edit modals |
| `toast.tsx` | Already wired via feature mutation hooks |
| `ConfirmationDialog` + `useOverlayState` | All delete / disconnect actions |

**Create in `components/ui/` only when missing and reused on 2+ screens:**

- `table-skeleton.tsx` — `TableSkeleton` for list + connected-accounts tables
- `detail-skeleton.tsx` — `DetailSkeleton` for detail pages

**Create in `features/user-integrations/components/` when shared between admin detail + user Integrations page (not page-local copies):**

- `integration-credential-fields.tsx` — fields rendered from `auth_type` (uses `PasswordInput` where applicable)

Do **not** add page-local duplicates of anything already in `components/ui/`.

## Loading states

- While list/detail/connections queries are `isPending`, render the matching skeleton component — **never** `"Loading..."`, `"Please wait"`, or a lone centered spinner as the page body.
- Shape skeletons to the final layout (table row count, detail field grid, integration card grid on `/dashboard/integrations`).
- Button-level pending state only via `ActionButtonWithPending` / HeroUI `Button isPending` on the clicked action.
- **Delete / disconnect:** always gate with `ConfirmationDialog` from `components/ui/confirmation-dialog.tsx` — never fire the mutation directly from a list/detail button without confirmation.

## Files to create or modify

### App (`app/`)

- `app/src/routes/routes.ts`
- `app/src/routes/index.tsx`
- `app/src/components/layout/admin-sidebar-content.tsx` (or equivalent admin nav — add Integration Targets link)
- `app/src/components/layout/sidebar-content.tsx`
- `app/src/components/ui/table-skeleton.tsx`, `detail-skeleton.tsx`, `confirmation-dialog.tsx` (reuse — already in `components/ui/`)
- `app/src/features/user-integrations/components/integration-credential-fields.tsx` (new — shared credential form fields)
- `app/src/pages/admin/integration-targets/index.tsx` (new)
- `app/src/pages/admin/integration-targets/detail.tsx` (new)
- `app/src/pages/dashboard/integrations/index.tsx` (new)

## Subtasks

- [ ] Audit `components/ui/` and reuse existing primitives
- [ ] Add shared skeleton components to `components/ui/` if missing (`TableSkeleton`, `DetailSkeleton`)
- [ ] Add routes + nav items (admin and user shells)
- [ ] Build admin Integration Targets list (CRUD) + detail/accounts management pages
- [ ] Build user Integrations page with the dynamic connect form

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc` (shared UI reuse + Skeleton-only loading)
- Use HeroUI React v3 for table, modal, switch, badge; consult Context7 HeroUI docs for exact APIs
- Never render a plaintext credential value anywhere in the UI, even one
  fetched moments ago — only ever show masked indicators
- Admin CRUD must cover create, list, read, update, visibility toggle, and delete (hard delete only when no `UserIntegration` rows reference the target)

## Acceptance Criteria

- An admin can create, list, view, edit, and toggle visibility on an
  `IntegrationTarget`, and manage connected user accounts on the detail page
- A user can connect to a visible target, edit their credentials, disable,
  and disconnect — with credentials never shown in plaintext anywhere in the UI
- List and detail pages show HeroUI skeleton placeholders while data loads — no loading text labels anywhere
- No duplicated UI primitives that already exist under `components/ui/`
- Delete integration target and disconnect user integration both require `ConfirmationDialog` before the mutation runs
- Confirmed (manually and by code review) that no `CmsSyncRun` row is ever
  created anywhere in the codebase touched by this feature
