# Task: Integration targets & user integrations frontend data layer

## Feature group

`docs/plan/PROGRESS.md` → **Feature 09: Integration Targets & User Integrations (configuration only)**

## Objective

Build both the admin `integration-targets` and user-facing `user-integrations` feature
modules.

## Requirements

1. Extend `app/src/config/api/routes.ts`:
   ```ts
   admin: {
     integrationTargets: {
       prefix: "/admin/integration-targets",
       list: "/admin/integration-targets",
       detail: (id: string) => `/admin/integration-targets/${id}`,
       visibility: (id: string) => `/admin/integration-targets/${id}/visibility`,
       accounts: (id: string) => `/admin/integration-targets/${id}/accounts`,
       account: (id: string, userIntegrationId: string) => `/admin/integration-targets/${id}/accounts/${userIntegrationId}`,
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
2. `app/src/features/integration-targets/interfaces/integration-targets.interfaces.ts` —
   `IntegrationTarget`, `MaskedUserIntegration` (credentials as masked strings/booleans, per
   the API's masking rule — **never** type a plaintext credential field on
   the read side), `IntegrationTargetListQuery`, `CreateIntegrationTargetPayload`
3. `app/src/features/integration-targets/services/integration-targets.services.ts` +
   `hooks/use-integration-targets.ts` — list/detail/create/update/visibility +
   admin account edit/create (toast + invalidate `['integrationTargets']`)
4. `app/src/features/user-integrations/interfaces/user-integrations.interfaces.ts` —
   `AvailableIntegrationTarget` (+ `is_connected`), `MaskedUserIntegrationConnection`,
   `CreateConnectionPayload` (credential fields keyed by `auth_type`)
5. `app/src/features/user-integrations/services/user-integrations.services.ts` +
   `hooks/use-user-integrations.ts` — targets/connections list, connect, update,
   status, disconnect (toast + invalidate `['userIntegrationsConnections']`)
6. `app/src/features/user-integrations/validation-schemas/user-integrations.schema.ts` — Zod
   discriminated union on `auth_type` for the connect form (different
   required fields per type per the mapping table in the API task)

## Files to create or modify

### App (`app/`)

- `app/src/config/api/routes.ts`
- `app/src/features/integration-targets/interfaces/integration-targets.interfaces.ts`
- `app/src/features/integration-targets/services/integration-targets.services.ts`
- `app/src/features/integration-targets/hooks/use-integration-targets.ts`
- `app/src/features/user-integrations/interfaces/user-integrations.interfaces.ts`
- `app/src/features/user-integrations/services/user-integrations.services.ts`
- `app/src/features/user-integrations/hooks/use-user-integrations.ts`
- `app/src/features/user-integrations/validation-schemas/user-integrations.schema.ts`

## Subtasks

- [ ] Extend `ApiRoutes` for both admin and user-facing integration endpoints
- [ ] Build `integration-targets` (admin) feature module
- [ ] Build `user-integrations` feature module including the discriminated-union connect form schema

## Technical Notes

- Follow `.cursor/rules/app-code-structure-and-best-practices.mdc`
- Never define an interface field that would hold a plaintext secret on the read path
- Pages built in task 04 must reuse `app/src/components/ui/` primitives and HeroUI `Skeleton` loading layouts (no loading text labels) — see task 04 for the component inventory checklist

## Acceptance Criteria

- All hooks toast + invalidate correctly
- The Zod connect-form schema requires exactly the right fields per `auth_type`
- `tsc --noEmit` passes in `app/`
