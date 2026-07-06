# Implementation Instructions: AI Normalization Cost Reduction

Audience: an AI coding agent implementing this directly in `scraper-generator/crawl/`. This covers 3 of the ways listed in `AI_COST_OPTIMIZATION.md`:

1. Trim the output schema (constant fields only — leave `description` and `features` generation untouched)
2. Prompt caching on the static instructions
3. Incremental normalization (skip AI calls for unchanged listings)

Relevant files: `crawl/index.js`, `crawl/normalize.js`, `crawl/config.js`, `crawl/cost.js`, `crawl/utils.js`. Read all of them fully before starting — the three tasks touch overlapping code paths (`normalizeBatch`, `buildPropertyRecord`, `normalizeWithAI`).

Do them in this order: **Task 1 → Task 2 → Task 3**. Tasks 1 and 2 both edit `normalizeBatch`'s prompt construction, so do those together before layering Task 3's filtering logic on top of `normalizeWithAI`.

---

## Task 1: Trim the output schema

**Goal:** stop paying output tokens for fields whose value is already known/constant. Do **not** shorten or constrain `description` or `features` — leave their prompt instructions exactly as they are.

In `normalize.js`, the output schema block (around lines 37–57) currently asks the model to return `currency`, `country`, `images`, and `status` on every property. All four are effectively constant in this pipeline:

- `currency`: always hardcoded to `"EUR"` in `buildPropertyRecord` today (`n.currency ?? 'EUR'`) — the model's answer is never actually needed.
- `country`: same pattern, always `"GR"`.
- `images`: the prompt already says "Always return images as null — images are populated separately by the pipeline", and `buildPropertyRecord` ignores `n.images` entirely, using `sp.raw_data.all_images` instead. The model is generating a wasted `null` for a field nobody reads.
- `status`: the prompt note says "use ACTIVE for all fresh listings" — i.e. it's not actually a modeling decision, it's a constant instruction. Confirm this is true for every code path before removing it (check whether `enrichDetailPages` or anything else ever expects a non-ACTIVE status to come out of normalization) — if confirmed, hardcode it too.

**Changes:**

1. In the prompt's output schema (the JSON shape shown to the model), delete the `currency`, `country`, `images`, and `status` lines entirely. Do not ask the model to emit them.
2. Update the enum/notes section: remove the `status: ${PROPERTY_STATUSES.join(' | ')} (...)` line from the prompt since the model no longer outputs it. Keep `LISTING_TYPES` and `PROPERTY_TYPES` enums as-is — those are real per-property decisions.
3. In `buildPropertyRecord(n, sp)` (`normalize.js` ~lines 92–123), change:
   - `currency: n.currency ?? 'EUR'` → `currency: 'EUR'`
   - `country: n.country ?? 'GR'` → `country: 'GR'`
   - `status: n.status ?? 'ACTIVE'` → `status: 'ACTIVE'`
   - `images` already doesn't read from `n` — no change needed there beyond removing it from the prompt.
4. Leave every other field (`title`, `description`, `listing_type`, `property_type`, `price`, `city`, `district`, `address`, `square_meters`, `bedrooms`, `bathrooms`, `floor`, `construction_year`, `features`) untouched — same instructions, same prompt wording, same fallback logic in `buildPropertyRecord`.

**Acceptance check:** run the pipeline against a small test batch, confirm `properties.json` still has correct `currency: "EUR"`, `country: "GR"`, `status: "ACTIVE"` values, and that `output_tokens` in `cost.json` dropped relative to a baseline run over the same input (compare `average_cost_per_property`).

---

## Task 2: Prompt caching on the static instructions

**Goal:** avoid paying full input-token price for the instructions/schema/enum block that's byte-for-byte identical on every `normalizeBatch` call.

**Before writing any code, look up current, exact numbers** — cache write/read price multipliers and the minimum cacheable prompt length per model tier change over time and differ by model. Use the `claude-api` skill (already available in this environment) to confirm, for `claude-haiku-4-5-20251001` specifically:
- the minimum token length required for a block to actually be cached (this has historically been higher for Haiku-tier models than for Sonnet/Opus — if the static block below is under that threshold, `cache_control` will silently no-op, not error),
- the current cache write and cache read price multipliers relative to base input price,
- the correct current SDK syntax for `cache_control` (block-level vs whole-message, TTL options like 5-minute vs 1-hour ephemeral caches).

Do not hardcode assumed multipliers from memory — verify them via the skill first, since getting this wrong means silently mis-costing rather than erroring.

**Changes to `normalize.js`:**

1. Split the current single template-literal `prompt` string in `normalizeBatch` into two parts:
   - `staticInstructions`: everything from `"You are normalizing raw property listings..."` through the `## Notes` section (i.e. everything except the `## Input listings:` header and the `JSON.stringify(input, null, 2)` payload). This part must be byte-identical across every call — do not interpolate anything per-batch into it (it already only references the module-level `LISTING_TYPES`/`PROPERTY_TYPES` constants, which is fine since those don't change).
   - `dynamicInput`: the `"## Input listings:\n" + JSON.stringify(input, null, 2)` part.
2. Change the `client.messages.create` call's `messages` field from a single string to content blocks:
   ```js
   messages: [{
     role: 'user',
     content: [
       { type: 'text', text: staticInstructions, cache_control: { type: 'ephemeral' } },
       { type: 'text', text: dynamicInput },
     ],
   }]
   ```
   (Confirm this exact shape against the SDK version in `package.json` via the `claude-api` skill — the `cache_control` field placement/casing must match the installed `@anthropic-ai/sdk` version.)
3. If the crawl for 10,000 properties runs long enough that a 5-minute ephemeral cache would keep expiring between batches (batch calls are sequential, not parallel — check actual wall-clock time between batches in a real run), consider the longer-TTL cache option if the SDK/API version supports it. Otherwise the default short TTL is fine as long as batches fire faster than it expires.

**Changes to `cost.js`:**

1. `addUsage(total, response)` only reads `usage.input_tokens` and `usage.output_tokens` today. Extend it to also accumulate `usage.cache_creation_input_tokens` and `usage.cache_read_input_tokens` (field names per the current SDK — confirm via the skill) into the running `usage` object (add these as new keys, defaulting to 0).
2. `buildCostReport` must price these separately using the write/read multipliers you looked up, and surface them in the output `cost.json` (e.g. add `cache_write_tokens`, `cache_read_tokens`, `cache_write_cost`, `cache_read_cost` fields) so the caching effect is visible and verifiable per run, rather than silently folded into `input_cost`.

**Acceptance check:** run the pipeline twice back-to-back (same version.json, so the static instructions are identical). On the second run's batches, `cache_read_input_tokens` should be nonzero and `cache.json`'s reported cache read cost should be meaningfully cheaper than treating those tokens as regular input. If `cache_read_input_tokens` stays 0 across every batch, the static block is very likely under the minimum cacheable length for this model — report that back rather than assuming the feature works.

---

## Task 3: Incremental normalization

**Goal:** stop re-sending unchanged listings to the AI on every crawl. This is the highest-leverage change — see `AI_COST_OPTIMIZATION.md` for why.

**Important constraint:** `OUTPUT_DIR` (`output/crawl/`) files are fully rewritten every run (`index.js` lines ~106, 165–170 etc.) with brand-new random `id`s (`crawlRunId`, `sourceAgencyId`, and every `uuid()` call for `sourceProperties`/`properties`/links/history — see lines 34–36, 85, 135, 141, 151). There is currently no persistent identity for a given listing across separate runs other than `source_url` / `external_id` / `content_hash`. This task does **not** change that ID-churn behavior — scope it strictly to skipping redundant AI calls. If a stable `property.id` across runs turns out to matter for whatever consumes this output downstream, flag that explicitly as a separate follow-up rather than silently changing ID generation as a side effect here.

**Design:**

1. Add a new persistent cache file, e.g. `path.join(ROOT_DIR, 'output', 'normalization_cache.json')` (define the path as a new constant in `config.js`, e.g. `NORMALIZATION_CACHE_PATH`). This file is **not** one of the files `index.js` already overwrites each run — it must be explicitly read at the start and merged/written at the end, never blown away wholesale.
2. Cache shape: an object keyed by `source_url`, e.g.:
   ```json
   {
     "https://example.com/listing/123": {
       "content_hash": "abc123...",
       "normalized": { "title": "...", "description": "...", "listing_type": "SALE", ... },
       "updated_at": "2026-07-06T12:00:00.000Z"
     }
   }
   ```
   `normalized` should hold exactly the fields `buildPropertyRecord` derives from the AI response (`n`) — i.e. cache the AI's raw output object per listing, not the fully-built property record, so `buildPropertyRecord` stays the single source of truth for assembling the final record (including the Task 1 hardcoded fields and the `allImages`/`sp.raw_data` merge, which must still happen fresh every run since detail-page images can change independent of `content_hash`).
   The existing `contentHash({ url, title, price })` in `index.js` (~line 97) is what defines "unchanged" here — reuse it as-is; don't invent a second hashing scheme.
3. In `index.js`, after `sourceProperties` is built (after line 106) and before calling `normalizeWithAI` (line 117):
   - Load `NORMALIZATION_CACHE_PATH` if it exists (empty object if not — first run always normalizes everything, same as today).
   - Partition `sourceProperties` into `cacheHits` (cache entry exists and `content_hash` matches) and `needsAI` (new listing, or `content_hash` changed since last cache write).
   - Call `normalizeWithAI(needsAI)` instead of `normalizeWithAI(sourceProperties)` — only the changed/new subset should ever reach `normalize.js`.
4. After normalization, reconstruct the full `normalizedFields` array (same order/length as `sourceProperties`, matching what the rest of `index.js`'s loop at lines 126–161 expects) by merging:
   - cache-hit entries → their cached `normalized` object
   - freshly-normalized entries → the new AI output
5. Update the cache after processing: for every successfully processed `sourceProperty` (hit or freshly normalized), upsert `cache[source_url] = { content_hash, normalized, updated_at: now() }`. Write the merged cache back to `NORMALIZATION_CACHE_PATH`. Do this even for cache hits so `updated_at` reflects last-seen, and so a listing that disappears from the cache file over time (if you later add pruning) reflects genuine absence, not staleness.
6. Extend `cost.json` (via `buildCostReport` in `cost.js`) with visibility into the skip: add fields like `total_source_properties`, `ai_normalized_count`, `cache_hit_count`, so it's possible to see, per run, how many properties were actually paid for vs. reused. This is the number that proves the optimization is working — `average_cost_per_property` alone will look unchanged (it's still computed over `ai_normalized_count`, not total), so the total-run cost is what should visibly drop.

**Edge cases to handle:**

- First run ever (no cache file): behaves identically to today — every property goes through AI.
- A listing's `content_hash` changes (price/title changed): treat as `needsAI`, not a cache hit — this is correct, it's a real update, not noise.
- A listing disappears from the current crawl entirely: no action needed here — this cache only concerns normalization reuse; removal detection is a separate concern already implied by `source_property.status`/`last_seen_at` elsewhere in the pipeline, don't conflate the two.
- Detail-page enrichment (`enrichDetailPages`) still runs for every item every crawl regardless of cache hits — this task only skips the AI normalization step, not the crawl/detail-page browser work. (If detail-page scraping cost/time also needs to be skipped for unchanged listings, that's out of scope here — flag it as a separate potential optimization instead of bundling it in.)

**Acceptance check:** run the pipeline twice against the same source (no real-world changes to the listings in between). The second run's `cost.json` should show `ai_normalized_count` at or near 0 (only genuinely new/changed listings) and `cache_hit_count` at or near the total, while `properties.json` still contains the same number of full, correct records as before.
