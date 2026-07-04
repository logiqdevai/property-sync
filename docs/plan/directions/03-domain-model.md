# Domain Model — Property Sync

`api/prisma/schema.prisma` already defines **every model needed for the in-scope current phase**. This plan makes **no schema changes**. The only outstanding action is running the **initial migration** (`api/prisma/migrations/` is currently empty) and writing a seed script (`api/prisma/seed.ts`) for local development — both handled in Feature 01.

## Entity map (which feature owns which model)

| Feature | Models owned | Notes |
| --- | --- | --- |
| 01 — Foundation | `User` | Auth already implemented against this model; verify it works once migrated. |
| 02 — Agencies | `SourceAgency` | Root of the pipeline. |
| 03 — Scraper Management | `Scraper`, `ScraperVersion` | `Scraper` holds **no config** — always read `active_version.config`. |
| 04 — AI Generation | `ScraperGenerationRun`, `ComputerUseStep`, `Document` (screenshots) | `staged_config` lives only on the run until approved into a `ScraperVersion`. |
| 05 — Crawl Engine | `CrawlRun`, `ScraperExecutionTrace`, `JobLog` | Production execution, independent of AI. |
| 06 — Properties | `SourceProperty`, `Property`, `PropertySourceLink`, `PropertyHistory` | Normalization/dedup/history layer. |
| 07 — User Tracking | `UserTrackedAgency`, `UserProperty` | Per-user copy + preferences. |
| 08 — Notifications | `Notification` | Read by dashboard unread count. |
| 09 — CMS Config | `CmsTarget`, `UserCms` | **`CmsSyncRun` is NOT used in this phase** — do not write to it. |
| 10 — Dashboard & Users | (aggregation only, no new writes) | Reads across all of the above. |

## Key invariants to respect in every task

- **Single source of truth for scraper config**: `Scraper.active_version_id` → `ScraperVersion.config`. Never add a `config` field to `Scraper`. Every config change (AI or human) is a **new** `ScraperVersion` row; never mutate an existing version's `config`.
- **`ComputerUseStep` vs `ScraperExecutionTrace`**: the former logs the AI's exploratory generation-time loop; the latter logs a production Playwright run. Do not conflate them or write one from the other's code path.
- **`PropertyHistory` is append-only.** Every detected change (create, price, image add/remove, status change, removed, reappeared) writes a new row; never update or delete existing rows. `field` is `null` for `CREATED` / `REMOVED` / `REAPPEARED`.
- **`UserProperty` divergence rule**: when a crawl updates canonical `Property` data, the matching `UserProperty` is updated from canonical **unless** `is_modified` is `true` (user has local edits) — in that case, leave the copy untouched and do not silently overwrite; only a manual re-sync action may overwrite it. Always set `last_synced_at` when a copy is written from canonical.
- **`CmsSyncRun` is out of scope.** It exists in the schema for the future sync phase only. No task in this plan creates, updates, or reads it.
- **Duplicate grouping** is a flat `Property.duplicate_group_id` string shared by all members of a group; there is no separate `DuplicateGroup` table. Merge = assign the same `duplicate_group_id` to multiple properties; split = clear/reassign it on one member.

## Enums already defined (reuse, never redeclare)

`AuthRole`, `DocumentType`, `CrawlType`, `PaginationType`, `AgencyStatus`, `ScraperStatus`, `ScraperHealth`, `CrawlRunStatus`, `GenerationRunStatus`, `GenerationTrigger`, `ComputerActionType`, `JobStatus`, `PropertyStatus`, `ListingType`, `PropertyType`, `CmsType`, `AuthType`, `CmsSyncAction` (unused this phase), `CmsSyncStatus` (unused this phase), `PropertyHistoryEventType`, `NotificationType`, `NotificationSeverity`.

Per the API rule file, always import these from `generated/prisma` — never redeclare them as TypeScript unions in DTOs/interfaces.

## Migration & seed plan (Feature 01)

1. `npx prisma migrate dev --name init` against local Postgres to create the first migration from the existing schema.
2. `api/prisma/seed.ts` — seed at minimum: one `SUPER_ADMIN` user, one `ADMIN` user, one `USER`, so every subsequent feature has data to develop against without waiting on the crawl pipeline. Extend the seed incrementally as later features land (e.g. Feature 02 adds a couple of seed `SourceAgency` rows).
3. Wire `prisma.schema`'s `generator client { output = "../src/generated/prisma" }` output — already generated once; regenerate after migration (`npx prisma generate`).
