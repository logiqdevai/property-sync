# Task: Crawl runs & jobs admin pages

## Feature group

`docs/plan/PROGRESS.md` → **Feature 05: Crawl Execution Engine & Job Queue**

## Objective

Give admins visibility into every crawl execution and background job, with
rerun/retry actions, and replace the Feature 02 Agency detail page's and
Feature 03 Scraper detail page's empty-state "recent crawl runs" panels with
real data.

## Requirements

1. Add to `app/src/routes/routes.ts` under `admin`:
   ```ts
   crawlRuns: {
     list: "/admin/crawl-runs",
     detail: (id: string) => `/admin/crawl-runs/${id}`,
   },
   jobs: {
     list: "/admin/jobs",
     detail: (id: string) => `/admin/jobs/${id}`,
   },
   ```
2. Add routes in `routes/index.tsx`, nav items "Crawl Runs" and "Job Queue"
   in `admin-sidebar-content.tsx`.
3. `app/src/pages/admin/crawl-runs/index.tsx` — table: agency, scraper,
   status badge, totals (found/created/updated/removed/failed), started/
   finished times; filters (status, agency, scraper, date range).
4. `app/src/pages/admin/crawl-runs/detail.tsx` — header with totals and
   status (live-updating while `RUNNING` via the polling hook); "Rerun"
   button; `ScraperExecutionTrace` steps rendered as a readable log (JSON
   pretty-print is acceptable, this is a debug view not end-user facing);
   linked `JobLog` rows with status badges linking to job detail.
5. `app/src/pages/admin/jobs/index.tsx` — table: queue name, job name,
   status badge, attempt/max_attempts, duration, linked crawl run (if any);
   filters (status, queue_name); "Retry" action on failed rows.
6. `app/src/pages/admin/jobs/detail.tsx` — payload/result/error/stack trace
   (pretty-printed), retry button if `FAILED`.
7. Update `app/src/pages/admin/agencies/detail.tsx` (Feature 02) and
   `app/src/pages/admin/scrapers/detail.tsx` (Feature 03): replace their
   "recent crawl runs" empty-state sections with a real list using
   `useCrawlRuns({ agency_id })` / `useCrawlRuns({ scraper_id })`, each row
   linking to `Routes.admin.crawlRuns.detail(id)`.

## Files to create or modify

### App (`app/`)

- `app/src/routes/routes.ts`
- `app/src/routes/index.tsx`
- `app/src/components/layout/admin-sidebar-content.tsx`
- `app/src/pages/admin/crawl-runs/index.tsx` (new)
- `app/src/pages/admin/crawl-runs/detail.tsx` (new)
- `app/src/pages/admin/jobs/index.tsx` (new)
- `app/src/pages/admin/jobs/detail.tsx` (new)
- `app/src/pages/admin/agencies/detail.tsx` (wire real crawl run list)
- `app/src/pages/admin/scrapers/detail.tsx` (wire real crawl run list)

## Subtasks

- [ ] Add routes + nav items for Crawl Runs and Job Queue
- [ ] Build crawl runs list + detail pages
- [ ] Build jobs list + detail pages
- [ ] Wire real crawl-run lists into Agency and Scraper detail pages

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc`
- Reuse status badge components from Features 02–04

## Acceptance Criteria

- An admin can trigger a scraper run from its detail page and watch the new
  `CrawlRun` progress live on the Crawl Runs detail page
- Job Queue page shows real `JobLog` rows and a failed job can be retried
  from the UI, visibly transitioning back to `ACTIVE`/`COMPLETED`
- Agency and Scraper detail pages show their real recent crawl run history
