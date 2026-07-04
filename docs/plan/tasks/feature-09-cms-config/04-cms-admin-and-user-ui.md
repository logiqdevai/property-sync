# Task: CMS Targets admin page + user Integrations page

## Feature group

`docs/plan/PROGRESS.md` → **Feature 09: CMS Targets & User Integrations (configuration only)**

## Objective

Admin page to manage supported CMS platforms and inspect/manage user
connections; user-facing page to connect their own accounts.

## Requirements

1. Add to `app/src/routes/routes.ts`:
   ```ts
   admin: {
     cmsTargets: {
       list: "/admin/cms-targets",
       detail: (id: string) => `/admin/cms-targets/${id}`,
     },
   },
   dashboard: {
     integrations: "/dashboard/integrations",
   },
   ```
2. Add routes in `routes/index.tsx`; nav item "CMS Targets" in
   `admin-sidebar-content.tsx`; nav item "Integrations" in the user-facing
   `sidebar-content.tsx`.
3. `app/src/pages/admin/cms-targets/index.tsx` — table: `cms_type`,
   `auth_type`, `base_url`, `allow_multiple`, active toggle, connected
   account count; create form (modal).
4. `app/src/pages/admin/cms-targets/detail.tsx` — target fields (editable)
   + connected accounts table (masked credential indicators, e.g. "API key
   set ✓" instead of any value) with enable/disable/edit actions; add
   account on behalf of a user (user picker + credential fields per
   `auth_type`, disabled/hidden if `allow_multiple` is false and every
   eligible user already has one — simplest correct behavior is to just let
   the API 400 and surface the error via toast, no need for complex
   client-side precomputation).
5. `app/src/pages/dashboard/integrations/index.tsx` — list of active CMS
   targets, each showing connect/connected state; "Connect" opens a form
   (fields driven by the target's `auth_type`, using the discriminated Zod
   schema); connected accounts show masked indicators + enable/disable/edit/
   disconnect actions.

## Files to create or modify

### App (`app/`)

- `app/src/routes/routes.ts`
- `app/src/routes/index.tsx`
- `app/src/components/layout/admin-sidebar-content.tsx`
- `app/src/components/layout/sidebar-content.tsx`
- `app/src/pages/admin/cms-targets/index.tsx` (new)
- `app/src/pages/admin/cms-targets/detail.tsx` (new)
- `app/src/pages/dashboard/integrations/index.tsx` (new)

## Subtasks

- [ ] Add routes + nav items (admin and user shells)
- [ ] Build admin CMS Targets list + detail/accounts management pages
- [ ] Build user Integrations page with the dynamic connect form

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc`
- Never render a plaintext credential value anywhere in the UI, even one
  fetched moments ago — only ever show masked indicators

## Acceptance Criteria

- An admin can create a CMS target, and a user can connect to it, edit
  their credentials, disable, and disconnect — with credentials never shown
  in plaintext anywhere in the UI after initial entry
- Confirmed (manually and by code review) that no `CmsSyncRun` row is ever
  created anywhere in the codebase touched by this feature
