# Task: User tracked agencies + UserProperty API (with crawl-time hook)

## Feature group

`docs/plan/PROGRESS.md` → **Feature 07: User Tracked Agencies & UserProperty**

## Objective

Let end users track agencies with per-change-type notification preferences,
and automatically get their own editable copy (`UserProperty`) of any
canonical `Property` surfaced by a tracked agency, with a divergence-aware
sync rule.

## Context — read this before touching anything

Read `docs/plan/directions/03-domain-model.md` — the **`UserProperty`
divergence rule** is the one invariant this task must get exactly right:
when a crawl updates canonical `Property` data, the matching `UserProperty`
row is updated from canonical **unless** `is_modified: true` (user has local
edits) — in that case leave it untouched. Only a manual `resync` action may
overwrite a modified copy. Always set `last_synced_at` when a copy is
written from canonical.

This is **user-scoped** (`GET /agencies`, `GET|PATCH /properties`), not
under `/admin` — use `@UseGuards(JwtGuard)` only, no `RolesGuard`, since any
authenticated `USER` can track agencies and manage their own properties.

## Requirements

1. **`api/src/modules/user-tracked-agencies/`**:
   - `dto/track-agency.dto.ts` — optional booleans:
     `track_new_listings`, `track_removed_listings`, `track_updated_listings`,
     `use_ai_batching`, `enabled` (PATCH only for `enabled`)
   - `GET /agencies` — public **active** `SourceAgency` list (`status:
     ACTIVE`) with `page`, `limit`, `search` query, plus each row annotated
     with `is_tracked: boolean` and the current user's tracking prefs if
     tracked (`track_new_listings`, `track_removed_listings`,
     `track_updated_listings`, `use_ai_batching`; left join against
     `UserTrackedAgency` for `@CurrentUser()`)
   - `POST /agencies/:agencyId/track` — body `{ track_new_listings?,
     track_removed_listings?, track_updated_listings?, use_ai_batching? }`
     (change-type fields optional, default `true` per schema;
     `use_ai_batching` optional, default `false`) — upsert
     `UserTrackedAgency` for `(user_id, agencyId)`, `enabled: true`
   - `PATCH /agencies/:agencyId/track` — same fields + `enabled?` +
     `use_ai_batching?` — update existing row, 404 if not tracked
   - `DELETE /agencies/:agencyId/track` — hard delete the `UserTrackedAgency`
     row, `204`
2. **`api/src/modules/user-properties/`**:
   - `GET /properties` — `UserPropertyQuerySchema` (Zod: `page`, `limit`,
     `status?`, `city?`, `price_min?`, `price_max?`, `agency_id?` — filter
     by agency requires joining `canonical_property.source_links →
     source_property.source_agency_id`) scoped to `@CurrentUser().id`
   - `GET /properties/:id` — 404 if not owned by the current user; includes
     canonical `PropertyHistory` timeline (`canonical_property.history`)
   - `PATCH /properties/:id` — `UpdateUserPropertyDto` (editable subset:
     title, description, price, features, etc. — exclude
     `is_modified`/`last_synced_at`/`property_id`/`user_id` from the DTO,
     those are server-managed) — sets `is_modified: true` on any write
   - `POST /properties/:id/resync` — overwrites all fields from
     `canonical_property`, sets `is_modified: false`, `last_synced_at: now()`
3. **Crawl-time hook** (extends Feature 06's normalization service, does
   **not** duplicate its logic): in
   `property-normalization.service.ts`, after a `Property` is created or
   updated, call a new injected `UserPropertiesService.syncForProperty(propertyId,
   sourceAgencyId): Promise<void>` that:
   - Finds all `UserTrackedAgency` rows for `sourceAgencyId` where `enabled:
     true`
   - **Batch deferral**: if Feature 06 routed this crawl's listings through
     the OpenAI Batch path (`CrawlRun.metadata.ai_batch_status === 'pending'`),
     skip `UserProperty` sync here — Feature 06's batch completion handler
     must call `UserPropertiesService.syncForProperty` after normalization
     finishes (wire that dependency when implementing Feature 06 + 07 together)
   - For a newly-created `Property`: for each tracking user (respecting
     `track_new_listings`), `prisma.userProperty.create(...)` copying
     canonical fields, `last_synced_at: now()`
   - For an updated `Property`: for each user who already has a
     `UserProperty` for it, if `is_modified: false` → overwrite from
     canonical + `last_synced_at: now()`; if `is_modified: true` → skip
     entirely (per the divergence rule)
   - For a `Property` transitioning to `REMOVED`: for each user's
     `UserProperty` respecting `track_removed_listings`, set `status:
     REMOVED` following the same `is_modified` divergence rule (skip status
     overwrite if modified — but removal is a meaningful enough event that a
     `Notification` should still fire in Feature 08 regardless of
     `is_modified`; leave a `// TODO(Feature 08)` comment noting this at the
     call site, don't build the notification itself here)
   - Requires `UserPropertiesModule` to export `UserPropertiesService`, and
     `PropertiesModule` to import `UserPropertiesModule`

## Files to create or modify

### API (`api/`)

- `api/src/modules/user-tracked-agencies/user-tracked-agencies.module.ts`
- `api/src/modules/user-tracked-agencies/user-tracked-agencies.controller.ts`
- `api/src/modules/user-tracked-agencies/user-tracked-agencies.service.ts`
- `api/src/modules/user-tracked-agencies/dto/track-agency.dto.ts`
- `api/src/modules/user-tracked-agencies/dto/agency-query.schema.ts`
- `api/src/modules/user-properties/user-properties.module.ts`
- `api/src/modules/user-properties/user-properties.controller.ts`
- `api/src/modules/user-properties/user-properties.service.ts`
- `api/src/modules/user-properties/dto/update-user-property.dto.ts`
- `api/src/modules/user-properties/dto/user-property-query.schema.ts`
- `api/src/modules/user-properties/entities/user-property.entity.ts`
- `api/src/modules/properties/properties.module.ts` (import `UserPropertiesModule`)
- `api/src/modules/properties/services/property-normalization.service.ts` (call `syncForProperty`)
- `api/src/app.module.ts` (import both new modules)

## Subtasks

- [ ] Build `user-tracked-agencies` module (track/untrack/list with `is_tracked` annotation)
- [ ] Build `user-properties` module (list/detail/update/resync, ownership-checked)
- [ ] Build `UserPropertiesService.syncForProperty` and wire it into normalization
- [ ] Verify the `is_modified` divergence rule with a manual test: edit a `UserProperty`, re-crawl, confirm it is NOT silently overwritten
- [ ] Verify `use_ai_batching`: track with `true`, crawl, confirm properties appear only after batch webhook (not immediately)

## Technical Notes

- Follow `.cursor/rules/api-code-structure-and-best-practices.mdc`
- `JwtGuard` only (no `RolesGuard`) — these are user-scoped, not admin endpoints
- Always scope queries by `@CurrentUser().id`; never trust a client-supplied user id
- Changing `use_ai_batching` on an existing track row affects **future** crawls only; it does not retroactively cancel in-flight OpenAI batches
- When explaining `use_ai_batching` in API docs/entities: batch mode applies only when **every** enabled tracker for that agency has it enabled; if any tracker opts out, the agency uses synchronous normalization for everyone

## Acceptance Criteria

- A user can track an agency, see it marked `is_tracked: true` in `GET /agencies`, and adjust per-type preferences including `use_ai_batching`
- When a tracked agency's scraper runs and surfaces a new property, a `UserProperty` automatically appears for that user
- Editing a `UserProperty` sets `is_modified: true`; a subsequent crawl update to the same canonical property does NOT overwrite the user's edits
- Calling `resync` overwrites the edits from canonical and clears `is_modified`
- `tsc --noEmit` passes in `api/`
