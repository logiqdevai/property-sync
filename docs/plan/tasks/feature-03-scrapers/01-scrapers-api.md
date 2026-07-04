# Task: Scrapers & Scraper Versions API

## Feature group

`docs/plan/PROGRESS.md` → **Feature 03: Scraper Management**

## Objective

Let admins manually create and version-control scrapers per agency,
independent of the AI generation flow (Feature 04) — this is the
foundational CRUD + versioning layer that Feature 04 and Feature 05 both
build on top of.

## Context — read this before touching anything

Per `docs/plan/directions/03-domain-model.md`: `Scraper` holds **no config**
directly — the config always lives on the currently-active `ScraperVersion`
(`Scraper.active_version_id`). Never add a `config` field to `Scraper`
itself or let it drift from `active_version.config`. Every config change —
manual or AI — must create a **new** `ScraperVersion` row; versions are
immutable once created, and `version_count` on `Scraper` must be kept in
sync (increment on every new version).

`Scraper.status` includes `BROKEN` (set by Feature 05's self-heal detection
— do not let this task's endpoints set `BROKEN` manually, that's system-only)
and `health`/`success_rate`/`avg_runtime_ms`/`consecutive_failures` are all
cached rollups written by Feature 05's background job — this task's service
should never write to those fields except to leave them at their schema
defaults on creation.

`POST /admin/scrapers/:id/run-now` only needs a **stub** in this task — it
should return `501 Not Implemented` (or a clear "not yet available"
response) until Feature 05 implements the actual crawl-run dispatch. Leave a
`// TODO(Feature 05):` comment at the stub so it's easy to find and replace.

## Requirements

Implement per `docs/plan/directions/04-api-design.md` Feature 03 section.

1. `api/src/modules/scrapers/scrapers.module.ts` — imports `PrismaModule`
2. `dto/create-scraper.dto.ts` — `source_agency_id` (`@IsUUID()`), `name`
   (string), `config` (arbitrary JSON object, validate as `@IsObject()` at
   minimum — do not deep-validate the scraper config shape in this task)
3. `dto/create-scraper-version.dto.ts` — `config` (`@IsObject()`), `notes`
   (optional string)
4. `dto/update-scraper.dto.ts` — `self_healing_enabled` (optional boolean);
   `validation_rules` (optional arbitrary JSON — stored as
   `config.validation_rules` inside a **new** `ScraperVersion` cloned from
   the current active version's config with that key overwritten, since
   `Scraper` itself must never hold config — this still counts as a version
   bump)
5. `dto/scraper-query.schema.ts` — Zod: `page`, `limit`, `status`
   (`ScraperStatus`), `health` (`ScraperHealth`), `source_agency_id`
   (`@IsUUID()`... as Zod `.uuid()`), `search` (matches `name`)
6. `scrapers.service.ts`:
   - `findAll(query)` — paginated, include `source_agency` name for display
   - `findOne(id)` — include `active_version`; throw `NotFoundException`
   - `create(dto)` — in a `prisma.$transaction`: create the `Scraper`
     (`status: TESTING`), create `ScraperVersion` #1 with `created_by:
     'USER'`, set `Scraper.active_version_id` + `version_count: 1`
   - `listVersions(scraperId)` — ordered `version desc`
   - `createVersion(scraperId, dto)` — in a transaction: compute next
     `version` number (`current max + 1`), create the new `ScraperVersion`
     row (`created_by: 'USER'`), increment `Scraper.version_count` (do
     **not** auto-activate — activation is a separate explicit step)
   - `activateVersion(scraperId, versionId)` — validates the version belongs
     to the scraper, sets `Scraper.active_version_id`; if the scraper's
     `status` was `BROKEN`, reset it to `ACTIVE` (a human just fixed/rolled
     it back)
   - `update(id, dto)` — see requirement 4 above for `validation_rules`
     handling; `self_healing_enabled` is a direct field update
   - `runNow(id)` — throws `HttpException('Not implemented until crawl
     engine ships', 501)` for now
7. `scrapers.controller.ts` — `@Controller('admin/scrapers')`, `JwtGuard` +
   `RolesGuard` on all routes, `@Roles('ADMIN','SUPER_ADMIN','SUPPORT')` on
   GETs, `@Roles('ADMIN','SUPER_ADMIN')` on everything else
8. `entities/scraper.entity.ts`, `entities/scraper-version.entity.ts` —
   Swagger entities
9. Register `ScrapersModule` in `api/src/app.module.ts`

## Files to create or modify

### API (`api/`)

- `api/src/modules/scrapers/scrapers.module.ts`
- `api/src/modules/scrapers/scrapers.controller.ts`
- `api/src/modules/scrapers/scrapers.service.ts`
- `api/src/modules/scrapers/dto/create-scraper.dto.ts`
- `api/src/modules/scrapers/dto/create-scraper-version.dto.ts`
- `api/src/modules/scrapers/dto/update-scraper.dto.ts`
- `api/src/modules/scrapers/dto/scraper-query.schema.ts`
- `api/src/modules/scrapers/entities/scraper.entity.ts`
- `api/src/modules/scrapers/entities/scraper-version.entity.ts`
- `api/src/app.module.ts` (register module)

## Subtasks

- [ ] Scaffold module/controller/service/DTOs
- [ ] Implement create (scraper + version 1 in a transaction)
- [ ] Implement version list/create/activate
- [ ] Implement update (`self_healing_enabled`, `validation_rules` via new version)
- [ ] Implement `run-now` stub returning `501`
- [ ] Register module in `app.module.ts`
- [ ] Manual test full lifecycle with curl/Postman using the seeded `ADMIN` token

## Technical Notes

- Follow `.cursor/rules/api-code-structure-and-best-practices.mdc`
- Use `prisma.$transaction` for every operation that touches both `Scraper`
  and `ScraperVersion` to avoid an inconsistent `active_version_id`/`version_count`
- Do not implement any Playwright/crawl logic here — that is entirely Feature 05

## Acceptance Criteria

- `POST /admin/scrapers` creates a scraper with an active version 1
- `GET /admin/scrapers` and `GET /admin/scrapers/:id` return correct data including the active version's config
- `POST /admin/scrapers/:id/versions` creates version 2 without changing what's active
- `POST /admin/scrapers/:id/versions/:versionId/activate` switches the active version and, if the scraper was `BROKEN`, resets it to `ACTIVE`
- `PATCH /admin/scrapers/:id` toggles `self_healing_enabled` and creates a new version when `validation_rules` changes
- `POST /admin/scrapers/:id/run-now` returns `501` with a clear message
- `SUPPORT` role can read but not write; `USER`/unauthenticated get `403`/`401`
