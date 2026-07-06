# API Design — Property Sync

Conventions (from `api-code-structure-and-best-practices.mdc`): `class-validator` body DTOs, Zod query schemas + `ZodValidationPipe`, `{ data, pagination }` for all lists, `JwtGuard` on everything non-public, `RolesGuard` + `@Roles()` for admin-only endpoints, `SUPPORT` role gets `GET` only. Every endpoint below maps to a new `ApiRoutes` key in `app/src/config/api/routes.ts` — never hardcode paths.

## Feature 01 — Foundation (existing, verify only)

No new endpoints. Verify `POST /auth/email/register`, `POST /auth/email/login`, `GET /users/me` work end-to-end once the DB is migrated.

## Feature 02 — Agencies (`modules/agencies`)

`@Roles('ADMIN','SUPER_ADMIN')` unless noted. Base path `/admin/agencies`.

| Method | Path | Body/Query | Response |
| --- | --- | --- | --- |
| GET | `/admin/agencies` | `AgencyQuerySchema` (page, limit, search, status, country, city) | `{ data: SourceAgency[], pagination }` |
| GET | `/admin/agencies/:id` | — | `SourceAgency` + counts (scrapers, recent crawl runs, notifications) |
| POST | `/admin/agencies` | `CreateAgencyDto` (name, base_url, country?, city?, crawl_interval?, notes?) | `SourceAgency` |
| PATCH | `/admin/agencies/:id` | `UpdateAgencyDto` | `SourceAgency` |
| PATCH | `/admin/agencies/:id/status` | `{ status: AgencyStatus }` | `SourceAgency` |

`ApiRoutes.admin.agencies`: `{ prefix, byId(id), status(id) }`.

## Feature 03 — Scrapers (`modules/scrapers`)

Base path `/admin/scrapers`. `@Roles('ADMIN','SUPER_ADMIN')` for mutations, `SUPPORT` allowed on GETs.

| Method | Path | Body/Query | Response |
| --- | --- | --- | --- |
| GET | `/admin/scrapers` | `ScraperQuerySchema` (status, health, agency_id, search) | `{ data, pagination }` |
| GET | `/admin/scrapers/:id` | — | `Scraper` + `active_version` + health fields |
| POST | `/admin/scrapers` | `CreateScraperDto` (source_agency_id, name, initial `config` Json, `created_by: 'USER'`) | `Scraper` (creates version 1 + activates it) |
| GET | `/admin/scrapers/:id/versions` | — | `ScraperVersion[]` (ordered desc) |
| POST | `/admin/scrapers/:id/versions` | `CreateScraperVersionDto` (`config`, `notes`) | new `ScraperVersion`, `created_by: 'USER'` |
| POST | `/admin/scrapers/:id/versions/:versionId/activate` | — | `Scraper` (rollback/activate) |
| PATCH | `/admin/scrapers/:id` | `UpdateScraperDto` (`self_healing_enabled`, `validation_rules` — stored inside active version's `config` or a dedicated column if simpler; keep in `config.validation_rules` to respect "no config on Scraper" invariant) | `Scraper` |
| POST | `/admin/scrapers/:id/run-now` | — | `CrawlRun` (delegates to Feature 05 crawl-runs service) |

`ApiRoutes.admin.scrapers`: `{ prefix, byId(id), versions(id), activateVersion(id, versionId), runNow(id) }`.

## Feature 04 — AI Generation (`modules/scraper-generation`)

Base path `/admin/generation-runs`.

| Method | Path | Body/Query | Response |
| --- | --- | --- | --- |
| GET | `/admin/generation-runs` | `GenerationRunQuerySchema` (status, trigger, agency_id, scraper_id) | `{ data, pagination }` |
| GET | `/admin/generation-runs/:id` | — | run + `steps` ordered by `step_index` |
| POST | `/admin/generation-runs` | `CreateGenerationRunDto` (`source_agency_id`, `scraper_id?`, `prompt?`) — `trigger: MANUAL` | run (`status: QUEUED`, enqueues BullMQ `generation` job) |
| POST | `/admin/generation-runs/:id/approve` | — | promotes `staged_config` → new `ScraperVersion`, sets `Scraper.active_version_id`, run → `SUCCESS` |
| POST | `/admin/generation-runs/:id/reject` | `{ reason?: string }` | run → `FAILED` |
| POST | `/admin/generation-runs/:id/cancel` | — | run → `CANCELLED` (best-effort loop interruption) |

Internal-only (not HTTP): `ScraperGenerationService.trigger(agencyId, scraperId | null, trigger: 'SELF_HEAL' | 'SCHEDULED', prompt?)` — called by Feature 05's broken-scraper detection. Not an `ApiRoutes` entry; a plain injected service method.

`ApiRoutes.admin.generationRuns`: `{ prefix, byId(id), approve(id), reject(id), cancel(id) }`.

## Feature 05 — Crawl Runs & Jobs (`modules/crawl-runs`, `modules/jobs`)

| Method | Path | Body/Query | Response |
| --- | --- | --- | --- |
| GET | `/admin/crawl-runs` | `CrawlRunQuerySchema` (status, agency_id, scraper_id, date_from, date_to) | `{ data, pagination }` |
| GET | `/admin/crawl-runs/:id` | — | run + totals + `execution_traces` + `job_logs` |
| POST | `/admin/crawl-runs/:id/rerun` | — | new `CrawlRun` (same agency/scraper) |
| GET | `/admin/jobs` | `JobLogQuerySchema` (status, queue_name) | `{ data, pagination }` |
| GET | `/admin/jobs/:id` | — | `JobLog` detail |
| POST | `/admin/jobs/:id/retry` | — | re-enqueues the underlying BullMQ job |

`ApiRoutes.admin.crawlRuns`: `{ prefix, byId(id), rerun(id) }`. `ApiRoutes.admin.jobs`: `{ prefix, byId(id), retry(id) }`.

## Feature 06 — Properties (`modules/properties`)

| Method | Path | Body/Query | Response |
| --- | --- | --- | --- |
| GET | `/admin/properties` | `PropertyQuerySchema` (status, listing_type, property_type, city, price_min, price_max, duplicate_group_id, search) | `{ data, pagination }` |
| GET | `/admin/properties/:id` | — | `Property` + `source_links` (with `SourceProperty`) + `history` |
| POST | `/admin/properties/merge` | `{ property_ids: string[] }` | assigns shared `duplicate_group_id` |
| POST | `/admin/properties/:id/split` | — | clears `duplicate_group_id` on that property |

`ApiRoutes.admin.properties`: `{ prefix, byId(id), merge, split(id) }`.

## Feature 07 — User Tracking & UserProperty

`modules/user-tracked-agencies` (user-scoped, `@UseGuards(JwtGuard)` only):

| Method | Path | Body/Query | Response |
| --- | --- | --- | --- |
| GET | `/agencies` | query (status, search) — public active agencies + this user's tracking state | `{ data, pagination }` |
| POST | `/agencies/:agencyId/track` | `{ track_new_listings?, track_removed_listings?, track_updated_listings?, use_ai_batching? }` | `UserTrackedAgency` (creates if absent) |
| PATCH | `/agencies/:agencyId/track` | same fields + `enabled` + `use_ai_batching?` | `UserTrackedAgency` |
| DELETE | `/agencies/:agencyId/track` | — | `204` |

`modules/user-properties` (user-scoped):

| Method | Path | Body/Query | Response |
| --- | --- | --- | --- |
| GET | `/properties` | `UserPropertyQuerySchema` (status, city, price_min, price_max, agency_id) | `{ data, pagination }` |
| GET | `/properties/:id` | — | `UserProperty` + canonical `PropertyHistory` timeline |
| PATCH | `/properties/:id` | `UpdateUserPropertyDto` (editable fields) | `UserProperty` (`is_modified: true`) |
| POST | `/properties/:id/resync` | — | overwrites from canonical, `is_modified: false`, `last_synced_at: now()` |

`ApiRoutes.agencies`: `{ prefix, track(agencyId) }`. `ApiRoutes.userProperties`: `{ prefix, byId(id), resync(id) }`.

### OpenAI webhooks (Feature 06 batch normalization — not under `/admin`)

Public endpoint, no JWT — authenticated via OpenAI webhook signature only.

| Method | Path | Body/Query | Response |
| --- | --- | --- | --- |
| POST | `/webhooks/openai` | raw JSON body + OpenAI signature headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`) | `204` on success |

Handler must: respond `2xx` immediately; offload work to a background worker; verify with `openai.webhooks.unwrap(body, headers, { secret })` (official SDK); dedupe on `webhook-id` header; subscribe in the OpenAI dashboard to at least `batch.completed`, `batch.failed`, `batch.expired`, and `batch.cancelled`. On `batch.completed`, retrieve the batch, download `output_file_id`, and call the internal normalization completion service. Not an `ApiRoutes` entry — register the path as a literal constant in the webhook module only.

## Feature 08 — Notifications (`modules/notifications`)

| Method | Path | Body/Query | Response |
| --- | --- | --- | --- |
| GET | `/admin/notifications` | `NotificationQuerySchema` (type, severity, is_read) | `{ data, pagination }` |
| PATCH | `/admin/notifications/:id/read` | — | `Notification` |
| PATCH | `/admin/notifications/read-all` | — | `{ updated: number }` |

`ApiRoutes.admin.notifications`: `{ prefix, markRead(id), markAllRead }`.

## Feature 09 — CMS Config (`modules/cms-targets`, `modules/user-cms`)

`modules/cms-targets` (admin):

| Method | Path | Body/Query | Response |
| --- | --- | --- | --- |
| GET | `/admin/cms-targets` | query (cms_type, auth_type, is_active) | `{ data, pagination }` |
| GET | `/admin/cms-targets/:id` | — | target + connection count + `user_cms[]` (masked) |
| POST | `/admin/cms-targets` | `CreateCmsTargetDto` | `CmsTarget` |
| PATCH | `/admin/cms-targets/:id` | `UpdateCmsTargetDto` | `CmsTarget` |
| PATCH | `/admin/cms-targets/:id/status` | `{ is_active }` | `CmsTarget` |
| PATCH | `/admin/cms-targets/:id/accounts/:userCmsId` | `{ is_active? } | credential fields` | `UserCms` (admin edit/enable/disable on behalf of user) |
| POST | `/admin/cms-targets/:id/accounts` | `CreateUserCmsDto` (+ `user_id`) | `UserCms` (admin create on behalf of user, only when `allow_multiple` is false and user has none) |

`modules/user-cms` (user-scoped):

| Method | Path | Body/Query | Response |
| --- | --- | --- | --- |
| GET | `/integrations/targets` | — | active `CmsTarget[]` + this user's existing connections |
| GET | `/integrations/connections` | — | this user's `UserCms[]` (masked) |
| POST | `/integrations/connections` | `CreateUserCmsDto` (cms_target_id + credential fields per `auth_type` + `config?`) | `UserCms` |
| PATCH | `/integrations/connections/:id` | `UpdateUserCmsDto` | `UserCms` |
| PATCH | `/integrations/connections/:id/status` | `{ is_active }` | `UserCms` |
| DELETE | `/integrations/connections/:id` | — | `204` |

`ApiRoutes.admin.cmsTargets`: `{ prefix, byId(id), status(id), accounts(id), account(id, userCmsId) }`. `ApiRoutes.integrations`: `{ targets, connections, connection(id), connectionStatus(id) }`.

## Feature 10 — Dashboard & Users (`modules/dashboard`, `modules/users`)

| Method | Path | Body/Query | Response |
| --- | --- | --- | --- |
| GET | `/admin/dashboard` | — | KPI object (see spec §4.1) + `recent_activity[]` |
| GET | `/admin/users` | `UserQuerySchema` (search, role) | `{ data, pagination }` |
| GET | `/admin/users/:id` | — | user + `tracked_agencies` + `saved_properties` (with `is_modified`) + `user_cms` |

`ApiRoutes.admin.dashboard`: `{ prefix }`. `ApiRoutes.admin.users`: `{ prefix, byId(id) }`.
