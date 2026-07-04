# Task: Migrate the database, fix the existing auth code, add `GET /users/me`

## Feature group

`docs/plan/PROGRESS.md` → **Feature 01: Platform Foundation (Database, Auth & Roles)**

## Objective

Get the API to a state where it actually runs against the real schema: apply
the first Prisma migration, regenerate the Prisma client, fix the auth code
that was written against a stale generated client (different field names),
fix the broken JWT guard, and add the missing `GET /users/me` endpoint that
the frontend already calls.

## Context — read this before touching anything

`api/prisma/schema.prisma` already defines every model needed for the whole
plan (see `docs/plan/directions/03-domain-model.md`). **No migration has ever
been run** — `api/prisma/migrations/` is empty — but a **stale** generated
Prisma client exists at `api/src/generated/prisma/` from an older, different
schema (it has `User.id Int @default(autoincrement())` + `User.uuid String`,
neither of which exist in the current schema, which has only `User.id String
@id @default(uuid())`).

The existing auth code (`api/src/modules/auth/`) was written against that
**old, stale** client:

- `services/email.service.ts` reads/writes `user.uuid` — must become `user.id`
- `entities/auth-response.entity.ts` documents a `uuid` field on `user` — must become `id`
- `strategies/jwt.strategy.ts` validates `payload.uuid` — the signed JWT
  payload itself is built in `email.service.ts` (`{ uuid: user.uuid, role:
  user.role }`) and must become `{ id: user.id, role: user.role }`, with the
  strategy validating `payload.id`

Once you run `prisma generate` (which `prisma migrate dev` does
automatically) against the **current** `schema.prisma`, the stale fields
disappear and this code will fail at runtime (property undefined) if not
fixed. Fix it as part of this task — do not skip it as "pre-existing."

Also broken, unrelated to the schema: `shared/guards/jwt.guard.ts` overrides
`getRequest`/`handleRequest` by wrapping the context in `GqlExecutionContext`
even though this API is pure REST (`GraphQLModule` is commented out in
`app.module.ts`). For an HTTP request this makes `ctx.getContext()` return
the wrong thing and the guard will throw. `shared/decorators/current-user.decorator.ts`
already handles both REST and GraphQL correctly (checks `ctx.getType()`) —
model the guard fix the same way, or simply remove the overrides so the
default Passport `AuthGuard('jwt')` behavior (which is correct for REST) is
used.

Finally, `modules/auth/controllers/email.controller.ts#registerWithEmail` has
an empty `catch {}` block that silently swallows every registration error —
fix it to rethrow/return the service result properly (see `loginWithEmail`
in the same file for the correct pattern, it has no try/catch at all because
the service already handles errors).

## Requirements

1. Update `.env` (create from `api/.env.template` if it doesn't exist yet)
   with a real local `DATABASE_URL` (Postgres) and `REDIS_URL`.
2. Run `npx prisma migrate dev --name init` from `api/` — creates
   `api/prisma/migrations/<timestamp>_init/` and regenerates the client at
   `api/src/generated/prisma/`.
3. Fix `api/src/modules/auth/services/email.service.ts`:
   - `registerWithEmail`: sign the JWT with `{ id: user.id, role: user.role }`
     instead of `{ uuid: user.uuid, role: user.role }`
   - `loginWithEmail`: same fix
   - Keep `delete user.password` before returning
4. Fix `api/src/modules/auth/entities/auth-response.entity.ts` — rename the
   documented `uuid` field to `id` in the Swagger `properties` object and the
   `user` type shape.
5. Fix `api/src/modules/auth/strategies/jwt.strategy.ts` — `validate` should
   check/return `payload.id` (rename the parameter type from `{ uuid: string
   }` to `{ id: string }`).
6. Fix `api/src/shared/guards/jwt.guard.ts` — remove the `GqlExecutionContext`
   usage; either delete the `getRequest` override entirely (let
   `AuthGuard('jwt')`'s default REST behavior run) and in `handleRequest` stop
   writing to a GraphQL context object (just return
   `super.handleRequest(err, user, info, context, status)`).
7. Fix `api/src/modules/auth/controllers/email.controller.ts` —
   `registerWithEmail`: remove the empty catch block (return
   `this.authService.registerWithEmail(dto)` directly, same style as
   `loginWithEmail`).
8. Create `api/src/modules/users/` feature module (new — does not exist yet
   despite `ApiRoutes.users.me` already existing on the frontend):
   - `users.module.ts` — imports `PrismaModule`
   - `users.controller.ts` — `@Controller('users')`, `GET /users/me`, guarded
     with `@UseGuards(JwtGuard)`, returns the current user (via
     `@CurrentUser('id')` to get the id, then `UsersService.findById`) with
     `password` stripped
   - `users.service.ts` — `findById(id: string)` using `PrismaService`,
     throws `NotFoundException` if not found
   - `entities/user.entity.ts` — Swagger entity matching the `User` model
     minus `password`
9. Register `UsersModule` in `api/src/app.module.ts`.
10. Create `api/prisma/seed.ts`:
    - Seed one `SUPER_ADMIN`, one `ADMIN`, one `SUPPORT`, one `USER` (hash
      passwords with `bcrypt`, cost 10, same as `email.service.ts`)
    - Use fixed, documented dev credentials (e.g. `admin@propertysync.dev` /
      `Password123!`) — print them to the console when the seed runs
    - Add `"prisma": { "seed": "ts-node prisma/seed.ts" }` to
      `api/package.json` if not already present (check for existing
      `ts-node`/`tsx` dependency first; add `ts-node` as a dev dependency if
      missing)
11. Run `npx prisma db seed` and confirm all four users exist.

## Files to create or modify

### API (`api/`)

- `api/.env` (created locally, not committed)
- `api/prisma/migrations/<timestamp>_init/` (generated by Prisma)
- `api/prisma/seed.ts` (new)
- `api/package.json` (add `prisma.seed` config + `ts-node` dev dep if missing)
- `api/src/modules/auth/services/email.service.ts` (fix `uuid` → `id`)
- `api/src/modules/auth/entities/auth-response.entity.ts` (fix `uuid` → `id`)
- `api/src/modules/auth/strategies/jwt.strategy.ts` (fix `payload.uuid` → `payload.id`)
- `api/src/modules/auth/controllers/email.controller.ts` (remove empty catch)
- `api/src/shared/guards/jwt.guard.ts` (remove GraphQL wrapping)
- `api/src/modules/users/users.module.ts` (new)
- `api/src/modules/users/users.controller.ts` (new)
- `api/src/modules/users/users.service.ts` (new)
- `api/src/modules/users/entities/user.entity.ts` (new)
- `api/src/app.module.ts` (register `UsersModule`)

## Subtasks

- [ ] Create `api/.env` with real `DATABASE_URL`/`REDIS_URL`
- [ ] Run `prisma migrate dev --name init`, confirm client regenerates without errors
- [ ] Fix `email.service.ts` (`uuid` → `id` in both register and login)
- [ ] Fix `auth-response.entity.ts`
- [ ] Fix `jwt.strategy.ts`
- [ ] Fix `jwt.guard.ts`
- [ ] Fix empty catch in `email.controller.ts`
- [ ] Build `UsersModule` with `GET /users/me`
- [ ] Register `UsersModule` in `app.module.ts`
- [ ] Write and run `prisma/seed.ts`
- [ ] `npm run build` (or `nest build`) in `api/` with zero errors
- [ ] Manually test with curl/Postman: register → login → call `GET /users/me` with the returned bearer token → 200 with correct user, no password field

## Technical Notes

- Follow `.cursor/rules/api-code-structure-and-best-practices.mdc` for all new/edited files
- `class-validator` DTOs are not needed for `GET /users/me` (no body/query)
- Do not add a `UsersController.findAll` admin listing endpoint here — that
  belongs to Feature 10 (`directions/04-api-design.md` Feature 10 section)
- Do not touch `modules/auth/dto/waitlist.dto.ts` or the `waitlist` flow — out of scope

## Acceptance Criteria

- `npx prisma migrate dev` runs clean against a fresh local Postgres DB
- `prisma db seed` creates 4 users with distinct roles, idempotently (safe to re-run without duplicate errors — use `upsert`)
- `POST /auth/email/register` returns `{ access_token, expires_in, user: { id, email, ... } }` with no `uuid` field and no `password` field
- `POST /auth/email/login` works for a seeded user
- `GET /users/me` with a valid bearer token returns the correct user (no password)
- `GET /users/me` with no/invalid token returns `401`
- `api/` builds and starts (`npm run start:dev`) with no runtime errors on any of the above requests
