# Task: CMS targets & user integrations frontend data layer

## Feature group

`docs/plan/PROGRESS.md` → **Feature 09: CMS Targets & User Integrations (configuration only)**

## Objective

Build both the admin `cms-targets` and user-facing `user-cms` feature
modules.

## Requirements

1. Extend `app/src/config/api/routes.ts`:
   ```ts
   admin: {
     cmsTargets: {
       prefix: "/admin/cms-targets",
       list: "/admin/cms-targets",
       detail: (id: string) => `/admin/cms-targets/${id}`,
       status: (id: string) => `/admin/cms-targets/${id}/status`,
       accounts: (id: string) => `/admin/cms-targets/${id}/accounts`,
       account: (id: string, userCmsId: string) => `/admin/cms-targets/${id}/accounts/${userCmsId}`,
     },
   },
   integrations: {
     prefix: "/integrations",
     targets: "/integrations/targets",
     connections: "/integrations/connections",
     connection: (id: string) => `/integrations/connections/${id}`,
     connectionStatus: (id: string) => `/integrations/connections/${id}/status`,
   },
   ```
2. `app/src/features/cms-targets/interfaces/cms-targets.interfaces.ts` —
   `CmsTarget`, `MaskedUserCms` (credentials as masked strings/booleans, per
   the API's masking rule — **never** type a plaintext credential field on
   the read side), `CmsTargetListQuery`, `CreateCmsTargetPayload`
3. `app/src/features/cms-targets/services/cms-targets.services.ts` +
   `hooks/use-cms-targets.ts` — list/detail/create/update/status +
   admin account edit/create (toast + invalidate `['cmsTargets']`)
4. `app/src/features/user-cms/interfaces/user-cms.interfaces.ts` —
   `AvailableCmsTarget` (+ `is_connected`), `MaskedUserCmsConnection`,
   `CreateConnectionPayload` (credential fields keyed by `auth_type`)
5. `app/src/features/user-cms/services/user-cms.services.ts` +
   `hooks/use-user-cms.ts` — targets/connections list, connect, update,
   status, disconnect (toast + invalidate `['userCmsConnections']`)
6. `app/src/features/user-cms/validation-schemas/user-cms.schema.ts` — Zod
   discriminated union on `auth_type` for the connect form (different
   required fields per type per the mapping table in the API task)

## Files to create or modify

### App (`app/`)

- `app/src/config/api/routes.ts`
- `app/src/features/cms-targets/interfaces/cms-targets.interfaces.ts`
- `app/src/features/cms-targets/services/cms-targets.services.ts`
- `app/src/features/cms-targets/hooks/use-cms-targets.ts`
- `app/src/features/user-cms/interfaces/user-cms.interfaces.ts`
- `app/src/features/user-cms/services/user-cms.services.ts`
- `app/src/features/user-cms/hooks/use-user-cms.ts`
- `app/src/features/user-cms/validation-schemas/user-cms.schema.ts`

## Subtasks

- [ ] Extend `ApiRoutes` for both admin and user-facing CMS endpoints
- [ ] Build `cms-targets` (admin) feature module
- [ ] Build `user-cms` feature module including the discriminated-union connect form schema

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc`
- Never define an interface field that would hold a plaintext secret on the read path

## Acceptance Criteria

- All hooks toast + invalidate correctly
- The Zod connect-form schema requires exactly the right fields per `auth_type`
- `tsc --noEmit` passes in `app/`
