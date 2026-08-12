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
