# Task: Generation runs frontend data layer

## Feature group

`docs/plan/PROGRESS.md` → **Feature 04: AI Computer-Use Scraper Generation**

## Objective

Build the `scraper-generation` feature module for the review/replay UI.

## Requirements

1. Extend `app/src/config/api/routes.ts`:
   ```ts
   admin: {
     generationRuns: {
       prefix: "/admin/generation-runs",
       list: "/admin/generation-runs",
       detail: (id: string) => `/admin/generation-runs/${id}`,
       approve: (id: string) => `/admin/generation-runs/${id}/approve`,
       reject: (id: string) => `/admin/generation-runs/${id}/reject`,
       cancel: (id: string) => `/admin/generation-runs/${id}/cancel`,
     },
   },
   ```
2. `app/src/features/scraper-generation/interfaces/scraper-generation.interfaces.ts`:
   - `GenerationRun` (mirror API entity + `steps: ComputerUseStep[]` on detail)
   - `ComputerUseStep` (`step_index`, `action_type`, `action_payload`,
     `screenshot_before_url`, `screenshot_after_url`, `model_reasoning`) —
     note the API returns resolved screenshot URLs, not raw `Document` ids;
     confirm this matches what task 01's `entities/computer-use-step.entity.ts`
     actually returns and adjust the interface to match exactly
   - `GenerationRunStatus`, `GenerationTrigger` union types
   - `CreateGenerationRunPayload`, `RejectGenerationRunPayload`, `GenerationRunListQuery`
3. `app/src/features/scraper-generation/services/scraper-generation.services.ts`
   — list/detail/create/approve/reject/cancel
4. `app/src/features/scraper-generation/hooks/use-scraper-generation.ts`:
   - `useGenerationRuns(query)`, `useGenerationRun(id)`
   - `useCreateGenerationRun()` — on success, toast + `invalidateQueries(['generationRuns'])`
   - `useApproveGenerationRun()`, `useRejectGenerationRun()`, `useCancelGenerationRun()`
     — each invalidates `['generationRuns']` **and** `['scrapers']` (since
     approval changes scraper/version state that the Feature 03 UI displays)
   - For the "replay" view, add `useGenerationRun(id, { refetchInterval: (data) => data?.status === 'RUNNING' || data?.status === 'QUEUED' ? 2000 : false })`
     so an in-progress run's steps appear live without a manual page refresh

## Files to create or modify

### App (`app/`)

- `app/src/config/api/routes.ts` (extend `admin.generationRuns`)
- `app/src/features/scraper-generation/interfaces/scraper-generation.interfaces.ts`
- `app/src/features/scraper-generation/services/scraper-generation.services.ts`
- `app/src/features/scraper-generation/hooks/use-scraper-generation.ts`

## Subtasks

- [ ] Extend `ApiRoutes.admin.generationRuns`
- [ ] Write interfaces matching the real API response from Feature 04 task 01
- [ ] Write services
- [ ] Write hooks including the polling behavior for in-progress runs
- [ ] Verify cross-invalidation with `['scrapers']` on approve/reject/cancel

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc`
- No form/validation schema needed here beyond a simple "prompt" textarea — put
  a minimal Zod schema (`source_agency_id` required, `scraper_id` optional,
  `prompt` optional) in `validation-schemas/scraper-generation.schema.ts` for
  the manual trigger form used by the next task

## Acceptance Criteria

- `useGenerationRun(id)` polls every 2s only while the run is `QUEUED`/`RUNNING`, stops polling once terminal
- Approve/reject/cancel mutations refresh both generation-run and scraper data across the app without a manual reload
- `tsc --noEmit` passes in `app/`
