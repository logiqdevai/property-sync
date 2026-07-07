# Task: Agencies API (`SourceAgency` CRUD)

## Feature group

`docs/plan/PROGRESS.md` → **Feature 02: Admin Shell & Agencies**

## Objective

Build the full CRUD API for `SourceAgency` — the root entity every later
feature (scrapers, crawl runs, properties, user tracking) hangs off of.

## Requirements

Implement the endpoints exactly as specified in
`docs/plan/directions/04-api-design.md` under "Feature 02 — Agencies". Follow
`.cursor/rules/api-code-structure-and-best-practices.mdc` for module shape.

1. `api/src/modules/agencies/agencies.module.ts` — imports `PrismaModule`
2. `dto/create-agency.dto.ts` — `class-validator`: `name` (string, required),
   `base_url` (string, `@IsUrl()`, required), `country`/`city` (optional
   strings), `notes` (optional string), `is_visible`/`is_enabled` (optional
   booleans, default `false` per schema)
3. `dto/update-agency.dto.ts` — `PartialType(CreateAgencyDto)` plus optional
   `status` (`AgencyStatus` enum)
4. `dto/agency-query.schema.ts` — Zod schema: `page` (default 1), `limit`
   (default 20, max 100), `search` (optional, matches `name` or `base_url`
   contains, case-insensitive), `status` (optional `AgencyStatus`),
   `country`/`city` (optional exact match), `is_visible`/`is_enabled`
   (optional booleans)
5. `agencies.service.ts`:
   - `findAll(query)` → paginated list ordered by `created_at desc`, using
     `Promise.all([prisma.sourceAgency.findMany(...), prisma.sourceAgency.count(...)])`
   - `findOne(id)` → throws `NotFoundException` if missing; include counts of
     related `scrapers` and `crawl_runs` via `_count`
   - `create(dto)` → throws `ConflictException` if `base_url` already exists
   - `update(id, dto)`
   - `updateStatus(id, status)` — dedicated method backing the enable/disable/archive endpoint (validate legal transitions: cannot reactivate an `ARCHIVED` agency back to anything other than `ACTIVE`... actually keep this simple, just allow any `AgencyStatus` transition for now and leave transition rules as a comment for a future task)
   - `updateVisibility(id, { is_visible, is_enabled? })` — backs
     `PATCH /admin/agencies/:id/visibility`; `@Roles('ADMIN',
     'SUPER_ADMIN')` only
   - `remove(id)` — hard delete only allowed if the agency has zero `scrapers`
     and zero `crawl_runs`; otherwise throw `ConflictException` telling the
     admin to archive instead
   - `updateTrackerCrawlInterval(agencyId, userId, crawl_interval)` — backs
     `PATCH /admin/agencies/:id/trackers/:userId`; `@Roles('ADMIN',
     'SUPER_ADMIN')` only; throws `NotFoundException` if no
     `UserTrackedAgency` row exists for the pair; validate `crawl_interval` is
     a plausible cron string (do not reinterpret as minutes)
6. `agencies.controller.ts` — `@Controller('admin/agencies')`, all routes
   `@UseGuards(JwtGuard, RolesGuard)`, `@Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')`
   except `create`/`update`/`updateStatus`/`updateVisibility`/`remove`/`updateTrackerCrawlInterval`
   which are `@Roles('ADMIN', 'SUPER_ADMIN')` only (`SUPPORT` is read-only per
   `directions/04-api-design.md`). Add Swagger decorators (`@ApiTags`,
   `@ApiOperation`, `@ApiResponse`) on every route.
7. `entities/agency.entity.ts` — Swagger response entity
8. `interfaces/agency.interface.ts` — shared TS interfaces if needed beyond
   generated Prisma types
9. Register `AgenciesModule` in `api/src/app.module.ts`

## Files to create or modify

### API (`api/`)

- `api/src/modules/agencies/agencies.module.ts`
- `api/src/modules/agencies/agencies.controller.ts`
- `api/src/modules/agencies/agencies.service.ts`
- `api/src/modules/agencies/dto/create-agency.dto.ts`
- `api/src/modules/agencies/dto/update-agency.dto.ts`
- `api/src/modules/agencies/dto/update-agency-status.dto.ts`
- `api/src/modules/agencies/dto/update-agency-visibility.dto.ts`
- `api/src/modules/agencies/dto/update-tracker-crawl-interval.dto.ts`
- `api/src/modules/agencies/dto/agency-query.schema.ts`
- `api/src/modules/agencies/entities/agency.entity.ts`
- `api/src/app.module.ts` (register module)

## Subtasks

- [ ] Scaffold module/controller/service/DTOs
- [ ] Apply the existing `ZodValidationPipe` (`api/src/shared/pipes/zod.validation.pipe.ts`)
      to the `GET /admin/agencies` query param via
      `@Query(new ZodValidationPipe(AgencyQuerySchema))`
- [ ] Implement all endpoints from `directions/04-api-design.md` (including tracker crawl-interval PATCH)
- [ ] Register module in `app.module.ts`
- [ ] Manual test every endpoint with curl/Postman using the seeded `ADMIN`
      token from Feature 01

## Technical Notes

- Follow `.cursor/rules/api-code-structure-and-best-practices.mdc`
- List response shape must be `{ data: SourceAgency[], pagination: { page, limit, total, totalPages } }`
- Do not add any scraper- or crawl-run-specific logic here — this module only
  owns `SourceAgency` itself; the detail page's "linked scrapers" panel
  (Feature 03) and "recent crawl runs" panel (Feature 05) each fetch their
  own data independently by `agencyId` from their own modules

## Acceptance Criteria

- `POST /admin/agencies` creates an agency, rejects duplicate `base_url` with `409`
- `GET /admin/agencies` returns paginated, searchable, filterable results
- `GET /admin/agencies/:id` returns one agency with `_count` of scrapers/crawl runs, `404` if missing
- `PATCH /admin/agencies/:id` updates fields
- `PATCH /admin/agencies/:id/status` transitions `status`
- `PATCH /admin/agencies/:id/visibility` updates `is_visible` / `is_enabled`
- `DELETE /admin/agencies/:id` deletes only if no dependent scrapers/crawl runs exist, else `409`
- All routes reject non-admin roles with `403`, reject unauthenticated requests with `401`
- `SUPPORT` role can `GET` but gets `403` on write routes
