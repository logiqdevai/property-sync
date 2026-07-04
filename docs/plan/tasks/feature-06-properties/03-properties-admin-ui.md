# Task: Properties admin pages

## Feature group

`docs/plan/PROGRESS.md` → **Feature 06: Property Normalization & Admin Properties**

## Objective

Give admins a searchable/filterable properties list, a detail view with
full source-link and history timeline, and duplicate group merge/split
actions.

## Requirements

1. Add to `app/src/routes/routes.ts` under `admin`:
   ```ts
   properties: {
     list: "/admin/properties",
     detail: (id: string) => `/admin/properties/${id}`,
   },
   ```
2. Add routes in `routes/index.tsx`, nav item "Properties" in
   `admin-sidebar-content.tsx`.
3. `app/src/pages/admin/properties/index.tsx` — table: title, city, price,
   listing/property type badges, status badge, duplicate group indicator
   (icon/badge if `duplicate_group_id` is set); filters (status,
   listing_type, property_type, city, price range, search); row selection +
   "Merge selected" button (enabled when ≥2 rows selected) opening a confirm
   dialog using `useMergeProperties()`.
4. `app/src/pages/admin/properties/detail.tsx`:
   - Header: title, price, status/type badges, "Split from group" button
     (visible only if `duplicate_group_id` is set) using `useSplitProperty()`
   - Core fields panel (address, size, bedrooms/bathrooms, etc.)
   - Source links section: list of linked `SourceProperty` rows with
     `source_url` (external link icon) and `is_primary_source` indicator
   - History timeline: chronological list of `PropertyHistoryEntry` rows,
     each rendered with a readable label per `event_type` (e.g.
     `PRICE_CHANGED` → "Price changed from {old_value} to {new_value}",
     `REMOVED` → "Listing removed", `REAPPEARED` → "Listing reappeared") —
     build a small formatter function, do not just dump raw JSON for this
     section (raw JSON dumps are fine for Feature 05's execution trace view,
     but this is a user-facing history log)

## Files to create or modify

### App (`app/`)

- `app/src/routes/routes.ts`
- `app/src/routes/index.tsx`
- `app/src/components/layout/admin-sidebar-content.tsx`
- `app/src/pages/admin/properties/index.tsx` (new)
- `app/src/pages/admin/properties/detail.tsx` (new)

## Subtasks

- [ ] Add routes + nav item
- [ ] Build properties list page with filters + multi-select merge
- [ ] Build properties detail page with source links + formatted history timeline
- [ ] Build the `PropertyHistoryEntry` → readable label formatter

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc`
- Pages only use `features/properties/hooks/`

## Acceptance Criteria

- An admin can filter/search properties and see real crawl-derived data
- Selecting two properties and merging assigns them a shared duplicate
  group, visible via a badge/indicator; splitting one back out removes it
  from the group
- The history timeline reads as a clear human-readable audit log, not raw JSON
