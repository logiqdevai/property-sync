# Task: Properties frontend data layer

## Feature group

`docs/plan/PROGRESS.md` → **Feature 06: Property Normalization & Admin Properties**

## Objective

Build the admin-facing `properties` feature module.

## Requirements

1. Extend `app/src/config/api/routes.ts`:
   ```ts
   admin: {
     properties: {
       prefix: "/admin/properties",
       list: "/admin/properties",
       detail: (id: string) => `/admin/properties/${id}`,
       merge: "/admin/properties/merge",
       split: (id: string) => `/admin/properties/${id}/split`,
     },
   },
   ```
2. `app/src/features/properties/interfaces/properties.interfaces.ts` —
   `Property` (mirror entity), `PropertyDetail` (+ `source_links:
   PropertySourceLink[]`, `history: PropertyHistoryEntry[]`),
   `PropertySourceLink` (with nested `source_property` summary),
   `PropertyHistoryEntry` (`event_type`, `field`, `old_value`, `new_value`,
   `created_at`), `PropertyListQuery`
3. `app/src/features/properties/services/properties.services.ts` —
   list/detail/merge/split
4. `app/src/features/properties/hooks/use-properties.ts` —
   `useProperties(query)`, `useProperty(id)`, `useMergeProperties()`,
   `useSplitProperty()` (both toast + invalidate `['properties']`)
5. `app/src/features/properties/validation-schemas/properties.schema.ts` —
   Zod schema for the merge form (`property_ids: z.array(z.string()).min(2)`)

## Files to create or modify

### App (`app/`)

- `app/src/config/api/routes.ts` (extend `admin.properties`)
- `app/src/features/properties/interfaces/properties.interfaces.ts`
- `app/src/features/properties/services/properties.services.ts`
- `app/src/features/properties/hooks/use-properties.ts`
- `app/src/features/properties/validation-schemas/properties.schema.ts`

## Subtasks

- [ ] Extend `ApiRoutes.admin.properties`
- [ ] Write interfaces matching the real Feature 06 API response shape
- [ ] Write services and hooks
- [ ] Write the merge form Zod schema

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc`

## Acceptance Criteria

- All hooks correctly toast + invalidate `['properties']` on mutation
- `tsc --noEmit` passes in `app/`
