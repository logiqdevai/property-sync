# Property scrape → normalisation → EstateWeb IDs

Reference for what the crawler returns, what gets written to the DB, how AI normalisation works, and how EstateWeb IDs are resolved.

---

## End-to-end flow

```
Playwright crawl
  → detail enrichment
  → upsert source_properties
  → AI normalisation (or skip if unchanged)
  → create/update properties + property_source_links + property_history
  → user_properties sync
  → optional CMS sync enqueue
```

---

## 1. Scraper return shape

`CrawlerService.runCrawl` returns a `CrawlResult`:

| Field | Type | Meaning |
| --- | --- | --- |
| `items` | `CrawlItem[]` | Scraped listings |
| `steps` | `CrawlStep[]` | Execution log |
| `success` | `boolean` | `items.length > 0` |
| `errorSummary` | `string \| null` | Failure reason |
| `networkError` | `boolean` | HTTP/network failure |
| `zeroListingsPage0` | `boolean` | No cards on first page |

Each `CrawlItem`:

```ts
{ source_url: string; raw: Record<string, unknown> }
```

### Listing-card fields

Come from `ScraperConfig.fields` (name → selector/type). Typical keys:

- `title`, `price`, `location`, `listing_type`
- `url` / `href`, `image`
- optional: `property_type`, `sqm`, `bedrooms`, `bathrooms`, …

Always added on listing cards:

- `_all_images`: `string[]` (card CSS backgrounds + `<img>` srcs)

### After detail enrichment

Same `raw` object gains:

| Key | Type | Meaning |
| --- | --- | --- |
| `_detail_text` | `string` | Description / detail body |
| `_detail_specs` | `Record<string, string>` | Label→value from tables / `dl` / feature lines |
| `_detail_features` | `string[]` | Amenity labels |
| `_external_id` | `string?` | Agency code if found |
| `_raw_html_path` | `string?` | GCS path for detail HTML |
| `_all_images` | `string[]` | Merged listing + detail images |

### Example enriched `raw`

```json
{
  "title": "Διαμέρισμα 80 τ.μ. στο Κέντρο",
  "price": "270.000 € 250.000 €",
  "location": "Κωδικός ABC123  Αθήνα",
  "listing_type": "ΠΩΛΕΙΤΑΙ",
  "url": "https://example.gr/property/12345",
  "image": "https://cdn.example/thumb.jpg",
  "_all_images": ["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"],
  "_detail_text": "Υποπεριοχή: Κολωνάκι\nΓειτονιά: Κέντρο\nΤιμή: 250.000 €\nΚωδικός ακινήτου: ABC123",
  "_detail_specs": {
    "Δωμάτια": "3",
    "Μπάνιο": "1",
    "WC": "1",
    "Εμβαδόν": "80",
    "Όροφος": "2ος",
    "Έτος κατασκευής": "1998",
    "Ενεργειακή κλάση": "Γ",
    "Θέρμανση": "Ατομική - Φυσικό αέριο"
  },
  "_detail_features": ["Ασανσέρ", "Θέση στάθμευσης", "Αποθήκη"],
  "_external_id": "ABC123",
  "_raw_html_path": "source-property-html/<agencyId>/<hash>.html"
}
```

### Key scraper files

| Role | Path |
| --- | --- |
| Listing scrape | `api/src/integrations/crawler/services/crawler.service.ts` |
| Detail enrich | `api/src/integrations/crawler/services/detail-enrichment.service.ts` |
| Field extraction | `api/src/integrations/crawler/services/field-extraction.service.ts` |
| Config types | `api/src/integrations/crawler/interfaces/scraper-config.interface.ts` |
| Hash / IDs / denorm helpers | `api/src/integrations/crawler/utils/crawler.utils.ts` |
| Crawl worker | `api/src/background/crawl.processor.ts` |

---

## 2. What gets written to the DB

Orchestrator: `api/src/background/crawl.processor.ts`.

### Crawl job order

1. `crawl_runs` — `QUEUED` → `RUNNING`
2. Crawl + detail enrichment (in memory)
3. `source_properties` — upsert per unique `source_url`
4. `scraper_execution_traces` — Playwright steps JSON
5. `crawl_runs` — `SUCCESS` / `FAILED`, scrape totals
6. `scrapers` / `source_agencies` — health timestamps on success
7. `job_logs` — crawl job result
8. Normalisation (if crawl succeeded) → property layer + optional CMS enqueue

### `source_properties` fields

| DB column | Source |
| --- | --- |
| `source_agency_id` | crawl run |
| `source_url` | `item.source_url` |
| `property_id` | last URL path segment |
| `internal_id` | `_external_id` / `_internal_id` / text patterns (`Κωδικός…`) |
| `raw_title` | `raw.title` |
| `raw_description` | `raw._detail_text` |
| `raw_price` | `raw.price` |
| `raw_location` | `raw.location` |
| `raw_property_type` | `property_type` / `type` / … |
| `raw_listing_type` | `listing_type` / `transaction_type` / … |
| `raw_sqm` | `sqm` / `square_meters` / `size` / … |
| `raw_bedrooms` | `bedrooms` / `rooms` / … |
| `raw_bathrooms` | `bathrooms` / `wc` / … |
| `raw_data` | full `raw` JSON |
| `raw_html_path` | `raw._raw_html_path` |
| `content_hash` | SHA of `{ url, title, price }` (16 hex chars) |
| `first_seen_at` / `last_seen_at` | timestamps |
| `status` | `ACTIVE` |

Unique key: `(source_agency_id, source_url)`.

### Normalisation writes

| Table | Action |
| --- | --- |
| `properties` | create or update canonical listing |
| `property_source_links` | create (new) or update `last_normalized_hash` |
| `property_history` | `CREATED`, `PRICE_CHANGED`, `IMAGE_*`, `STATUS_CHANGED`, `UPDATED`, `REMOVED`, `REAPPEARED` |
| `source_properties.internal_id` | backfill if AI/record finds one and scrape lacked it |
| `user_properties` | via `UserPropertiesService.syncForProperty` |
| `crawl_runs` | AI cost fields (`ai_model`, tokens, costs); batch metadata |

### `Property` columns set from AI + scrape

`title`, `description` (from raw, not AI), `property_id`, `internal_id`, `listing_type`, `property_type`, `status`, `price`, `price_start`, `price_web`, `currency` (`EUR`), `city`, `district`, `address`, `postal_code`, `country` (`GR`), `latitude`, `longitude`, `square_meters`, `bedrooms`, `bathrooms`, `floor`, `construction_year`, `renovation_year`, `video_url`, `distance_*`, `estateweb_type_id`, `estateweb_location_id`, `cms_fields`, `cms_metadata`, `features`, `images` (from `_all_images`, never from AI), `normalized_data` (= full `raw_data`), `duplicate_group_id`.

Prisma models: `SourceProperty`, `Property`, `PropertySourceLink`, `PropertyHistory`, `CrawlRun` in `api/prisma/schema.prisma`.

---

## 3. Normalisation pipeline

```
CrawlProcessor (SUCCESS)
  └─ PropertyNormalizationService.normalizeForCrawlRun(crawlRunId)
       1. Load CrawlRun (+ scraper, tracker)
       2. Resolve tracker (run’s UTA or earliest enabled agency tracker)
       3. Resolve AI API key (skip if none)
       4. Load SourceProperties where last_seen_at >= crawl.started_at
       5. Persist crawl metadata (user_integration_id, ai_provider, model, normalize_limit)
       6. splitUnchangedSourceProperties:
            content_hash === PropertySourceLink.last_normalized_hash
            → reuse existing Property (no AI)
       7. Apply normalize_limit (scraper.normalize_limit)
       8. Route:
            a) OpenAI + use_ai_batching → PropertyAiBatchService.submitForCrawlRun
               (webhook later → completeBatchNormalization → applyNormalizedResults)
            b) else sync:
               Anthropic → AnthropicNormalizationService
               OpenAI/Gemini → AiService.generateText in chunks of 10
       9. applyNormalizedResults (per listing):
            - buildPropertyRecord(aiRow, sourceProperty)
            - existing link? update Property + history + link hash
              else create Property + link + CREATED history
            - UserProperties sync
            - duplicate_group_id within batch + against existing
            - detect removals (not seen this crawl → REMOVED)
            - persist AI costs
            - onSync → CMS sync enqueue
```

Skip AI when: no tracker, no API key, or content unchanged.

Default model: OpenAI `gpt-4o-mini` (`AiDefaults` in `api/src/integrations/ai/utils/ai.config.ts`).

Batch size: `NORMALIZATION_BATCH_SIZE = 10`.

### Post-AI merge (`buildPropertyRecord`)

- Prefer scraped title; description kept from scrape
- Re-resolve prices if dual prices in `raw_price`
- Merge `cms_fields` from AI + specs (`mergeCmsFieldsFromNormalizedRow`)
- Resolve `estateweb_location_id` from city/district (AI usually leaves null)
- Attach images from `_all_images`

Fallback if AI fails: `buildFallbackNormalizedRow` → title + parsed price + `UNKNOWN` types.

### Key normalisation files

| Role | Path |
| --- | --- |
| Orchestrator | `api/src/modules/properties/services/property-normalization.service.ts` |
| Record build / dedup / history | `api/src/modules/properties/utils/property-normalization.utils.ts` |
| CMS field merge | `api/src/modules/properties/utils/property-cms-field-mapper.util.ts` |
| Prompt + input builder | `api/src/modules/properties/constants/normalization-prompt.ts` |
| Enums / batch size | `api/src/modules/properties/constants/normalization.constants.ts` |
| Anthropic path | `api/src/modules/properties/services/anthropic-normalization.service.ts` |
| OpenAI Batch path | `api/src/integrations/ai-batch/services/property-ai-batch.service.ts` |
| Batch complete | `api/src/background/ai-batch-complete.processor.ts` |

---

## 4. AI input and output

### System instructions

Constant `NORMALIZATION_STATIC_INSTRUCTIONS` in `normalization-prompt.ts`.

Tells the model: Greek RE site → EstateWeb-aligned schema; return **JSON array only**; enums for `listing_type` / `property_type`; EstateWeb leaf `estateweb_type_id` catalog; Greek price/location heuristics; prefer `detail_specs` over prose.

### Dynamic user prompt

```ts
buildNormalizationDynamicPrompt(input)
// → `## Input listings:\n` + JSON.stringify(input, null, 2)
```

### Message packaging

| Path | Structure |
| --- | --- |
| OpenAI sync | `system: STATIC`, `prompt: DYNAMIC` via `AiService.generateText` |
| OpenAI batch | JSONL chat/completions: system + user messages |
| Anthropic | Single user message: STATIC (ephemeral cache) + DYNAMIC |

### Input object per listing (`NormalizationInputRow`)

Built by `buildNormalizationInput` from `SourceProperty` (+ `raw_data`):

```ts
{
  index: number;
  source_url: string;
  property_id: string;
  internal_id: string | null;
  raw_title: string | null;
  raw_price: string | null;
  raw_location: string | null;
  raw_description: string | null;  // sanitized, truncated (~2000 chars default)
  raw_property_type: string | null;
  raw_listing_type: string | null;
  raw_sqm: string | null;
  raw_bedrooms: string | null;
  raw_bathrooms: string | null;
  detail_specs: Record<string, string> | null;   // from raw_data._detail_specs
  detail_features: string[] | null;              // from raw_data._detail_features
}
```

**Not sent to AI:** images, full HTML, lat/lng (extracted later from `raw_data`).

### Expected AI output (`NormalizedAiRow`)

JSON **array**, same length/order; each object:

```ts
{
  index: number;
  title: string | null;
  listing_type: 'SALE' | 'RENT' | 'SHORT_TERM_RENT' | 'UNKNOWN';
  property_type: 'APARTMENT' | 'HOUSE' | 'VILLA' | ... | 'UNKNOWN';
  price: number | null;
  price_start: number | null;
  price_web: number | null;
  city: string | null;
  district: string | null;
  address: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  square_meters: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  construction_year: number | null;
  renovation_year: number | null;
  energy_class: string | null;
  road: string | null;
  heating: string | null;
  video_url: string | null;
  distance_airport: string | null;
  distance_port: string | null;
  distance_beach: string | null;
  estateweb_type_id: number | null;
  estateweb_location_id: number | null;  // prefer null; backend resolves
  cms_fields: [{ id: number; value: string | number }] | null;
  cms_metadata: {
    guarantee, stamp, inc_type, inc_value, inc_period,
    inc_2years, contract_period, terms, has_keys
  } | null;
  features: string[] | null;
}
```

**No `description` in AI output** — description kept from scrape.

### Example AI input

```json
[
  {
    "index": 0,
    "source_url": "https://example.gr/property/12345",
    "property_id": "12345",
    "internal_id": "ABC123",
    "raw_title": "Διαμέρισμα 80 τ.μ. στο Κέντρο",
    "raw_price": "270.000 € 250.000 €",
    "raw_location": "Κωδικός ABC123  Αθήνα",
    "raw_description": "Υποπεριοχή: Κολωνάκι\nΓειτονιά: Κέντρο\nΤιμή: 250.000 €",
    "raw_property_type": null,
    "raw_listing_type": "ΠΩΛΕΙΤΑΙ",
    "raw_sqm": null,
    "raw_bedrooms": null,
    "raw_bathrooms": null,
    "detail_specs": {
      "Δωμάτια": "3",
      "Μπάνιο": "1",
      "WC": "1",
      "Εμβαδόν": "80",
      "Όροφος": "2ος",
      "Έτος κατασκευής": "1998",
      "Ενεργειακή κλάση": "Γ"
    },
    "detail_features": ["Ασανσέρ", "Θέση στάθμευσης"]
  }
]
```

### Example AI output

```json
[
  {
    "index": 0,
    "title": "Διαμέρισμα 80 τ.μ. στο Κέντρο",
    "listing_type": "SALE",
    "property_type": "APARTMENT",
    "price": 250000,
    "price_start": 270000,
    "price_web": 250000,
    "city": "Κολωνάκι",
    "district": "Κέντρο",
    "address": null,
    "postal_code": null,
    "latitude": null,
    "longitude": null,
    "square_meters": 80,
    "bedrooms": 3,
    "bathrooms": 2,
    "floor": "2ος",
    "construction_year": 1998,
    "renovation_year": null,
    "energy_class": "Γ",
    "road": null,
    "heating": null,
    "video_url": null,
    "distance_airport": null,
    "distance_port": null,
    "distance_beach": null,
    "estateweb_type_id": 1234,
    "estateweb_location_id": null,
    "cms_fields": [{ "id": 2010, "value": 42 }],
    "cms_metadata": null,
    "features": ["elevator", "parking"]
  }
]
```

### Prompt rules worth knowing

- `price` = current (lower); `price_start` = old list if discounted; `price_web` ≈ display price
- Bathrooms = Μπάνιο + WC when both present in specs
- `detail_specs` is ground truth over prose
- Title must come from `raw_title` (light clean only)
- Greek labels: `ΠΩΛΕΙΤΑΙ` → `SALE`, `ΕΝΟΙΚΙΑΖΕΤΑΙ` → `RENT`

---

## 5. How EstateWeb IDs are resolved

Source of truth: snapshot in `api/src/integrations/estateweb/constants/estateweb-init.constants.ts`

- `ESTATEWEB_INIT_FIELDS` — custom fields + select options + boolean features
- `ESTATEWEB_INIT_PROPERTY_TYPES` — hierarchical property types

Lookups use diacritic-insensitive label matching via `normalizeEstateWebLabel` in `estateweb-init-lookup.util.ts`.

**AI mostly returns human strings.** Backend maps names → EstateWeb ids. Only `estateweb_type_id` (and rare confident `cms_fields`) come as ids from AI.

### `property_type` → `estateweb_type_id`

- AI picks a **leaf** id from the catalog baked into the normalisation prompt (`buildEstateWebAiPropertyTypeCatalog`)
- Stored on `Property.estateweb_type_id`
- Internal enum (`APARTMENT`, `HOUSE`, …) is a separate app label; CMS uses the EstateWeb tree id

### `listing_type` → EstateWeb `scope_id`

Not a field option. Hard map at CMS sync via `resolveEstateWebScopeId()`:

| Our `ListingType` | EstateWeb `scope_id` |
| --- | --- |
| `SALE` | `1` (`EstateWebScope.SALE`) |
| `RENT` / `SHORT_TERM_RENT` | `2` (`EstateWebScope.RENT`) |

No fuzzy name lookup.

### Floor / energy / road → `cms_fields[{ id, value }]`

Hardcoded **field** ids; **option** id resolved by label:

| Concept | Field id | How option found |
| --- | --- | --- |
| Floor | `4187` | `"2ος"` → strip → match option `"2"` / full label |
| Energy class | `2010` | `"Γ"` → option name match |
| Road | `110` | `"Άσφαλτος"` → option name match |

Done in `mergeCmsFieldsFromNormalizedRow` via `resolveEstateWebFieldOptionByName(fieldId, label)`.

Result shape: `{ id: 4187, value: <optionId> }` (SELECT = numeric option id).

### Features / heating → boolean field ids

Features = EstateWeb fields with `type_id === BOOLEAN`.

1. AI returns strings like `"parking"`, `"elevator"` (or Greek amenity labels from scrape)
2. `applyBooleanFieldByName` → `resolveEstateWebFieldByName(name)` against init fields
3. Match → upsert `{ id: <fieldId>, value: "1" }`

Heating tokens (`"Ατομική"`, `"Φυσικό αέριο"`) are split and use the same boolean lookup.

Also from `_detail_specs` / `_detail_features`: label → field by name, then SELECT / BOOLEAN / NUMERIC coerce.

### Bedrooms / bathrooms / years

Fixed field ids + numeric string values (not option catalogs):

| Concept | Field id |
| --- | --- |
| Construction year | `1013` |
| Renovation year | `1014` |
| Bedrooms | `2007` |
| Bathrooms | `2004` |

### Location → `estateweb_location_id`

Resolved by backend (`resolveEstateWebLocationId(city, district)`), not by AI guess. Prompt tells the model to leave `estateweb_location_id` null unless a numeric id is already in raw data.

See also: `docs/ESTATEWEB-LOCATION-MAPPING.md`.

### Resolution flow

```
AI returns human strings (+ optional estateweb_type_id / cms_fields)
        ↓
mergeCmsFieldsFromNormalizedRow()
  - known fields → fixed field id + option-by-name
  - features / heating / specs → field-by-name from ESTATEWEB_INIT_FIELDS
        ↓
Property.cms_fields = [{ id, value }, ...]
Property.estateweb_type_id = leaf type
listing_type → scope_id only at CMS push
```

### Catalog APIs (same init data, for UI)

| Endpoint | Catalog |
| --- | --- |
| `/catalog/floors` | Floor options |
| `/catalog/energy-classes` | Energy class options |
| `/catalog/road-types` | Road type options |
| `/catalog/features` | Boolean feature fields |
| `/catalog/property-types` | EstateWeb type tree |
| `/catalog/listing-types` | Scope id 1/2 |
| `/catalog/locations` | Location paths |

Implemented via `estateweb-catalog.util.ts` and controllers under `api/src/modules/estateweb/`.

### Key EstateWeb ID files

| Role | Path |
| --- | --- |
| Init snapshot | `api/src/integrations/estateweb/constants/estateweb-init.constants.ts` |
| Name / option lookup | `api/src/integrations/estateweb/utils/estateweb-init-lookup.util.ts` |
| Catalog lists + scope map | `api/src/integrations/estateweb/utils/estateweb-catalog.util.ts` |
| AI type catalog for prompt | `api/src/integrations/estateweb/constants/estateweb-ai-catalog.constants.ts` |
| CMS field merge | `api/src/modules/properties/utils/property-cms-field-mapper.util.ts` |
| Location resolve | `api/src/integrations/estateweb/utils/estateweb-location-lookup.util.ts` |

---

## 6. Future expansion: AI returns EstateWeb IDs directly

### Problem today

Backend maps AI **strings** → EstateWeb ids (`resolveEstateWebFieldOptionByName`, `resolveEstateWebFieldByName`, floor heuristics, feature synonym matching). That layer is brittle:

- Greek label variants / typos / mixed EN-EL → miss or wrong option
- Features and heating tokens often fail fuzzy match → missing `cms_fields`
- Floor forms (`2ος`, `2`, `2ος όροφος`) need special-case code
- Spec label names that do not exactly match init field names are dropped

`estateweb_type_id` already works better because the **leaf type catalog (id + path)** is in the static prompt and the model returns the id.

### Proposed direction

Extend the same pattern to **fixed EstateWeb fields**: put full catalogs of `{ id, name }` (and field id where needed) into the static instructions, and ask the model to return **option/field ids** instead of (or in addition to) free-text labels.

Candidates to embed (same sources as catalog APIs / `ESTATEWEB_INIT_*`):

| Concept | What to pass AI | Desired AI output |
| --- | --- | --- |
| Property type | leaf types `{ id, path }` (already done) | `estateweb_type_id` |
| Listing / scope | `{ id: 1\|2, name }` | `estateweb_scope_id` or keep enum + backend map |
| Floor | options for field `4187` | `cms_fields` entry `{ id: 4187, value: <optionId> }` |
| Energy class | options for field `2010` | `{ id: 2010, value: <optionId> }` |
| Road type | options for field `110` | `{ id: 110, value: <optionId> }` |
| Features | boolean fields `{ id, name }` | `{ id: <featureFieldId>, value: "1" }` |
| Heating / other SELECT/BOOLEAN | relevant field + options from init | typed `cms_fields` entries |

Optional: keep human strings as debug/fallback, but **trust ids** when present and valid against the catalog. Backend then mainly **validates** ids (`getEstateWebInitFieldOption`, feature id set) instead of inventing mappings.

Do **not** dump the full location tree into every prompt by default — locations stay backend-resolved (`resolveEstateWebLocationId`) unless a compact / scoped catalog strategy is designed separately (see `docs/ESTATEWEB-LOCATION-MAPPING.md`).

### Suggested output shape change (sketch)

```json
{
  "index": 0,
  "estateweb_type_id": 1234,
  "estateweb_scope_id": 1,
  "cms_fields": [
    { "id": 4187, "value": 42 },
    { "id": 2010, "value": 15 },
    { "id": 110, "value": 3 },
    { "id": 4001, "value": "1" }
  ],
  "floor": null,
  "energy_class": null,
  "road": null,
  "features": null
}
```

Free-text fields can remain optional for audit / UI; production CMS path prefers validated ids.

### Cost check before implementing

Measure before/after on a real crawl sample (same listings, same model):

1. **Prompt tokens** — catalog JSON size added to static instructions (floors + energy + road + features can be large).
2. **Output tokens** — ids are shorter than Greek labels; often a small win.
3. **$/crawl and $/1k listings** — use existing crawl_run AI cost fields + provider usage (`input` / `output` / cache read-write if available).
4. **Accuracy tradeoff** — sample N listings: compare current mapper miss/wrong rates vs AI-returned ids validated against catalog (invalid id = treat as null + optional string fallback).
5. **Batch vs sync** — OpenAI Batch discount vs sync latency; catalog is static so batch JSONL still benefits if the static prefix is shared / cached by the provider.

Ship only if measured cost increase is acceptable relative to fewer CMS field gaps and less mapper maintenance.

### Benefit from input / prompt caching

Catalog + instructions are **stable across many listings and crawls**. Put them in the **cached / static prefix**; keep per-listing JSON in the **uncached / dynamic** part (same split as today).

| Provider | How to use caching |
| --- | --- |
| **Anthropic** | Already marks `NORMALIZATION_STATIC_INSTRUCTIONS` with `cache_control: { type: 'ephemeral' }` in `anthropic-normalization.service.ts`. Expand that static block with the new catalogs — **do not** put per-listing data there. Cache write once per TTL window; later batches pay cache-read rates (much cheaper than full input). |
| **OpenAI** | Prefer prompt caching / automatic prefix caching: keep a **byte-identical** long prefix (system + catalogs) across requests; only the trailing “Input listings” JSON changes. Avoid reshuffling catalog order or regenerating JSON with unstable key order. Check current OpenAI pricing for cached input vs uncached. |
| **OpenAI Batch** | Same stable system message in every JSONL line; still worth identical prefixes for any batch-side or prefix caching the API applies. |

Practical rules:

1. Build catalogs **once** at module load (or from constants) — deterministic JSON stringify (stable key order).
2. Keep `buildNormalizationDynamicPrompt(input)` as the only per-request variable content.
3. Prefer **larger batches** (within quality limits) so one cache-warmed static prefix amortizes over more listings.
4. Track `cache_read` / `cache_write` tokens in usage when the provider exposes them; include in crawl cost reporting so the refactor’s real $ impact is visible.
5. If catalog changes (init snapshot refresh), expect a one-time cache miss / rewrite — version the static blob or accept a cold window.

### Implementation notes (when doing the refactor)

- Extend `NORMALIZATION_STATIC_INSTRUCTIONS` (or a sibling constant built from `listEstateWeb*Catalog` helpers).
- Tighten output schema: require numeric option ids for SELECT fields; `"1"` for booleans.
- Keep `mergeCmsFieldsFromNormalizedRow` as **validator + merger** (AI ids first, then structured specs / string fallback).
- Feature-flag the new prompt path so cost/accuracy can A/B against the current mapper.
- Re-run EstateWeb create validation (`estateweb-property-validation.util.ts`) on a fixture set before rolling out.

---

## Related docs

- `docs/plan/tasks/feature-06-properties/01-properties-normalization-api.md` — original feature plan
- `docs/ESTATEWEB-LOCATION-MAPPING.md` — location id mapping
- `docs/CMS-SYNCHRONIZATION-SPECIFICATION.MD` — CMS sync payloads
- `docs/playwright-scraping-worker-architecture.md` — crawl worker
