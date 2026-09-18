# Activity Log

A server-side audit trail of every **data-changing action** taken through the app, with who did it,
where in the UI, and **before/after values** of the affected entities. Admin-only page:
`/admin/activity-log` (API: `GET /admin/activity-logs`, ADMIN + SUPER_ADMIN; not SUPPORT).

Scope is deliberately *mutations only* (POST/PUT/PATCH/DELETE, plus explicitly opted-in sensitive
GETs). Navigation, filters and clicks are not logged. Retention: kept forever (no purge job).

## How it works

```
request ──▶ JwtGuard/RolesGuard ──▶ ActivityLogInterceptor (global, APP_INTERCEPTOR)
                                      │ 1. load BEFORE snapshots   (ids from @Audited)
                                      │ 2. run the handler
                                      │ 3. load AFTER snapshots, diff, redact
                                      ▼ 4. fire-and-forget INSERT  activity_logs (+ activity_log_changes)
```

* **Every** non-GET route is logged automatically (actor, route, redacted body/query, status,
  outcome, duration, IP, client route/session). `@Audited` enriches it with a stable action name and
  before/after snapshots.
* Logging is **best-effort**: snapshot or insert failures are swallowed and warned about — they can
  never fail or slow the user's request beyond the two snapshot reads.
* Guards run before interceptors, so **401/403 rejections are not logged**. Bull Board
  (`/admin/queues`) is not a Nest route and is not logged.

### Tables (`api/prisma/schema.prisma`)

* `activity_logs` — one row per action. No FKs to users (logs outlive users); actor email/role are
  denormalized at write time.
* `activity_log_changes` — one row per affected entity: `before`, `after` (redacted snapshots) and
  `changes` = `[{ path, from, to, redacted? }]`. Bulk operations produce N rows, capped at 500
  entities per request (`snapshots_truncated` is set beyond that).

### Actor & impersonation

`request.user` comes from the JWT. Admin "login as user" tokens carry an `actor_id` claim
(`EmailAuthService.adminLoginToAccount`), so actions taken while impersonating are logged with
`actor_id` = the real admin, `effective_user_id` = the impersonated account, `is_impersonated = true`.
Tokens issued before this change lack the claim and behave as before.

### Client headers

The app's axios interceptor sends `X-Request-Id`, `X-Session-Id` (per browser tab) and
`X-Client-Route` on every request. They must stay in `allowedHeaders` in `api/src/main.ts`.

## Adding a route

Every mutating route **must** carry `@Audited(...)` or `@SkipAudit()`
(`activity-log-coverage.spec.ts` fails otherwise).

```ts
@Audited({
  action: 'user_property.update',          // lowercase dot-string, first segment = category
  entity: 'UserProperty',                  // key of ENTITY_REGISTRY
  ids: { param: 'id' },                    // or { body: 'ids' } / { query } / (req, { prisma }) => ids
  resultIds: { path: 'id' },               // optional; default { path: 'id' } — picks up created rows
})
@Patch(':id')
update(...) {}
```

* Entities addressed by a **composite key** (e.g. a user's tracked agency) use an id *resolver*
  from `entities/audit-id-resolvers.ts`. Function sources are re-run after the handler so rows the
  handler created are found.
* Work the generic snapshotting can't express (merge/split, multi-entity operations) can call
  `ActivityLogsService.recordChange(entityType, id, before, after)` from any service; it is a no-op
  outside an HTTP request.
* Machine-to-machine routes (webhooks) use `@SkipAudit()`.

## Redaction (security-critical)

1. **Snapshots** never read secret columns: `ENTITY_REGISTRY[...].omit` is applied in the Prisma
   query (`User.password`, `UserIntegration.{api_key_secret,webhook_key,password,config}`, …).
   **When adding an entity, list every credential column in `omit`.**
2. **Request bodies/queries and `recordChange` data** pass through `sanitizeForLog`: any key
   containing `password|secret|token|api_key|webhook_key|authorization|cookie|session|credential`
   becomes `[REDACTED]`; long strings and oversized documents are truncated.
3. A sensitive field that *changed* is shown as `{ path, redacted: true }` — neither value stored.
4. **Responses are never stored** (login/reveal-secrets responses contain tokens/secrets). The only
   response fields read are `job_log_id`, ids for `resultIds`, and `user.{id,email,role}` on login.

## Known limitations

* Snapshots are read outside the handler's transaction — best-effort under concurrent writes.
* Async work (BullMQ jobs) is recorded as the *request* that enqueued it, linked via `job_log_id`;
  the eventual before/after produced inside processors is not logged.
* Changes made to remote systems (e.g. EstateWeb CRM) have no local before/after; the redacted
  request body is the record.
* Raw SQL (`$executeRaw`) writes are invisible unless `recordChange` covers them.
* `X-Forwarded-For` is trusted for the IP field; treat it as informational.
