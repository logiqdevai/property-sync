# OpenAI Batch Jobs, Webhooks & Multi-User Normalization

Session notes from investigating crawl run `291a8b84-209e-4529-803e-f32a9c5a7dfd` (staging, 2026-07-25).

---

## 1. Job names: `normalization-batch` vs `batch.completed`

These are both `JobLog` rows in the admin Jobs UI. They are **not** the same kind of work.

| Job name | Queue | What it is |
|---|---|---|
| `normalization-batch` | `openai-batch` | Tracks the OpenAI Batch itself (`job_id` = OpenAI batch id). Created when we submit the batch. Starts `WAITING`, later `ACTIVE` / `COMPLETED` / `FAILED`. |
| `batch.completed` | `openai-webhook:{userIntegrationId}` | Audit log of an OpenAI webhook delivery. `job_name` = raw OpenAI event type. Written as `COMPLETED` after verify + unwrap (~0–2 ms). |

### Flow

```
crawl succeeds
  → submit OpenAI batch
  → JobLog "normalization-batch" (WAITING)
  → OpenAI runs async
  → webhook batch.completed
  → JobLog "batch.completed" (receipt)
  → enqueue BullMQ job on ai-batch-complete
  → mark normalization-batch ACTIVE
  → download output, finish normalize + UserProperty sync
  → mark normalization-batch COMPLETED
```

Relevant code:

- Submit + JobLog: `api/src/integrations/ai-batch/services/property-ai-batch.service.ts`
- Webhook handler: `api/src/modules/openai-webhooks/openai-webhooks.service.ts`
- Completion worker: `api/src/background/ai-batch-complete.processor.ts`

---

## 2. Investigated crawl timeline

Crawl JobLog: `8a36b6f9-f9e9-465a-9d6e-8b96cf5df46d`

| Time (UTC) | Event |
|---|---|
| 07:08:47 | Crawl started |
| 07:30:09 | Crawl `COMPLETED` (~21 min) |
| 07:30:12 | OpenAI batch submitted → `normalization-batch` created as `WAITING` (`source_count: 511`) |
| 07:35:15 | OpenAI webhook(s) `batch.completed` arrived (~5 min later) |
| 07:35:15 | `normalization-batch` → `ACTIVE` |
| 07:35:47 | Batch normalize applied → `normalization-batch` → `COMPLETED` (`duration_ms: 32028`) |

### Why `duration_ms` was only ~32 seconds

`duration_ms` on `normalization-batch` is measured from `markBatchJobActive` (webhook received) to finish — **not** from batch submit.

The ~5 minutes OpenAI spent while the job was `WAITING` are **not** included. OpenAI Batch can finish in minutes for medium workloads; “hours” is a worst-case / SLA window (`completion_window: "24h"`), not a guarantee of long runtime.

If the Jobs UI was opened after completion, `WAITING` may never have been visible.

---

## 3. Why two `batch.completed` JobLogs appeared

| JobLog | Integration | User | Outcome |
|---|---|---|---|
| `8216e4f8-…` | `ce2d5737-…` | `petros@logiqdev.com` | Receipt only. No crawl match → no work. ~0 ms. |
| `49f8e3fb-…` | `36861c5c-…` | `akinitakritis@gmail.com` | Matched crawl → enqueued `ai-batch-complete`. ~0 ms for the webhook log itself. |

Route shape: `POST /webhooks/openai/:userIntegrationId`

OpenAI delivers batch events to **every webhook endpoint registered on that OpenAI project/org**. Both users had active OPENAI integrations with webhook keys, so both URLs received the same batch event (different `webhook-id`s = two deliveries, not a retry).

Matching logic requires:

- `metadata.ai_batch_id === batchId`
- `metadata.user_integration_id ===` path integration id

Only the owner of the batch (stored on the crawl run metadata) continues. The other webhook is logged and ignored.

`akinitakritis@gmail.com` OpenAI integration:

- User id: `0daffa79-19a5-4277-9fff-473d890c6b6d`
- Integration id: `36861c5c-7cac-448d-b82f-217d8ac1937a`
- Active, has API key + webhook key

---

## 4. Why 511 scraped → 454 UserProperties

| Stage | Count |
|---|---|
| Crawl `total_found` / new listings | 511 |
| OpenAI batch `source_count` | 511 |
| Canonical `Property` + `PropertyHistory` CREATED | 511 |
| `UserProperty` created for the tracker | 454 |

All 511 properties were normalized and created in the shared `properties` table.

The gap is intentional filtering in `UserPropertiesService.syncForProperty`:

```ts
if (existing || !listingTypeAllowed) continue;
```

`isEstateWebListingTypeAllowed` reads the user’s EstateWeb settings. For this user:

```json
"estateweb_listing_types": ["SALE"]
```

Non-`SALE` listings (e.g. `RENT`) get a canonical `Property` but **no** `UserProperty`. That accounts for the ~57 missing rows.

---

## 5. How OpenAI integrations work after a scrape (multi-user)

### Mental model

```
Agency scrape (1 CrawlRun)
        │
        ▼
Normalize once (1 sync AI call OR 1 OpenAI batch)
  key = crawl's tracker user's OpenAI integration
  (or earliest enabled tracker if crawl has no tracker)
        │
        ▼
Canonical Property rows (shared across users)
        │
        ▼
syncForProperty → UserProperty per enabled tracker
  (per-user EstateWeb listing_types / track_* flags apply)
```

**Not** one AI batch per user.

### Whose OpenAI key pays?

From `property-normalization.service.ts`:

1. Prefer `crawlRun.user_tracked_agency`
2. Else `resolveDefaultTrackerForAgency` = earliest **enabled** tracker for that agency (`created_at ASC`)
3. `resolveActiveApiKey(tracker.user_id, OPENAI)`
4. If `tracker.use_ai_batching && provider === OPENAI` → submit batch; else sync normalize

Agency-scoped crawls often have no tracker; then the oldest enabled tracker’s key is used. That only chooses **who is billed** for AI. Canonical properties are still shared.

### If two users share the same agency

| Question | Answer |
|---|---|
| Separate AI batches per user? | **No.** One normalize / one batch. |
| Whose key? | Crawl’s `user_tracked_agency` user, else oldest enabled tracker. |
| Who gets `UserProperty` rows? | If crawl has `user_tracked_agency_id` → **only that tracker**. If null → **all** enabled trackers for the agency. |
| Per-user CMS / listing filters? | Yes (e.g. SALE-only). |

### This crawl specifically

| Piece | Value |
|---|---|
| Source agency | `43bff231-…` |
| Tracker on crawl | akinitakritis (`b22214b0-…`) |
| OpenAI key used | akinitakritis (`36861c5c-…`) |
| Batches | One |
| petros tracker | `enabled: false` → not used for AI or UserProperties |
| petros webhook | Still received OpenAI fan-out → JobLog only |

Agency trackers (oldest first):

1. `petros@logiqdev.com` — disabled, `use_ai_batching: true`
2. `akinitakritis@gmail.com` — enabled, `use_ai_batching: true`

---

## 6. Practical takeaways

1. **`batch.completed` JobLogs with ~0 duration are expected** — they are webhook receipts, not the normalize worker.
2. **Duplicate `batch.completed` rows** usually mean multiple PropertySync webhook URLs registered on the same OpenAI project. Harmless if matching is correct; clean up unused webhook endpoints in the OpenAI dashboard if noise is annoying.
3. **`normalization-batch` WAITING time ≠ `duration_ms`** — waiting for OpenAI is invisible in duration until the webhook flips the job to ACTIVE.
4. **Scraped count ≠ UserProperty count** when EstateWeb `estateweb_listing_types` (or tracker `track_*` flags) filter listings.
5. **Multi-user same agency ≠ multi-batch.** One crawl, one AI payer, then fan-out to UserProperties.

---

## 7. Key files

| Area | Path |
|---|---|
| Crawl → normalize | `api/src/background/crawl.processor.ts` |
| Normalize + batch decision | `api/src/modules/properties/services/property-normalization.service.ts` |
| Batch submit / JobLog status | `api/src/integrations/ai-batch/services/property-ai-batch.service.ts` |
| OpenAI Batch client | `api/src/integrations/ai-batch/services/ai-batch-client.service.ts` |
| Webhooks | `api/src/modules/openai-webhooks/openai-webhooks.service.ts` |
| Batch complete worker | `api/src/background/ai-batch-complete.processor.ts` |
| UserProperty fan-out + listing filter | `api/src/modules/user-properties/user-properties.service.ts` |
| Listing type allowlist | `api/src/integrations/estateweb/utils/estateweb-integration-settings.util.ts` |
| Queue names | `api/src/core/queues/queues.constants.ts` |
