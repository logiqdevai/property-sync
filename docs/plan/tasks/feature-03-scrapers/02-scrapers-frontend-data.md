# Task: Scrapers frontend data layer

## Feature group

`docs/plan/PROGRESS.md` → **Feature 03: Scraper Management**

## Objective

Build the `scrapers` feature module so the UI task has zero direct API
calls to write.

## Requirements

1. Extend `app/src/config/api/routes.ts` with:
   ```ts
   admin: {
     // ...agencies from Feature 02
     scrapers: {
       prefix: "/admin/scrapers",
       list: "/admin/scrapers",
       detail: (id: string) => `/admin/scrapers/${id}`,
       versions: (id: string) => `/admin/scrapers/${id}/versions`,
       activateVersion: (id: string, versionId: string) =>
         `/admin/scrapers/${id}/versions/${versionId}/activate`,
       runNow: (id: string) => `/admin/scrapers/${id}/run-now`,
     },
   },
   ```
2. `app/src/features/scrapers/interfaces/scrapers.interfaces.ts`:
   - `Scraper` (mirror API entity, include `active_version: ScraperVersion`, `source_agency: { id, name }`)
   - `ScraperVersion`
   - `ScraperStatus`, `ScraperHealth` union types
   - `CreateScraperPayload`, `CreateScraperVersionPayload`, `UpdateScraperPayload`
   - `ScraperListQuery`
3. `app/src/features/scrapers/validation-schemas/scrapers.schema.ts` — Zod
   schemas for: create scraper form (`source_agency_id`, `name`, `config` —
   config as a raw JSON textarea validated with a custom `.refine()` that
   attempts `JSON.parse`), create version form (`config` JSON textarea +
   `notes`)
4. `app/src/features/scrapers/services/scrapers.services.ts` — functions for
   list/detail/create/listVersions/createVersion/activateVersion/update/runNow
5. `app/src/features/scrapers/hooks/use-scrapers.ts`:
   - `useScrapers(query)`, `useScraper(id)`, `useScraperVersions(id)`
   - `useCreateScraper()`, `useCreateScraperVersion()`,
     `useActivateScraperVersion()`, `useUpdateScraper()`, `useRunScraperNow()`
   - Every mutation: `toast()` + `invalidateQueries({ queryKey: ['scrapers'] })`
     (and also invalidate `['scrapers', 'versions', id]` for
     version-affecting mutations)

## Files to create or modify

### App (`app/`)

- `app/src/config/api/routes.ts` (extend `admin.scrapers`)
- `app/src/features/scrapers/interfaces/scrapers.interfaces.ts`
- `app/src/features/scrapers/validation-schemas/scrapers.schema.ts`
- `app/src/features/scrapers/services/scrapers.services.ts`
- `app/src/features/scrapers/hooks/use-scrapers.ts`

## Subtasks

- [ ] Extend `ApiRoutes.admin.scrapers`
- [ ] Write interfaces
- [ ] Write Zod schemas (including JSON-textarea validation helper)
- [ ] Write services
- [ ] Write hooks with correct query-key invalidation

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc`
- `useRunScraperNow()` should surface the `501` error via the standard error
  toast (no special-casing needed) — the UI task will show it as "not
  available yet"

## Acceptance Criteria

- All hooks compile and correctly type the API responses
- Mutations invalidate both the scraper list and (where relevant) the specific scraper's version list
- `tsc --noEmit` passes in `app/`
