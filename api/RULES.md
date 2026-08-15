# AI Agent Rules — NestJS API

This file defines hard-won rules for AI coding agents working in `api/`. Follow these precisely.
It starts small (grows as more incidents surface) — see `app/RULES.md` for the frontend equivalent.

---

## BullMQ / Background Jobs

### Never put a raw UUID (or any colon-free-but-otherwise-arbitrary string) after a literal `:` in a custom `jobId`

**Don't:**
```ts
const jobId = `cms-sync:${cmsSyncRunId}`;
await queue.add('cms-sync', data, { jobId });
```

**Do:**
```ts
const jobId = `cms-sync-${cmsSyncRunId}`;
await queue.add('cms-sync', data, { jobId });
```

**Why:** BullMQ's `Job.validateOptions()` (`node_modules/bullmq/dist/cjs/classes/job.js`) rejects any
custom `jobId` that contains a colon *unless* it splits into exactly 3 parts on `:` — that's a
compatibility carve-out for BullMQ's own internal repeatable-job ID format
(`name:hash:millis`), not something app code should ever intentionally produce. A jobId like
`cms-sync:<uuid>` has exactly one colon → splits into 2 parts → **always** throws
`"Custom Id cannot contain :"`, deterministically, on every call, for every value of the UUID.

This is a synchronous, client-side check — it throws before any Redis round-trip, so nothing about
"maybe it only fails sometimes" is true. If you see this exact error, the fix is always: stop using a
literal `:` as a separator in a custom jobId.

**Incident:** 2026-08-12. A commit meant to fix duplicate CMS-sync enqueues (`cms-sync-orchestrator
.service.ts`'s dedup guard) introduced `jobId = \`cms-sync:${cmsSyncRunId}\``. This silently broke CMS
sync enqueueing for *every* agency/tracker from the moment it deployed — `CmsSyncRun` rows kept getting
created successfully (pure DB write, before the failing `queue.add()` call), but sat stuck at
`PENDING` forever with two `CMS_SYNC_FAILURE` notifications per crawl reading
`"... completed but CMS enqueue failed. Custom Id cannot contain :"`. The error text looked like it
came from OpenAI or EstateWeb (neither app code nor those vendors' SDKs contain that string anywhere
in this repo) — it's actually BullMQ's own validation, surfaced verbatim through a generic
`error instanceof Error ? error.message : String(error)` catch block. Don't assume an error string
that *sounds* like a third-party API error necessarily came from that API — grep `node_modules` for
the literal string before guessing at the source.

### General jobId hygiene
- If you need a deterministic/dedupable custom jobId, use `-` or `__` as the separator (both existing
  conventions in this codebase — e.g. `` `${jobLog.id}__${userPropertyId}` `` in
  `renormalization.processor.ts`, `content-production.processor.ts`, etc.), never `:`.
- If a custom jobId isn't needed for deduplication or lookup, don't set one — let BullMQ auto-generate
  one (numeric, always safe). Only add a custom `jobId` when you specifically need
  `queue.getJob(jobId)` to find it again later.

### Never make N concurrent workers `SELECT ... FOR UPDATE` the same single job_logs row to track per-item progress

**Don't:**
```ts
await this.prisma.$transaction(async (tx) => {
  await tx.$executeRaw(Prisma.sql`SELECT id FROM job_logs WHERE id = ${logId} FOR UPDATE`);
  const log = await tx.jobLog.findUnique({ where: { id: logId } });
  const result = log.result as MyJobResult; // read the whole JSON blob
  result.items.push(item);                  // mutate it in JS
  await tx.jobLog.update({ where: { id: logId }, data: { result } }); // write it all back
});
```

**Do:** give each item its own row (`JobLogItem`, upserted independently — different entity_ids never
contend for the same row lock), then atomically re-derive the job_logs summary from a `COUNT(*)`
subquery in a single `$executeRaw` `UPDATE ... FROM (...)` statement — no `$transaction`, no
`SELECT ... FOR UPDATE`, no held-open lock window. See `geocode-coordinates.processor.ts`'s
`recordItemResult` for the pattern.

**Why:** a batch job that fans out into many BullMQ jobs sharing one `job_log_id` (any
`queue.addBulk` + `` `${jobLog.id}__${itemId}` `` jobId pattern) commonly runs with real
concurrency (e.g. `concurrency: 15`). If every worker's completion handler does
`SELECT ... FOR UPDATE` on the *same* `job_logs` row inside a Prisma interactive transaction
(default 5s timeout), workers queue up waiting for that one row's lock. Once the queue depth
exceeds what a 5-second window can drain, transactions start throwing
`"Unable to start a transaction in the given time"` / `"A commit cannot be executed on an expired
transaction"`. Worse: `process()`'s catch-block fallback write can *also* hit the same timeout,
in which case the exception escapes uncaught, BullMQ exhausts retries, and that item's result is
never written *anywhere* — `result.processed` permanently falls short of `result.total`, the
job_log's `status` can never leave `ACTIVE`/`WAITING`, and anything gating on job completion (e.g.
a modal's Close button `isDisabled={jobIsActive}`) is stuck disabled forever.

**Incident:** 2026-08-15. A 370-property `geocode-missing-coordinates` batch got stuck at
`processed: 358 / total: 370`, `status: ACTIVE` forever — the "Find missing coordinates" modal's
Close button was permanently disabled. `job_logs.result.items` was missing exactly the entities
whose *every* attempt (of 3) hit `Transaction API error: ... expired transaction` on both the
primary and fallback write. Fixed by moving per-item results into a new `job_log_items` table
(one row per `(job_log_id, entity_id)`, unique-constrained) and replacing the interactive
transaction with an idempotent atomic `UPDATE ... FROM (SELECT COUNT(*) ... FROM job_log_items ...)`
that any worker can safely re-run — a slow or failed refresh from one worker is self-healed by the
very next item's completion, so no item's result can ever be permanently lost.

**How to apply:** before adding a new `queue.addBulk` batch job whose items report back to a
shared `job_logs` row, check whether progress bookkeeping needs a per-item child table instead of
a JSON blob mutated under `SELECT ... FOR UPDATE`. `normalization-chunk.processor.ts`,
`estateweb-bulk-delete-by-codes.processor.ts`, and `estateweb-bulk-sites-by-codes.processor.ts`
use `jobLog.findUnique`/similar per-item update patterns as of this writing and haven't been
audited for the same risk — worth checking before they hit the same wall at scale.
