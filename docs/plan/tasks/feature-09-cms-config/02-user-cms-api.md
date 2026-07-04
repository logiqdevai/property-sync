# Task: User-scoped CMS connections API

## Feature group

`docs/plan/PROGRESS.md` → **Feature 09: CMS Targets & User Integrations (configuration only)**

## Objective

Let end users browse available CMS targets and connect/manage their own
credentials.

## Context — read this before touching anything

Same hard scope boundary and credential-masking requirement as task 01 —
reuse `mask-credentials.util.ts` from `modules/cms-targets/utils/`, do not
duplicate it. `CmsSyncRun` remains completely out of scope.

## Requirements

1. **`api/src/modules/user-cms/`** — user-scoped, `@UseGuards(JwtGuard)` only:
   - `GET /integrations/targets` — active `CmsTarget[]` (`is_active: true`)
     with `is_connected: boolean` annotated for `@CurrentUser()`
   - `GET /integrations/connections` — this user's `UserCms[]` (masked)
   - `POST /integrations/connections` — `CreateUserCmsDto` (`cms_target_id`
     + credential fields per the `auth_type` mapping table from task 01 +
     `config?`); reject if the target's `allow_multiple` is `false` and the
     user already has a connection to it
   - `PATCH /integrations/connections/:id` — `UpdateUserCmsDto`; 404 if not
     owned by the current user; only overwrite provided credential fields
     (same non-destructive-write rule as task 01)
   - `PATCH /integrations/connections/:id/status` — `{ is_active: boolean }`
   - `DELETE /integrations/connections/:id` — `204`; 404 if not owned

## Files to create or modify

### API (`api/`)

- `api/src/modules/user-cms/user-cms.module.ts`
- `api/src/modules/user-cms/user-cms.controller.ts`
- `api/src/modules/user-cms/user-cms.service.ts`
- `api/src/modules/user-cms/dto/create-user-cms.dto.ts`
- `api/src/modules/user-cms/dto/update-user-cms.dto.ts`
- `api/src/modules/user-cms/entities/user-cms-connection.entity.ts`
- `api/src/modules/user-cms/user-cms.module.ts` (import `CmsTargetsModule` for the shared masking util and `CmsTarget` lookups)
- `api/src/app.module.ts` (import `UserCmsModule`)

## Subtasks

- [ ] Build target browse + own-connections list (masked)
- [ ] Build connect/edit/status/disconnect, all ownership-checked and using the shared masking util
- [ ] Confirm zero references to `CmsSyncRun`

## Technical Notes

- Follow `.cursor/rules/api-code-structure-and-best-practices.mdc`
- `JwtGuard` only — no `RolesGuard`, always scope by `@CurrentUser().id`

## Acceptance Criteria

- A user can see available CMS targets, connect with credentials matching
  the target's `auth_type`, edit/disable/disconnect their own connection
- A user cannot see or modify another user's `UserCms` row (404, not 403,
  to avoid leaking existence)
- `tsc --noEmit` passes in `api/`
