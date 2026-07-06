# Task: User tracking & UserProperty frontend data layer

## Feature group

`docs/plan/PROGRESS.md` → **Feature 07: User Tracked Agencies & UserProperty**

## Objective

Build the user-facing `user-tracked-agencies` and `user-properties` feature
modules (distinct from the admin `agencies`/`properties` modules from
Features 02/06 — these hit different, user-scoped endpoints).

## Requirements

1. Extend `app/src/config/api/routes.ts` (top-level, not under `admin`):
   ```ts
   agencies: {
     prefix: "/agencies",
     list: "/agencies",
     track: (agencyId: string) => `/agencies/${agencyId}/track`,
   },
   userProperties: {
     prefix: "/properties",
     list: "/properties",
     detail: (id: string) => `/properties/${id}`,
     resync: (id: string) => `/properties/${id}/resync`,
   },
   ```
2. `app/src/features/user-tracked-agencies/interfaces/user-tracked-agencies.interfaces.ts`
   — `TrackableAgency` (public agency fields + `is_tracked`,
   `tracking_prefs?` including `use_ai_batching`, `ai_provider`, `ai_model`),
   `TrackAgencyPayload` (change-type toggles + optional `use_ai_batching`,
   `ai_provider`, `ai_model`), `AgencyListQuery`
3. `app/src/features/user-tracked-agencies/services/user-tracked-agencies.services.ts`
   — list/track/updateTracking/untrack
4. `app/src/features/user-tracked-agencies/hooks/use-user-tracked-agencies.ts`
   — `useTrackableAgencies(query)`, `useTrackAgency()`,
   `useUpdateAgencyTracking()`, `useUntrackAgency()` (each toast + invalidate
   `['trackableAgencies']`)
5. `app/src/features/user-properties/interfaces/user-properties.interfaces.ts`
   — `UserProperty` (mirror entity), `UserPropertyDetail` (+
   `history: PropertyHistoryEntry[]` — reuse the shape from
   `features/properties/interfaces` if importing across features is allowed
   by the rules; otherwise duplicate the small type locally per feature
   isolation), `UpdateUserPropertyPayload`, `UserPropertyListQuery`
6. `app/src/features/user-properties/services/user-properties.services.ts`
   — list/detail/update/resync
7. `app/src/features/user-properties/hooks/use-user-properties.ts` —
   `useUserProperties(query)`, `useUserProperty(id)`,
   `useUpdateUserProperty()`, `useResyncUserProperty()` (toast + invalidate
   `['userProperties']`)
8. `app/src/features/user-properties/validation-schemas/user-properties.schema.ts`
   — Zod schema for the edit form matching `UpdateUserPropertyPayload`

## Files to create or modify

### App (`app/`)

- `app/src/config/api/routes.ts` (add `agencies`, `userProperties` top-level keys)
- `app/src/features/user-tracked-agencies/interfaces/user-tracked-agencies.interfaces.ts`
- `app/src/features/user-tracked-agencies/services/user-tracked-agencies.services.ts`
- `app/src/features/user-tracked-agencies/hooks/use-user-tracked-agencies.ts`
- `app/src/features/user-properties/interfaces/user-properties.interfaces.ts`
- `app/src/features/user-properties/services/user-properties.services.ts`
- `app/src/features/user-properties/hooks/use-user-properties.ts`
- `app/src/features/user-properties/validation-schemas/user-properties.schema.ts`

## Subtasks

- [ ] Add top-level `ApiRoutes.agencies` and `ApiRoutes.userProperties`
- [ ] Build `user-tracked-agencies` feature module
- [ ] Build `user-properties` feature module including the edit form schema

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc`
- These are distinct feature directories from the admin `agencies`/`properties`
  modules — do not merge them, the API surfaces and auth scope differ

## Acceptance Criteria

- All hooks toast + invalidate their respective query keys on mutation
- `tsc --noEmit` passes in `app/`
