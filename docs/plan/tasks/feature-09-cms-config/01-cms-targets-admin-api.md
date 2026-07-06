# Task: Integration Targets admin API

## Feature group

`docs/plan/PROGRESS.md` → **Feature 09: Integration Targets & User Integrations (configuration only)**

## Objective

Let admins define which integration platforms (`IntegrationTarget`) users can
connect to — CMS destinations (`ESTATEWEB`) and AI providers
(`OPENAI`, `ANTHROPIC`, `GEMINI`, `DEEPSEEK`) — and manage/inspect connected
accounts (`UserIntegration`) on their behalf, with credentials always masked
in API responses.

## Context — read this before touching anything

**Hard scope boundary** (from `docs/plan/directions/01-product-spec.md` and
`03-domain-model.md`): this feature is **configuration only**.
`CmsSyncRun` must never be created, updated, or read by any code in this
task. No sync execution, no push-to-CMS logic, nothing that resembles
"syncing a property" — that is a future phase
(`docs/CMS-SYNCHRONIZATION-SPECIFICATION.MD`, reference only, do not build
against it).

`IntegrationTarget` fields (from `api/prisma/schema.prisma`):
- `integration_type` — `IntegrationType` enum
- `auth_type` — determines credential form fields
- `base_url` — optional (typically set for CMS targets, omitted for AI API-key slots)
- `allow_multiple` — whether a user may have more than one connection to this target
- `is_visible` — whether end users see this target on the Integrations page; admins always see all targets in admin CRUD regardless of this flag

`UserIntegration` credential fields are generic and don't map 1:1 to `AuthType`:
`api_key_secret`, `email`, `username`, `password`, `config` (Json, catch-all
for OAuth tokens or anything else). Map by `auth_type`:

| `auth_type` | Fields used |
| --- | --- |
| `EMAIL_PASSWORD` | `email`, `password` |
| `USERNAME_PASSWORD` | `username`, `password` |
| `BEARER_TOKEN` | `api_key_secret` (holds the bearer token) |
| `API_KEY` | `api_key_secret` |
| `OAUTH` | `config` (freeform: access/refresh token, expiry, etc.) |

**Security requirement, non-negotiable**: `password`, `api_key_secret`, and
any secret-bearing keys inside `config` must **never** be returned as
plaintext in any GET response. Mask them (e.g. return `"••••" +
value.slice(-4)` if a value exists, or a boolean `has_credentials: true`
with no value at all — pick the simpler boolean approach for `config`/OAuth
blobs since partial-masking arbitrary JSON isn't practical). Only accept
plaintext on write (POST/PATCH).

## Requirements

1. **`api/src/modules/integration-targets/`**:
   - `GET /admin/integration-targets` — `IntegrationTargetQuerySchema` (Zod: `page`,
     `limit`, `integration_type?`, `auth_type?`, `is_visible?`)
   - `GET /admin/integration-targets/:id` — target + `user_integrations_count` + `user_integrations:
     UserIntegration[]` (masked, per rule above)
   - `POST /admin/integration-targets` — `CreateIntegrationTargetDto` (`integration_type`,
     `auth_type`, `base_url?`, `allow_multiple?`, `is_visible?`)
   - `PATCH /admin/integration-targets/:id` — `UpdateIntegrationTargetDto`
   - `PATCH /admin/integration-targets/:id/visibility` — `{ is_visible: boolean }`
   - `PATCH /admin/integration-targets/:id/accounts/:userIntegrationId` — admin edit/enable/
     disable a specific user's connection on their behalf (`{ is_active?
     }` or credential fields, masked-aware: only overwrite a credential
     field if a non-empty value is actually provided in the body, never
     null out a field just because the client didn't send it)
   - `POST /admin/integration-targets/:id/accounts` — `CreateUserIntegrationDto` (+
     `user_id`) — admin creates a connection on a user's behalf; reject
     with `BadRequestException` if `allow_multiple` is `false` and the
     target user already has a `UserIntegration` for this target
   - `@Roles('ADMIN','SUPER_ADMIN')` for mutations, `SUPPORT` allowed on GETs
2. Build a shared masking utility (e.g.
   `api/src/modules/integration-targets/utils/mask-credentials.util.ts`) used by
   both this module's `UserIntegration` serialization and Feature 09 task 02's
   user-scoped module — do not duplicate the masking logic.

## Files to create or modify

### API (`api/`)

- `api/src/modules/integration-targets/integration-targets.module.ts`
- `api/src/modules/integration-targets/integration-targets.controller.ts`
- `api/src/modules/integration-targets/integration-targets.service.ts`
- `api/src/modules/integration-targets/dto/create-integration-target.dto.ts`
- `api/src/modules/integration-targets/dto/update-integration-target.dto.ts`
- `api/src/modules/integration-targets/dto/integration-target-query.schema.ts`
- `api/src/modules/integration-targets/dto/create-user-integration.dto.ts`
- `api/src/modules/integration-targets/dto/update-user-integration-account.dto.ts`
- `api/src/modules/integration-targets/entities/integration-target.entity.ts`
- `api/src/modules/integration-targets/entities/user-integration.entity.ts`
- `api/src/modules/integration-targets/utils/mask-credentials.util.ts`
- `api/src/app.module.ts` (import `IntegrationTargetsModule`)

## Subtasks

- [ ] Build the masking utility first (shared by both this task and task 02)
- [ ] Build `IntegrationTarget` CRUD + visibility toggle
- [ ] Build admin-on-behalf-of-user `UserIntegration` create/edit endpoints, always masked in responses
- [ ] Confirm zero references to `CmsSyncRun` anywhere in this module

## Technical Notes

- Follow `.cursor/rules/api-code-structure-and-best-practices.mdc`
- `{ data, pagination }` for list endpoints
- Admin list/detail endpoints return all targets; do not filter by `is_visible` for admin callers

## Acceptance Criteria

- An admin can create an `IntegrationTarget`, see connected accounts with masked
  credentials, edit/enable/disable one on a user's behalf
- Attempting to create a second connection for a user when `allow_multiple`
  is `false` returns a clear `400`
- No credential value is ever returned in plaintext from any GET endpoint
- `tsc --noEmit` passes in `api/`
