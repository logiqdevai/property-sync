# Task: Scrapers admin pages

## Feature group

`docs/plan/PROGRESS.md` → **Feature 03: Scraper Management**

## Objective

Give admins a full UI to browse scrapers, inspect health, manage versions
with diff/rollback, and manually create scrapers.

## Requirements

1. Add to `app/src/routes/routes.ts` under `admin`:
   ```ts
   scrapers: {
     list: "/admin/scrapers",
     detail: (id: string) => `/admin/scrapers/${id}`,
   },
   ```
2. Add nav item "Scrapers" to `app/src/components/layout/admin-sidebar-content.tsx`
   (uncomment/replace the placeholder left by Feature 02, icon e.g. `Bot` or `Code2`).
3. Add routes in `app/src/routes/index.tsx` inside the existing `/admin/*` group:
   `agencies/list` route already exists; add `scrapers` and `scrapers/:id`.
4. `app/src/pages/admin/scrapers/index.tsx` — list page:
   - Table: name, agency name (link to `Routes.admin.agencies.detail`),
     status badge, health badge (color-coded: EXCELLENT/GOOD green,
     WARNING yellow, CRITICAL/BROKEN red), success_rate, last run times
   - Filters: status, health, agency, search
   - "New scraper" button → modal form (source agency select, name, config
     JSON textarea) using `useCreateScraper()`
   - Row click → `Routes.admin.scrapers.detail(id)`
5. `app/src/pages/admin/scrapers/detail.tsx` — detail page:
   - Header: name, agency, status badge, health badge, `self_healing_enabled`
     toggle switch (wired to `useUpdateScraper()`)
   - Health stats panel: success_rate, avg_runtime_ms, consecutive_failures,
     last_success_at, last_failure_at
   - "Run now" button calling `useRunScraperNow()` — on the expected `501`
     error, show a toast saying "Manual runs are not available yet (coming
     with the crawl engine)" instead of a generic error message
   - Version history panel (`useScraperVersions(id)`):
     - List of versions (version number, created_by, notes, created_at),
       active one clearly marked
     - Selecting two versions shows a JSON diff (simple side-by-side
       `JSON.stringify(config, null, 2)` in two panes is acceptable for this
       task — a visual line-diff library is a nice-to-have, not required)
     - "Rollback to this version" button on any non-active version →
       `useActivateScraperVersion()`
     - "New version" button → modal form (config JSON textarea + notes) using
       `useCreateScraperVersion()`
   - Empty-state placeholder panel titled "Generation Runs" ("AI-assisted
     generation coming in a later phase") — Feature 04 replaces this
   - Empty-state placeholder panel titled "Recent Crawl Runs" — Feature 05
     replaces this

## Files to create or modify

### App (`app/`)

- `app/src/routes/routes.ts` (extend `admin.scrapers`)
- `app/src/routes/index.tsx` (add scrapers routes)
- `app/src/components/layout/admin-sidebar-content.tsx` (add nav item)
- `app/src/pages/admin/scrapers/index.tsx` (new)
- `app/src/pages/admin/scrapers/detail.tsx` (new)

## Subtasks

- [ ] Add routes + nav item
- [ ] Build scrapers list page with filters + create modal
- [ ] Build scraper detail page: health stats, self-heal toggle, run-now (with friendly 501 message)
- [ ] Build version history panel: list, diff view, rollback, new version
- [ ] Manual test: create a scraper, add a second version, view diff, roll back, confirm active version changes in both UI and via `GET /admin/scrapers/:id`

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc`
- Pages only use `features/scrapers/hooks/` — no direct API calls
- Reuse any `StatusBadge`/`HealthBadge` component pattern established in
  Feature 02 if applicable; otherwise add a shared badge component to
  `app/src/components/ui/`

## Acceptance Criteria

- Admin can create a scraper with a manual JSON config and see it in the list
- Admin can create additional versions, diff them, and roll back — the active version and status update correctly everywhere (list, detail, agency detail page's future "Scrapers" panel data source)
- "Run now" shows a clear "not available yet" message rather than a raw error
- All actions respect roles the same way as Feature 02 (`SUPPORT` read-only, `USER`/anonymous blocked)
