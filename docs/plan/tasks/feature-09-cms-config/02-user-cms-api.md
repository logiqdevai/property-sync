# Task: User-scoped integration connections API

## Feature group

`docs/plan/PROGRESS.md` → **Feature 09: Integration Targets & User Integrations (configuration only)**

## Objective

Let end users browse available integration targets and connect/manage their own
credentials.

## Context — read this before touching anything

Same hard scope boundary and credential-masking requirement as task 01 —
reuse `mask-credentials.util.ts` from `modules/integration-targets/utils/`, do not
duplicate it. `UserIntegrationsService` credential resolver from task 01 is
consumed by Features 04/06. `CmsSyncRun` remains completely out of scope.

User-facing target browse must filter to `IntegrationTarget.is_visible: true` only.

## Requirements

1. **`api/src/modules/user-integrations/`** — user-scoped, `@UseGuards(JwtGuard)` only:
   - `GET /integrations/targets` — visible `IntegrationTarget[]` (`is_visible: true`)
     with `is_connected: boolean` annotated for `@CurrentUser()`
   - `GET /integrations/connections` — this user's `UserIntegration[]` (masked)
   - `POST /integrations/connections` — `CreateUserIntegrationDto` (`integration_target_id`
     + credential fields per the `auth_type` mapping table from task 01 +
     `config?`); reject if the target's `allow_multiple` is `false` and the
     user already has a connection to it; reject if target `is_visible` is `false`
   - `PATCH /integrations/connections/:id` — `UpdateUserIntegrationDto`; 404 if not
     owned by the current user; only overwrite provided credential fields
     (same non-destructive-write rule as task 01)
   - `PATCH /integrations/connections/:id/status` — `{ is_active: boolean }`
   - `DELETE /integrations/connections/:id` — `204`; 404 if not owned

## Files to create or modify

### API (`api/`)

- `api/src/modules/user-integrations/user-integrations.module.ts`
- `api/src/modules/user-integrations/user-integrations.controller.ts`
- `api/src/modules/user-integrations/user-integrations.service.ts`
- `api/src/modules/user-integrations/dto/create-user-integration.dto.ts`
- `api/src/modules/user-integrations/dto/update-user-integration.dto.ts`
- `api/src/modules/user-integrations/entities/user-integration-connection.entity.ts`
- `api/src/modules/user-integrations/user-integrations.module.ts` (import `IntegrationTargetsModule` for the shared masking util and `IntegrationTarget` lookups)
- `api/src/app.module.ts` (import `UserIntegrationsModule`)

## Subtasks

- [ ] Build target browse + own-connections list (masked)
- [ ] Build connect/edit/status/disconnect, all ownership-checked and using the shared masking util
- [ ] Confirm zero references to `CmsSyncRun`

## Technical Notes

- Follow `.cursor/rules/api-code-structure-and-best-practices.mdc`
- `JwtGuard` only — no `RolesGuard`, always scope by `@CurrentUser().id`

## Acceptance Criteria

- A user can see available visible integration targets, connect with credentials matching
  the target's `auth_type`, edit/disable/disconnect their own connection
- A user cannot see or modify another user's `UserIntegration` row (404, not 403,
  to avoid leaking existence)
- `tsc --noEmit` passes in `api/`
