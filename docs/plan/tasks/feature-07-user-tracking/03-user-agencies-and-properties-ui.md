# Task: User-facing Agencies & My Properties pages

## Feature group

`docs/plan/PROGRESS.md` → **Feature 07: User Tracked Agencies & UserProperty**

## Objective

Give end users (not admins) a page to browse and track agencies with
per-change-type preferences, and a page to view/edit/resync their own
tracked properties — the first real pages inside the existing user
dashboard shell (`app/src/pages/dashboard/`).

## Context — read this before touching anything

`app/src/pages/dashboard/layout.tsx` + `index.tsx` already exist as the
user-facing shell — these new pages are **siblings** of `dashboard/index.tsx`
under the same layout, reached via `Routes.dashboard.*`, not new top-level
routes and not under `/admin`.

## Requirements

1. Extend `app/src/routes/routes.ts` `dashboard` key:
   ```ts
   dashboard: {
     root: "/dashboard",
     agencies: "/dashboard/agencies",
     properties: {
       list: "/dashboard/properties",
       detail: (id: string) => `/dashboard/properties/${id}`,
     },
   },
   ```
2. Add routes in `app/src/routes/index.tsx` nested under the existing
   dashboard layout route. Add nav items "Agencies" and "My Properties" to
   the user-facing sidebar content (`app/src/components/layout/sidebar-content.tsx`
   — the existing user shell's nav list, not the admin one).
3. `app/src/pages/dashboard/agencies/index.tsx` — grid/list of visible active
   agencies (`is_visible: true` from API) with a "Track" toggle per card;
   disable the toggle when `is_enabled` is `false` (show "Not available for
   tracking" helper text). When tracked, expand to show three checkboxes
   (new/removed/updated listings) plus a **"Use AI batching (lower cost,
   slower updates)"** toggle bound to `use_ai_batching` using
   `useUpdateAgencyTracking()`; an **AI provider** select (`OPENAI` /
   `ANTHROPIC` / `GEMINI`) and optional **model** text input bound to
   `ai_provider` / `ai_model`; if the user lacks an active integration for
   the selected provider, show an inline link to `/integrations` to connect
   first (disable track/save until connected); helper text that batching
   applies only on scheduled crawls attributed to this tracker when
   `use_ai_batching: true` and `ai_provider: OPENAI`; untrack action with a
   confirm.
4. `app/src/pages/dashboard/properties/index.tsx` — table/grid of the
   user's `UserProperty` rows with filters (status, city, price range); each
   row shows an "edited" badge when `is_modified` is true.
5. `app/src/pages/dashboard/properties/detail.tsx`:
   - Full property fields, editable via a form (`react-hook-form` +
     `zodResolver` + the schema from the previous task) — saving calls
     `useUpdateUserProperty()`
   - If `is_modified`: a visible warning banner ("This listing has been
     edited and will no longer auto-update from the source") with a
     "Resync from source" button (`useResyncUserProperty()`) that requires a
     confirm dialog since it discards local edits
   - History timeline section reusing the same formatted-history approach
     from Feature 06's admin property detail page (extract a small shared
     formatter if convenient, otherwise duplicate — keep it simple)

## Files to create or modify

### App (`app/`)

- `app/src/routes/routes.ts` (extend `dashboard`)
- `app/src/routes/index.tsx` (add nested routes)
- `app/src/components/layout/sidebar-content.tsx` (add nav items)
- `app/src/pages/dashboard/agencies/index.tsx` (new)
- `app/src/pages/dashboard/properties/index.tsx` (new)
- `app/src/pages/dashboard/properties/detail.tsx` (new)

## Subtasks

- [ ] Extend routes + nav items in the user shell
- [ ] Build the Agencies browse/track page with per-type preference toggles, AI batching toggle, and AI provider/model controls
- [ ] Build the My Properties list page
- [ ] Build the property detail/edit page with the `is_modified` warning + resync flow
- [ ] Manual test: track an agency, wait for/trigger a crawl, see a property appear, edit it, re-trigger a crawl, confirm the edit persists, then resync and confirm it's overwritten

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc`
- Pages only consume `features/user-tracked-agencies/hooks/` and
  `features/user-properties/hooks/` — no direct API calls

## Acceptance Criteria

- A logged-in user can browse active agencies, track one with specific
  change-type preferences, optional AI batching, and AI provider/model
  selection, and see it reflected immediately
- The user's tracked properties list shows real data once a tracked
  agency's scraper has run
- Editing a property shows the "edited" badge and warning banner; resync
  correctly discards the edit and restores canonical data
