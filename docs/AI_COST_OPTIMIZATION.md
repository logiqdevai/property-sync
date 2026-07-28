# AI Cost Optimization — Scraper Normalization

Based on `crawl/index.js`, `crawl/normalize.js`, `crawl/config.js`, and a real sample run in `output/crawl/cost.json`.

> **Scope note:** everything below this line covers the standalone `scripts/scraper-generator` tool only (Claude Haiku, `normalize.js`). See [Main API cost analysis](#main-api-cost-analysis) at the bottom for the actual production pipeline in `api/` (OpenAI gpt-4o-mini, `property-normalization.service.ts`), which is a separate codebase with its own prompt, model, and — as of 2026-07-28 — a real batch-discount cost calculation already wired in.

## Where the money goes today

Sample run (27 properties, batches of 10 via `NORMALIZATION_BATCH_SIZE`):

| | per property |
|---|---|
| input tokens | 328.7 |
| output tokens | 223.9 |
| cost | $0.001448 |

**Output tokens are 77% of total cost** ($0.0302 of $0.0391), even though there are fewer of them — output is priced 5x input ($5/M vs $1/M, `claude-haiku-4-5-20251001`). Fixes that only shrink input (e.g. trimming descriptions) have limited upside; the big levers are output size, the discount API, and — above all — not re-normalizing listings that haven't changed.

Baseline for **100 sites × 100 properties = 10,000 properties/scrape**:
`10,000 × $0.001448 ≈ $14.48/scrape`.

## Note on "batch queries"

`NORMALIZATION_BATCH_SIZE = 10` in `config.js` already groups 10 properties per prompt call — that's *not* what gives a 50% discount, it just amortizes the fixed instruction overhead across more properties per call. The 50% discount comes specifically from Anthropic's **Message Batches API** (`client.messages.batches.create`), a separate async endpoint with up to 24h turnaround (usually much faster). Adopting it means refactoring `normalize.js` / `index.js` to submit a batch job and poll for results instead of awaiting synchronously.

## Additional ways to cut cost (each at 10,000 properties/scrape)

### 1. Trim the output schema (~30% output reduction)
`normalize.js` currently asks the AI to return `"currency": "EUR"` and `"country": "GR"` every time (always constant for this site — hardcode them in `buildPropertyRecord` instead), and `"images": null` (already overwritten anyway — drop it from the schema entirely). Also tighten `description` from "1–3 sentences" to "1 sentence, ≤25 words" and cap `features` to top 3.

- Output: 223.9 → ~157 tok/property
- Output cost/property: $0.0011195 → $0.0007836
- **Saves ≈ $3.5–4 per 10k-property scrape**

### 2. Prompt caching on the static instructions
The schema/enum/notes block in the prompt (~475 tokens) is identical on every call. Marking it with `cache_control`: first call pays a 1.25× write, the other 999 calls (at batch=10, 1000 calls/scrape) pay 0.1× read instead of full price.

- Fixed-block cost: $0.475 → ~$0.048 per scrape
- **Saves ≈ $0.43/scrape** — small in absolute terms since output dominates, but nearly free to add.

### 3. Trim `raw_description` truncation / raise batch size
Cut the 1200-char slice to ~600–800 chars and raise `NORMALIZATION_BATCH_SIZE` to ~20–25 (still safely under the 8192-token output cap per call).

- ~10% input reduction
- **Saves ≈ $0.3/scrape**, plus 2x fewer API calls (less latency/rate-limit risk)

### 4. Incremental normalization (the big one)
Every scrape today re-normalizes **all** listings, even ones unchanged since the last run. `content_hash` is already computed per `source_property` — diff it against the previous crawl's `source_properties.json` and only send new/changed listings to the AI. Unchanged listings just get `last_seen_at` bumped and reuse their existing `property` record.

This is what actually decouples cost from scrape frequency — see below.

## Combined effect (#1 + #2 + #3 + Batch API)

| | baseline | after changes |
|---|---|---|
| input tok/property | 328.7 | ~296 |
| output tok/property | 223.9 | ~157 |
| cost/property (no Batch API) | $0.001448 | $0.00108 (−25%) |
| cost/property (+ 50% Batch API) | $0.001448 | **$0.00052 (−64%)** |

Full 10,000-property scrape: **$14.48 → ~$5.20**, before even changing frequency behavior.

## Frequency comparison

### Before any changes
Current code re-normalizes everything every time, so cost scales linearly with scrape count:

| cadence | scrapes/mo | monthly AI cost |
|---|---|---|
| 2×/day | 60 | $868.80 |
| 1×/day | 30 | $434.40 |
| every 2 days | 15 | $217.20 |
| every 3 days | 10 | $144.80 |

### After changes
Batch API + output trim + caching, **plus** incremental normalization so only new/changed listings hit the AI. Illustrative assumption: ~5%/day of listings are new or changed, scaled to the gap length (2-day gap ≈10%, 3-day gap ≈15%). **Validate this against real `content_hash` diffs before trusting the exact numbers** — it's the one input here that isn't derived from your code/data.

| cadence | scrapes/mo | properties normalized/mo | monthly AI cost | reduction |
|---|---|---|---|---|
| 2×/day | 60 | ~24,750 | **~$12.87** | 98.5% |
| 1×/day | 30 | ~24,500 | **~$12.74** | 97.1% |
| every 2 days | 15 | ~24,000 | **~$12.48** | 94.3% |
| every 3 days | 10 | ~23,500 | **~$12.22** | 91.6% |

## Key takeaway

Once normalization is incremental, cost stops scaling with scrape frequency — it's governed by how much the underlying listings actually change per month, not how many times you check. The current linear-with-frequency cost is an artifact of re-normalizing unchanged listings, not a real constraint. That means you could scrape 2×/day (fresher data, better duplicate/removal detection) for almost the same AI cost as scraping every 3 days today.

**Next step:** measure the real churn rate by diffing `content_hash` across two real consecutive `source_properties.json` runs, then recompute the frequency table with the actual percentage instead of the 5%/day assumption.

---

## Main API cost analysis

Covers the production pipeline in `api/`, not the standalone script above. Two features measured, both using the real `o200k_base` tokenizer against the actual prompts in the codebase.

### Property normalization (`property-normalization.service.ts`)

Prompt reconstructed from `api/src/modules/properties/constants/normalization-prompt.ts` (`NORMALIZATION_STATIC_INSTRUCTIONS` + `buildNormalizationDynamicPrompt`), measured with a realistic property (title/price/location/description/specs/features) sent in a chunk of 10 — matching `NORMALIZATION_BATCH_SIZE = 10`, used by both the OpenAI and Anthropic normalization paths.

| | tokens |
|---|---|
| Static system prompt (schema + EstateWeb type catalog + rules) — sent once per 10-property chunk | 2,123 |
| Dynamic input per property (raw_title, raw_description ≤2000 chars, specs, features) | ~616 |
| **Total input per property** (system prompt amortized over the chunk) | **~828** |
| **Output per property** (normalized JSON row) | **~276** |

Cost per property / per 100 properties:

| Model | Sync (1 property) | Batch -50% (1 property) | Sync (100 properties) | Batch -50% (100 properties) |
|---|---|---|---|---|
| **gpt-4o-mini** (default, `AiDefaults.model`) | $0.00029 | $0.00015 | **$0.029** | **$0.015** |
| gpt-4o (full) | $0.0048 | $0.0024 | **$0.48** | **$0.24** |

Notes:
- The static system prompt (~2,123 tokens: full schema + EstateWeb leaf-type catalog) dominates input cost at the current chunk size of 10 — a larger `NORMALIZATION_BATCH_SIZE` would amortize it further, same lever as "Prompt caching" / "raise batch size" above, just for a different prompt.
- Unlike the standalone script, the OpenAI Batch API discount here is **real and already applied**: `calculateAiCost()` (`api/src/integrations/ai/utils/ai-cost.ts`) takes an `isBatch` flag and multiplies rates by `BATCH_DISCOUNT_MULTIPLIER = 0.5` (`ai-pricing.ts`), set to `true` when `completeBatchNormalization` (the OpenAI Batch API completion path, gated by `UserTrackedAgency.use_ai_batching`) persists costs. Sync normalization passes no flag, so it's priced at full rate.
- The Anthropic path is a real second implementation (chunked synchronous calls, not the Anthropic Message Batches API) with its own pricing table (`ANTHROPIC_MODEL_PRICING` in `normalization.constants.ts`, $1/$5 per million) and **already uses prompt caching** (`cache_control: ephemeral` on the static instructions in `anthropic-normalization.service.ts`) — first chunk of a crawl pays a 1.25x cache-write surcharge on the ~2,123-token static block, every subsequent chunk pays only 0.1x cache-read. For large crawls this caching effect matters far more than a flat batch discount would, since it collapses the repeated system-prompt cost by 90% after the first call.

### Title-variant generation (4 Greek + 2 English, example feature)

Not an implemented feature — a cost estimate for generating rewritten title variants (SEO / duplicate-content avoidance), using a real sample title: *"Πωλείται σε Μετασεισμική οικοδομή (1992) Διαμέρισμα 80τ.μ. Ανακαινισμένο πλήρως..."* (168 chars).

| | tokens |
|---|---|
| Raw Greek title alone | 112 |
| Full request (system instructions + title) — input | ~210 |
| 4 Greek variants + 2 English variants, JSON — output | ~400 |

Greek is token-heavy: ~1.5 chars/token vs. ~4 chars/token for English — expect Greek-heavy prompts to run 2-3x the token cost of an English-equivalent request.

| Model | Sync (1 title) | Batch -50% (1 title) | Sync (100 titles) | Batch -50% (100 titles) |
|---|---|---|---|---|
| **gpt-4o-mini** | $0.00027 | $0.00014 | **$0.027** | **$0.014** |
| gpt-4o (full) | $0.0045 | $0.0023 | **$0.45** | **$0.23** |

At gpt-4o-mini, negligible at scale (10k titles ≈ $2.70 sync / $1.40 batched). gpt-4o (full) is ~17x pricier — only worth it if mini-generated Greek copy reads noticeably worse.
