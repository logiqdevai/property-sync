# Task: Generation runs UI — trigger, replay, review

## Feature group

`docs/plan/PROGRESS.md` → **Feature 04: AI Computer-Use Scraper Generation**

## Objective

Let admins trigger AI scraper generation, watch the computer-use session
replay live (or after the fact) with screenshots and reasoning, and
approve/reject the resulting config.

## Requirements

1. Add to `app/src/routes/routes.ts`:
   ```ts
   generationRuns: {
     list: "/admin/generation-runs",
     detail: (id: string) => `/admin/generation-runs/${id}`,
   },
   ```
2. Add nav item "Generation Runs" to `admin-sidebar-content.tsx` (icon e.g. `Sparkles`).
3. Add routes in `routes/index.tsx` under `/admin/*`.
4. Replace the "Generation Runs" empty-state placeholder on the Scraper
   detail page (Feature 03) with: a "Generate with AI" / "Fix with AI"
   button (label depends on whether the scraper is `BROKEN`) that opens a
   modal (agency is pre-filled from context, `scraper_id` pre-filled,
   optional prompt textarea) using `useCreateGenerationRun()`, then a small
   list of this scraper's past generation runs (status + link to detail)
   fetched via `useGenerationRuns({ scraper_id })`.
5. `app/src/pages/admin/generation-runs/index.tsx` — list page: table of
   agency, scraper (if any), trigger badge (`MANUAL`/`SELF_HEAL`/`SCHEDULED`),
   status badge, created/finished times; filters by status/trigger/agency;
   "New generation run" button (same modal as above, but agency selectable
   since this entry point isn't scoped to one scraper)
6. `app/src/pages/admin/generation-runs/detail.tsx` — the replay/review view:
   - Header: agency, scraper (if any), trigger, status badge, prompt
   - If `status` is `QUEUED`/`RUNNING`: show a live-updating step timeline
     (steps polling via the hook from the previous task) with a loading
     indicator
   - Step timeline: for each `ComputerUseStep`, show step index, action type
     badge, before/after screenshot pair (click to enlarge), and
     `model_reasoning` text if present — this is the core "replay" feature,
     make it visually clear and scrollable/steppable (a simple vertical list
     with a "jump to step" mini-nav is sufficient, no need for a video-like
     scrubber)
   - If `status === 'AWAITING_REVIEW'`: prominent review panel showing the
     `staged_config` pretty-printed as JSON, with **Approve** and **Reject**
     buttons (`useApproveGenerationRun()` / `useRejectGenerationRun()`,
     reject opens a small dialog for an optional reason)
   - If `status` is `QUEUED`/`RUNNING`: a **Cancel** button
     (`useCancelGenerationRun()`)
   - If `status` is `SUCCESS`: show a link to the produced scraper version
     (`Routes.admin.scrapers.detail(scraperId)`)
   - If `status` is `FAILED`/`CANCELLED`: show `error_message`

## Files to create or modify

### App (`app/`)

- `app/src/routes/routes.ts` (extend `admin.generationRuns`)
- `app/src/routes/index.tsx` (add routes)
- `app/src/components/layout/admin-sidebar-content.tsx` (add nav item)
- `app/src/pages/admin/generation-runs/index.tsx` (new)
- `app/src/pages/admin/generation-runs/detail.tsx` (new)
- `app/src/pages/admin/scrapers/detail.tsx` (replace the Feature 03 "Generation Runs" placeholder panel with real trigger button + run list)

## Subtasks

- [ ] Add routes + nav item
- [ ] Build generation runs list page
- [ ] Build the detail/replay page with step timeline
- [ ] Build the review panel (approve/reject/cancel)
- [ ] Wire the trigger button into the Scraper detail page from Feature 03
- [ ] Manual test end-to-end: trigger a generation from the Scraper detail page, watch it run live, review the staged config, approve it, confirm the scraper's active version updates and the "Generation Runs" panel now shows this run as `SUCCESS`

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc`
- Pages only use `features/scraper-generation/hooks/`
- Reuse the badge components introduced in Features 02/03 for status/trigger badges

## Acceptance Criteria

- An admin can trigger generation from either the global Generation Runs page or a specific Scraper's detail page
- The replay view clearly shows every step the AI took with before/after screenshots and any reasoning text, live while running and identically after completion
- Approve promotes the config into a real, active `ScraperVersion` visible on the Scraper detail page; reject/cancel correctly end the run without touching the scraper
