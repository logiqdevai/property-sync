# Task: Crawl runs & jobs frontend data layer

## Feature group

`docs/plan/PROGRESS.md` → **Feature 05: Crawl Execution Engine & Job Queue**

## Objective

Build the `crawl-runs` and `jobs` feature modules.

## Requirements

1. Extend `app/src/config/api/routes.ts`:
   ```ts
   admin: {
     crawlRuns: {
       prefix: "/admin/crawl-runs",
       list: "/admin/crawl-runs",
       detail: (id: string) => `/admin/crawl-runs/${id}`,
       rerun: (id: string) => `/admin/crawl-runs/${id}/rerun`,
     },
     jobs: {
       prefix: "/admin/jobs",
       list: "/admin/jobs",
       detail: (id: string) => `/admin/jobs/${id}`,
       retry: (id: string) => `/admin/jobs/${id}/retry`,
     },
   },
   ```
2. `app/src/features/crawl-runs/interfaces/crawl-runs.interfaces.ts` —
   `CrawlRun` (mirror entity incl. `total_found`/`total_created`/
   `total_updated`/`total_removed`/`total_failed`), `CrawlRunDetail` (+
   `execution_traces`, `job_logs`), `CrawlRunStatus` union,
   `CrawlRunListQuery`
3. `app/src/features/crawl-runs/services/crawl-runs.services.ts` —
   list/detail/rerun
4. `app/src/features/crawl-runs/hooks/use-crawl-runs.ts` —
   `useCrawlRuns(query)`, `useCrawlRun(id, { refetchInterval: (data) =>
   data?.status === 'RUNNING' || data?.status === 'QUEUED' ? 2000 : false
   })` (live progress while running, same polling pattern as Feature 04's
   generation runs), `useRerunCrawlRun()` (toast + invalidate `['crawlRuns']`)
5. `app/src/features/jobs/interfaces/jobs.interfaces.ts` — `JobLog`,
   `JobStatus` union, `JobLogListQuery`
6. `app/src/features/jobs/services/jobs.services.ts` — list/detail/retry
7. `app/src/features/jobs/hooks/use-jobs.ts` — `useJobs(query)`,
   `useJob(id)`, `useRetryJob()` (toast + invalidate `['jobs']`)

## Files to create or modify

### App (`app/`)

- `app/src/config/api/routes.ts` (extend `admin.crawlRuns`, `admin.jobs`)
- `app/src/features/crawl-runs/interfaces/crawl-runs.interfaces.ts`
- `app/src/features/crawl-runs/services/crawl-runs.services.ts`
- `app/src/features/crawl-runs/hooks/use-crawl-runs.ts`
- `app/src/features/jobs/interfaces/jobs.interfaces.ts`
- `app/src/features/jobs/services/jobs.services.ts`
- `app/src/features/jobs/hooks/use-jobs.ts`

## Subtasks

- [ ] Extend `ApiRoutes.admin.crawlRuns` and `ApiRoutes.admin.jobs`
- [ ] Write `crawl-runs` feature module (interfaces, services, hooks)
- [ ] Write `jobs` feature module (interfaces, services, hooks)
- [ ] Verify live polling stops once a crawl run reaches a terminal status

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc`
- No forms/schemas needed for this feature (read + action-button only)

## Acceptance Criteria

- `useCrawlRun(id)` polls while `QUEUED`/`RUNNING`, stops on terminal status
- Rerun and retry mutations toast and refresh their respective lists
- `tsc --noEmit` passes in `app/`
