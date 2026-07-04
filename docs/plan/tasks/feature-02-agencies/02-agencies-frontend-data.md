# Task: Agencies frontend data layer

## Feature group

`docs/plan/PROGRESS.md` → **Feature 02: Admin Shell & Agencies**

## Objective

Build the `agencies` feature module (services, hooks, interfaces, schemas)
so the admin UI (next task) has zero direct API calls to write.

## Requirements

1. Add to `app/src/config/api/routes.ts`:
   ```ts
   admin: {
     agencies: {
       prefix: "/admin/agencies",
       list: "/admin/agencies",
       detail: (id: string) => `/admin/agencies/${id}`,
       status: (id: string) => `/admin/agencies/${id}/status`,
     },
   },
   ```
   (Add this as a new top-level `admin` key in `ApiRoutes` — do not nest it
   under `users` or `auth`.)
2. `app/src/features/agencies/interfaces/agencies.interfaces.ts`:
   - `SourceAgency` (mirror the Prisma model minus relations, plus optional
     `_count: { scrapers: number; crawl_runs: number }` on the detail shape)
   - `AgencyStatus` union type (`'ACTIVE' | 'DISABLED' | 'ARCHIVED'`)
   - `CreateAgencyPayload`, `UpdateAgencyPayload`
   - `AgencyListQuery` (page, limit, search?, status?, country?, city?)
   - `PaginatedResponse<T>` generic if one doesn't already exist in a shared
     interfaces file (check `app/src/features/` for an existing shared
     pagination type before creating a new one; if none exists, define it
     locally in this file)
3. `app/src/features/agencies/validation-schemas/agencies.schema.ts` — Zod
   schema for the create/edit form (`name` required, `base_url` required
   valid URL, `country`/`city`/`notes` optional, `crawl_interval` optional)
4. `app/src/features/agencies/services/agencies.services.ts` — plain async
   functions using `axiosInstance` + `ApiRoutes.admin.agencies.*`, each
   returning `response.data` directly (list function returns the full
   `{ data, pagination }` envelope, not just `data`, since the UI needs both)
5. `app/src/features/agencies/hooks/use-agencies.ts`:
   - `useAgencies(query: AgencyListQuery)` — `useQuery`, query key
     `['agencies', 'list', query]`
   - `useAgency(id: string)` — `useQuery`, query key `['agencies', 'detail', id]`, `enabled: !!id`
   - `useCreateAgency()` — `useMutation`, on success: `toast()` + `queryClient.invalidateQueries({ queryKey: ['agencies'] })`
   - `useUpdateAgency()` — same pattern, invalidate `['agencies']`
   - `useUpdateAgencyStatus()` — same pattern
   - `useDeleteAgency()` — same pattern

## Files to create or modify

### App (`app/`)

- `app/src/config/api/routes.ts` (add `admin.agencies`)
- `app/src/features/agencies/interfaces/agencies.interfaces.ts`
- `app/src/features/agencies/validation-schemas/agencies.schema.ts`
- `app/src/features/agencies/services/agencies.services.ts`
- `app/src/features/agencies/hooks/use-agencies.ts`

## Subtasks

- [ ] Add `ApiRoutes.admin.agencies`
- [ ] Write interfaces matching the API response shape from task 01
- [ ] Write Zod form schema
- [ ] Write services (list/detail/create/update/updateStatus/remove)
- [ ] Write hooks with toast + invalidateQueries on every mutation
- [ ] No page/component in this task — verify by importing the hooks in a
      throwaway test file or the browser console only if needed; the real UI
      wiring happens in the next task

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc`
- No API calls outside `features/agencies/services/` — pages must only use
  the hooks from this task
- Use `@/` path alias everywhere, no relative cross-folder imports

## Acceptance Criteria

- `useAgencies` returns `{ data: SourceAgency[], pagination }` and refetches when `query` changes
- Every mutation hook toasts on success/error and invalidates the `['agencies']` query key so list/detail views update automatically
- `npm run build` (or `tsc --noEmit`) in `app/` passes with no type errors introduced by this task
