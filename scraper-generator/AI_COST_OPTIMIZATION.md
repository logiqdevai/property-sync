# AI Cost Optimization — Scraper Normalization

Based on `crawl/index.js`, `crawl/normalize.js`, `crawl/config.js`, and a real sample run in `output/crawl/cost.json`.

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
