# EstateWeb Location Mapping — Handoff

**Date:** 2026-07-19 (handoff written) · **Implemented:** 2026-08-30 · **Accuracy fixes:** 2026-08-31  
**Status:** ✅ Implemented, then hardened — deterministic matcher + Google-geocoding scoping + async self-healing on re-crawl, with manual override UI  
**Related:** CMS sync push fails when `estateweb_location_id` is null

---

## Implementation summary (2026-08-30)

Everything under "Proposed solution" below was built as described. Kept for historical context; the "Blocked" framing further down no longer applies.

- **Catalog**: `api/src/integrations/estateweb/constants/estateweb-locations.data.json` (full internal location tree: `id`, `parent_id`, `name`, `level`, `path`, `is_city`), loaded via `estateweb-locations.constants.ts` into `ESTATEWEB_LOCATIONS`.
- **Resolver**: `api/src/integrations/estateweb/utils/estateweb-location-lookup.util.ts` — normalizes Greek text (diacritics/case, abbreviations like `Αγ.`↔`Άγιος`, genitive stripping), applies a `CITY_ALIASES` map (incl. Latin→Greek transliteration, e.g. `heraklion`→`ηρακλειο`), matches against the catalog, then disambiguates homonyms via ancestor/path hierarchy and region hints from title/description, preferring the most specific match and falling back to the broader region node instead of returning null. Entry points: `resolveEstateWebLocation(city, district, hints)`, `resolveEstateWebLocationFromSources({city, district, rawLocation, title, description})`. Tests: `estateweb-location-lookup.util.spec.ts`.
- **Wired into normalization**: `api/src/modules/properties/utils/property-normalization.utils.ts` calls `resolveEstateWebLocationFromSources` and persists the result as `estateweb_location_id` on `Property` / `UserProperty` (an AI-supplied id, if already present, is respected).
- **Push validation unchanged**: `estateweb-cms-sync-adapter.service.ts` still asserts the field is present before pushing.
- **Manual override UI**: `app/src/pages/dashboard/properties/components/estateweb-location-picker-modal.tsx` lets a user browse/search the same catalog and override the auto-resolved id when the matcher gets it wrong.

---

## Accuracy follow-up session (2026-08-31)

The deterministic matcher above shipped with several real accuracy bugs — it resolved
plausible-looking but wrong ids for properties across many agencies (homonym Greek place
names scoped to the wrong region). This section is the full root-cause writeup, the
Google-geocoding-based fix, and a re-crawl regression bug found while verifying it — read
this if you're debugging a wrong `estateweb_location_id` again. Diagnostic recipes near
the end are reusable if the same class of bug resurfaces.

### The problem, in one example

`user_properties.id = 69912719-e055-4102-b68a-614f5b1143e2` — a listing in **Νέο Ψυχικό, Αγία Σοφία** (a real, specific neighborhood in Athens' northern suburbs) had `estateweb_location_id = 114915`, which is EstateWeb's catalog node for **Αγία Σοφία, Thessaloniki** — a completely different, unrelated place ~500km away that happens to share the same neighborhood name.

The EstateWeb location catalog (~14,379 nodes) has **11 different "Αγία Σοφία" nodes nationwide** (Athens, Thessaloniki, Larissa, Piraeus, Corinthia, Laconia, Messenia, Lesvos, Evia, Aitoloakarnania, Magnesia). This is systemic — any Greek place name that repeats across multiple regions is a landmine, and it affected properties across many agencies, not just one.

### Root cause #1 — the original resolver had no region-scoping ground truth

The resolver has a `preferredPathSegments` scoping mechanism, but it was only ever fed by weak regex hints (`REGION_PATH_HINTS`, hardcoded for Crete) inferred from title/description text.

When the scraped `city` string doesn't exactly match a catalog node or alias (e.g. `"Νέο Ψυχικό"` isn't in the catalog — only plain `"Ψυχικό"` is), the resolver **silently drops the city/region constraint** and falls back to `pickMostSpecific()`, which just picks whichever same-named node happens to sit **deepest in the catalog tree**. Catalog depth is an accident of how each region's admin hierarchy happens to be modeled — it has zero relationship to geographic proximity. That's how Thessaloniki (nested one level deeper: city → neighborhood) won over Athens (nested one level shallower: municipality → neighborhood) for this property.

**Fix — feed real Google geocoding data as a scoping hint.** Added `googleAddressSegments?: string[] | null` to `resolveEstateWebLocationFromSources()` (validated live against the real API — see "Diagnostic recipes"). Google's admin hierarchy for a Greek address/coordinate reliably contains names that literally match catalog `path` segments (region, prefecture, sometimes municipality, locality, neighborhood). These are prepended into the existing `preferredPathSegments` array — no other resolver logic changed; `filterByPreferredPath()` already progressively narrows by segment and skips any segment that would empty the candidate set, so this combines safely with the existing regex hints.

New pipeline (mirrors the existing `geocode-missing-coordinates` job pattern):
- `GoogleMapsService.reverseGeocode(lat, lng)` / `.geocodeAddressDetailed(address)` — `api/src/shared/services/google-maps/google-maps.service.ts`
- New queue `resolve-estateweb-location` (`RESOLVE_ESTATEWEB_LOCATION_QUEUE`), processor `api/src/background/resolve-estateweb-location.processor.ts`, job service `api/src/modules/user-properties/services/resolve-estateweb-location-job.service.ts`
- Runs **automatically** after every new `Property`/`UserProperty` creation, and is also **admin-triggered** on demand (see below)
- Lat/lng backfill deliberately out of scope — reads coordinates when already present, discards any lat/lng Google returns otherwise; only the address components are used

### Root cause #2 — the extraction regex only worked for Athens

First implementation only looked for an `address_components` entry whose `long_name` matched `/^Δήμος\s/` ("Δήμος" = municipality). **This pattern is Attica-specific.** For Thessaloniki, Crete, Halkidiki, etc., Google returns bare names (e.g. `"Θεσσαλονίκη"`, `"Χανιά"`) with no `"Δήμος"` word anywhere. Verified live:

```
Reverse-geocode 40.5711324,22.9626263 (Καλαμαριά, Θεσσαλονίκη) →
  administrative_area_level_3 = "Θεσσαλονίκη"   (no "Δήμος" anywhere)
```

**Fix — collect every admin/locality name, not just "Δήμος"-prefixed ones.** `GoogleMapsService` now walks a priority-ordered list of component types (`administrative_area_level_1`..`7`, `locality`, `sublocality*`, `neighborhood`) and returns them all as `adminSegments: string[]`, broad-to-specific. Google's bare `"Θεσσαλονίκη"` still matches the catalog's prefecture path segment directly (catalog paths are literally `"Μακεδονία » Θεσσαλονίκη » Δήμος Καλαμαριάς » Αρετσού"` — the prefecture segment matches even with no "Δήμος" word anywhere in the response), so this is sufficient scoping without needing the municipality specifically.

### Root cause #3 — the job hard-gated resolution on finding a hint

If Google didn't return a "Δήμος"-prefixed string (i.e. almost always, per bug #2), the job **skipped the property entirely** — never even attempted the resolver's own city/district matching, which had a real chance of being correct on its own. Combined with bug #2, **3,156 of 3,176 properties (99%) came back `skipped`** on the first production backfill run.

**Fix — never gate; the resolver always runs.** `resolveGoogleAddressSegments()` returns `[]` (not an error) when Google has nothing usable (`ZERO_RESULTS`, or no admin components at all). The resolver always runs afterward, with or without hints. `skipped` is now reserved for the (much rarer) case where the resolver truly can't find anything even with hints. Only a real Google API error (bad key, quota, network) fails the item.

### Root cause #4 — reverse geocoding spreads the hierarchy across separate `results[]` entries

Even for the Athens case that bug #1's fix was validated against, the code only read `data.results[0].address_components`. Google's **reverse** geocoding API returns up to ~17 separate top-level `results[]` entries for one lat/lng — one per distinct geographic feature containing that point (street address, postal code area, locality, each `administrative_area_level_N`, country, ...) — each with its **own, minimal** `address_components`. For the original bug property, `"Δήμος Φιλοθέης-Ψυχικού"` only appeared in `results[12]`, never in `results[0]` (the precise street-address result).

**Fix — merge components across all result entries:**
```ts
const components = results.flatMap((r) => r.address_components ?? []);
```
`lat`/`lng`/`formattedAddress` still come from `results[0]` (the most precise geometry); the admin/locality segment collection now scans every result entry.

### Root cause #5 — job progress numbers were misleading

The job result only reported a combined `resolved` count that actually meant "processed without error" (lumping together genuinely-changed, already-correct, and skipped items) plus `failed`. A user running the backfill saw *"3163 resolved, 13 failed"* and reasonably assumed 3163 properties got fixed — the real breakdown (via `job_log_items.status`) was **4 resolved, 3 unchanged, 3156 skipped, 13 failed** (this was root cause #2/#3 in action).

**Fix — report real breakdown.** `ResolveEstateWebLocationJobResult` now has separate `resolved` / `unchanged` / `skipped` / `failed` counts, computed via SQL `COUNT(*) FILTER (WHERE status = ...)` per status in `resolve-estateweb-location.processor.ts`. The modal UI shows all four.

### Root cause #6 — `OVER_QUERY_LIMIT` from Google during bulk runs

Not the monthly free-tier cap (10k/month — nowhere near exceeded). `OVER_QUERY_LIMIT` is a **per-second throughput throttle**. The worker ran at `concurrency: 15` with **no rate limiting**, so a multi-thousand-item backfill just hammered Google as fast as BullMQ would allow. Per-item retry (3 attempts, exponential backoff) didn't help: it only delays *that job's* own next attempt while the other ~14 concurrent slots keep hammering at the same aggregate rate, so a sustained throttle condition fails most retries identically.

**Fix — worker-level rate limiter.** Added BullMQ's `limiter: { max: 8, duration: 1000 }` to `@Processor(...)` on **both** `ResolveEstateWebLocationProcessor` and the pre-existing `GeocodeCoordinatesProcessor` (same architecture, same exposure, even though it hadn't been reported failing yet).

### Root cause #7 — re-crawls could silently regress an already-fixed id

Investigated in response to: *"since I already fixed everything via the admin bulk action, will I have problems in the future?"* — traced whether the canonical `Property.estateweb_location_id` is ever read for anything besides seeding a new `UserProperty` at creation.

**Finding: it's read on every re-crawl, not just at creation**, and this is load-bearing, not dead weight:
- `mapFromCanonical()` (`api/src/modules/user-properties/user-properties.service.ts`) copies `Property.estateweb_location_id` into `UserProperty` on **every** sync, not just `'created'`.
- The `'updated'` branch of `syncForProperty` (re-crawl of an already-tracked property) had:
  ```ts
  estateweb_location_id: effectiveFields.estateweb_location_id ?? existing.estateweb_location_id,
  ```
  — i.e. it preferred the canonical property's **current** value, and only fell back to the existing `UserProperty` value if canonical was `null` (essentially never, once normalization has run once).
- The canonical `Property` update path itself (`applyNormalizedResults()` in `property-normalization.service.ts`, the `property.update` branch for re-crawled/existing properties) had the same shape:
  ```ts
  estateweb_location_id: record.estateweb_location_id ?? existingLink.property.estateweb_location_id,
  ```
  `record.estateweb_location_id` comes from the **synchronous, no-Google-hint** resolver (`property-normalization.utils.ts`) — the same weak resolver responsible for the original bug. It almost never returns `null`; it just sometimes guesses the wrong region. So **every re-crawl would silently overwrite an already-correct (Google-verified or admin-bulk-fixed) canonical id with a fresh, potentially-wrong synchronous guess** — and that regression would cascade down into `UserProperty` (and from there, into the next CRM push) via the sync path above.
- The automatic Google-verification hook (root cause #1's fix) had only been wired into the **creation** path, not the update/re-crawl path — so nothing would have caught or self-healed this regression.

**Fix — protect already-set ids from the weak synchronous path; extend auto-verification to re-crawls.** In `property-normalization.service.ts`'s update branch, flipped precedence:
```ts
estateweb_location_id: existingLink.property.estateweb_location_id ?? record.estateweb_location_id,
```
Once a location id is set, only the async Google-verified job (or an admin bulk run) may change it — never the synchronous re-normalization. Added a conditional enqueue of the async re-check job on re-crawl too (gated: only when there was no id yet, or `city`/`district` text actually changed — not on every re-crawl regardless of relevance, to avoid needless Google calls on price/image-only updates). Mirrored the same conditional async-recheck addition on the `UserProperty` `'updated'` sync branch (precedence there was left as-is — preferring canonical's current value — since canonical is now protected from regression, so propagating it down is safe and is how an admin bulk fix reaches existing `UserProperty` rows over time).

The one path deliberately left untouched: `UserPropertiesService.resync()` — an explicit user-triggered "reset my edits, re-pull everything from canonical" action (`is_modified: false`). Pulling canonical's current value there is the correct, intended behavior for that action.

### Current architecture summary

```
Property.estateweb_location_id / UserProperty.estateweb_location_id
  ├─ Initial guess: synchronous resolver at creation (property-normalization.utils.ts,
  │  resolveEstateWebLocationFromSources — no Google hint, catalog text-match only)
  ├─ Real fix: async job (RESOLVE_ESTATEWEB_LOCATION_QUEUE), auto-enqueued:
  │    - on every new Property/UserProperty creation
  │    - on re-crawl/re-sync IF no id yet OR city/district text changed
  │  → reverse/forward-geocodes via Google, extracts adminSegments, re-runs the
  │    resolver with those as scoping hints, persists if the result differs
  ├─ Admin-triggered backfill: POST /admin/properties/resolve-estateweb-locations
  │  (canonical Property, admin-selected rows) and
  │  POST /properties/resolve-estateweb-locations (UserProperty, scoped to the
  │  calling admin's own rows) — both now require an explicit selection
  │  (property_ids / ids), not "all properties" (changed post-launch per user request)
  └─ Once a Property/UserProperty already has an id, only the async Google job
     (or an explicit admin/resync action) may change it — no code path silently
     reverts it anymore
```

`UserProperty.estateweb_location_id` is what actually gets pushed to EstateWeb
(`estateweb-cms-sync-adapter.service.ts` reads it, `pending_crm_update: true` is
set when the resolve job changes it). `Property.estateweb_location_id` is the
shared source of truth that seeds/re-syncs every `UserProperty` copy — fixing it
is what makes a correction durable across re-crawls, not just for the current
`UserProperty` snapshot.

### Key files (accuracy fixes)

| File | Role |
|---|---|
| `api/src/integrations/estateweb/utils/estateweb-location-lookup.util.ts` | Resolver, accepts `googleAddressSegments` |
| `api/src/integrations/estateweb/utils/estateweb-location-lookup.util.spec.ts` | Regression tests, incl. the real bug case (`101123` vs `114915`) |
| `api/src/shared/services/google-maps/google-maps.service.ts` | `reverseGeocode`/`geocodeAddressDetailed`, `adminSegments` extraction |
| `api/src/modules/user-properties/services/resolve-estateweb-location-job.service.ts` | Per-entity job logic (`processProperty`/`processUserProperty`) |
| `api/src/background/resolve-estateweb-location.processor.ts` | BullMQ worker, rate limiter, job-result aggregation, failures list |
| `api/src/modules/properties/services/property-normalization.service.ts` | Ingestion + re-crawl hooks (`enqueueResolveEstateWebLocation`) |
| `api/src/modules/user-properties/user-properties.service.ts` | UserProperty creation/sync hooks, `resolveEstateWebLocations(userId, ids)` |
| `api/src/modules/properties/properties.service.ts` | `resolveEstateWebLocations(propertyIds)` (canonical, admin) |
| `app/src/components/ui/resolve-estateweb-locations-modal.tsx` | Progress modal (selection count, breakdown, failures list) |
| `app/src/pages/admin/properties/components/properties-list-panel.tsx` | Admin bulk-actions wiring |
| `app/src/pages/dashboard/properties/index.tsx` | Dashboard "My Properties" bulk-actions wiring |

### Commits (accuracy-fix session, chronological)

1. `a1b76a0` — fix estateweb location resolution scoping via google geocoding (root cause #1: core Google-hint mechanism + job pipeline + admin/dashboard endpoints, first version)
2. `a07810a` — correcting location (root causes #2–#6: broader segment extraction, multi-result merge, always-run resolver, real progress breakdown, failures list, rate limiter)
3. `23df658` — selecting locations to fix (switched both resolve endpoints from "all properties" to selection-scoped, per explicit request)
4. `ac49c44` — fixed estateweb location ids (root cause #7: re-crawl regression fix)

### Test case used throughout

| | |
|---|---|
| `UserProperty.id` | `69912719-e055-4102-b68a-614f5b1143e2` |
| `Property.id` (canonical) | `09b48b59-c603-4fa9-846d-3d0137c19fc0` |
| City / District | Νέο Ψυχικό / Αγία Σοφία |
| Wrong id (before fix) | `114915` — Θεσσαλονίκη |
| Correct id | `101123` — Στερεά Ελλάδα » Αθήνα » Δήμος Φιλοθέης-Ψυχικού » Αγία Σοφία |

Also used as a real production regression sample during root cause #7 debugging (Kalamaria/Aretsou, Thessaloniki): `id 51206`/`103992`/`103986` catalog nodes under `Δήμος Καλαμαριάς`.

### Diagnostic recipes (reuse if this class of bug recurs)

**Check a job's real per-item breakdown** (not just the summary — summaries can lie if the aggregation logic has a bug, as in root cause #5):
```sql
SELECT status, COUNT(*) FROM job_log_items WHERE job_log_id = '<id>' GROUP BY status;
```

**Sample what a specific status group actually looks like** (join back to the entity table):
```sql
SELECT p.id, p.city, p.district, p.latitude, p.longitude
FROM job_log_items ji JOIN properties p ON p.id = ji.entity_id
WHERE ji.job_log_id = '<id>' AND ji.status = 'skipped' LIMIT 10;
```

**Probe Google's actual response for a real coordinate** (run from `api/`, needs `GOOGLE_MAPS_API_KEY` from `.env.production`/`.env.staging`):
```js
const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=el&key=${key}`;
// For reverse geocoding, dump ALL data.results[], not just [0] -- the admin hierarchy is
// spread across separate result entries (see root cause #4).
```

**Check what a catalog node/path actually looks like for a given place name:**
```js
const data = require('./src/integrations/estateweb/constants/estateweb-locations.data.json');
data.filter(l => l.name.includes('<greek text>')).forEach(l => console.log(l.id, l.name, '|', l.path));
```

**Verify the resolver directly against the compiled dist** (no DB needed, fast iteration):
```js
const { resolveEstateWebLocationFromSources } = require('./dist/src/integrations/estateweb/utils/estateweb-location-lookup.util');
resolveEstateWebLocationFromSources({ city, district, googleAddressSegments: [...] });
```

### Known follow-ups / not done

- **Option 2 (discussed, not built):** use a cheap LLM (e.g. Claude Haiku 4.5) as a tie-breaker over a Google-narrowed shortlist of catalog candidates, instead of relying solely on deterministic string matching. Cost analysis for this was done but no code was written — explicitly deferred until the Google-scoping fix above was proven out first.
- The `UserProperty` `'updated'` sync branch still prefers canonical's current value on conflict (not flipped like the `Property` update branch) — intentional (see root cause #7 fix notes), but worth re-checking if a future bug suggests canonical itself can still drift.
- Verified live against a small production sample (the test case above, plus 8 random previously-skipped properties) — not yet re-run as a full backfill across all ~3,176 properties at the time of writing.

---

---

## Problem

Pushing a property to EstateWeb (CREATE/UPDATE) requires a numeric `location_id` in the EstateWeb API payload.

We store that value as `estateweb_location_id` on `Property` / `UserProperty`.

When it is `null`, the CMS sync adapter rejects the push:

```
EstateWeb location id is required
```

Observed in production of this flow:

1. `POST /properties/push-to-crm` returns **201** (job enqueued successfully).
2. BullMQ worker runs → CREATE fails → opaque retry until detailed logs were added.
3. Failing property example had:
   - `estateweb_type_id: 21` ✅ (mapped)
   - `estateweb_location_id: null` ❌
   - Free-text location: `city: "Θεσσαλονίκη"`, `district: "Ιστορικό Κέντρο"`

So: **enqueue works; EstateWeb push fails for missing location id.**

---

## What `estateweb_location_id` is

| Concept | Meaning |
|--------|---------|
| Our column | `estateweb_location_id` on Property / UserProperty |
| EstateWeb payload field | `location_id` (required with `type_id` + `scope_id`) |
| Nature | EstateWeb **internal** numeric id for a node in their location tree (region / prefecture / area), **not** free-text city name |
| Example | Create payload used `location_id: 400` |

Unlike types, there is **no auto city/district → id mapping** in the codebase today.

---

## Why normalization leaves it null

Normalization prompt (`api/src/modules/properties/constants/normalization-prompt.ts`):

```text
"estateweb_type_id": number | null (leaf type id from the EstateWeb catalog above),
"estateweb_location_id": number | null (only when explicitly present in raw data),
```

**Types work** because:

- `ESTATEWEB_INIT_PROPERTY_TYPES` is committed in `estateweb-init.constants.ts`
- AI catalog builder injects leaf types into the prompt
- Model maps Greek type labels → leaf id (e.g. Γκαρσονιέρα → `21`)

**Locations stay null** because:

1. Prompt explicitly says: only set when present in raw scrape (almost never).
2. Scrape gives **names** (`Θεσσαλονίκη`, `Ιστορικό Κέντρο`), not EstateWeb ids.
3. **There is no location catalog in `api/src/integrations/estateweb/constants/`.**

Constants folder currently has only:

| File | Contents |
|------|----------|
| `estateweb-init.constants.ts` | Fields + property types |
| `estateweb-ai-catalog.constants.ts` | AI builders for fields + types |
| `estateweb-field-options.constants.ts` | Select field options |
| `estateweb-agent-catalog.constants.ts` | Agent sites / gateways |
| `estateweb-enums.constants.ts` | Enums |

Case-insensitive search for `location` under that folder → **0 matches**.

---

## Investigation of available artifacts

### `scripts/api-generator/example-requests/estate-web-init.json`

Full `GET https://app.estateweb.gr/api/init` response.

**Findings:**

1. **`fieldsOfTypes` is NOT locations.**  
   Shape: `Record<propertyTypeId, fieldId[]>`.  
   Maps which custom fields apply to which property type. Already typed as `EstateWebInitFieldsOfTypes`.

2. **`cache.locations` is NOT the tree.**  
   Value in the dump: `"1746438764"` — a **version / cache-buster string**, not location data. Typed today as:

   ```ts
   export interface EstateWebInitCache {
     locations: string;
   }
   ```

   EstateWeb likely loads the real tree from a **separate cached endpoint** keyed by that version.

### `scripts/api-generator/example-requests/estate-web-location-responses.md`

Captured from:

```http
POST https://app.estateweb.gr/patch/?path=gateways/location/match
```

Payload example:

```json
{ "gateway_id": 2, "location_id": 80601 }
```

Response example:

```json
{
  "data": {
    "id": "1838",
    "parent_id": "1755",
    "name": "Μεσσηνία",
    "level": "1",
    "path": "Υπόλοιπη Ελλάδα » Μεσσηνία"
  }
}
```

**Interpretation — two different id spaces:**

| Id | Meaning |
|----|---------|
| Request `location_id` (80601, 113745, …) | **Portal / gateway** location id (e.g. Spitogatos; `gateway_id: 2`) |
| Response `data.id` (1838, 1345, …) | EstateWeb **internal** location id (+ `parent_id`, `name`, `level`, `path`) |

This endpoint is a **gateway-location → EstateWeb-internal-location** resolver (useful for portal imports).

**Relation to our scrape flow:**

- We have free-text `city` / `district`, **not** Spitogatos gateway location ids.
- Match endpoint alone **cannot** map our scraped names → `estateweb_location_id`.
- Match **response shape** is the shape of nodes we need in the full tree (`id`, `parent_id`, `name`, `level`, `path`).
- Internal `data.id` is the same id space as create/update `location_id`.

### Are they “connected”?

| Pair | Connected? |
|------|------------|
| `fieldsOfTypes` ↔ locations | **No** |
| Match input id ↔ our scraped data | **No** (different id space; we don’t have gateway ids) |
| Match output ↔ payload `location_id` | **Yes** (internal EstateWeb location id) |
| `init.cache.locations` ↔ tree | **Only as a cache key**, not as data |

**Blocker unchanged:** we still lack the **full internal location tree** to map names → ids.

---

## CMS sync failure path (context)

- Adapter: `EstateWebCmsSyncAdapter.assertRequiredFields` requires `estateweb_type_id` + `estateweb_location_id`.
- Payload maps `location_id: userProperty.estateweb_location_id ?? 0`.
- Worker: `CmsSyncProcessor` — detailed per-op logs were added so failures surface real messages (e.g. missing location) instead of only “1 property push(es) failed; scheduling retry”.

---

## Proposed solution

### Goal

After normalization (or before push), set `estateweb_location_id` from scraped `city` / `district` via a **deterministic** matcher against EstateWeb’s internal location tree.

Prefer deterministic matching over stuffing the full tree into the LLM prompt (tree is large; types catalog is small enough for the prompt, locations likely are not).

### Steps

1. **Capture the internal locations tree**  
   Open EstateWeb dashboard location dropdown with Network tab. Find the request that loads the location list (likely cache-keyed by `cache.locations` value like `1746438764`). Save response into e.g. `scripts/api-generator/example-requests/estate-web-locations.json`.

2. **Commit catalog + interfaces** (mirror property types pattern)

   Suggested shapes:

   ```ts
   export interface EstateWebLocation {
     id: number;
     parent_id: number | null;
     name: string;
     level: number; // 0=region, 1=prefecture, 2=area, ...
     path: string;  // "Ηράκλειο » Γούβες » Αγία Πελαγία"
   }

   export interface EstateWebLocationMatchRequest {
     gateway_id: number;
     location_id: number; // portal/gateway location id
   }

   export interface EstateWebLocationMatchResponse {
     data: EstateWebLocation;
   }
   ```

   Constant: `ESTATEWEB_INIT_LOCATIONS` (or similar) under `api/src/integrations/estateweb/constants/`.

3. **Deterministic resolver**  
   - Normalize Greek (accent-insensitive, case-insensitive, trim).  
   - Prefer match on `district`, else `city`, against `name` and/or `path`.  
   - Prefer deepest / most specific node when multiple matches.  
   - Return `null` if no confident match.

4. **Wire into pipeline**  
   Run after AI normalization in `PropertyNormalizationService` (and/or lazily in CMS adapter before push). Persist `estateweb_location_id` on Property / UserProperty.

5. **Prompt**  
   Keep LLM from inventing location ids. Either leave instruction as-is or remove `estateweb_location_id` from AI output and always set it via the resolver.

6. **Fallback UX**  
   If still null: keep clear validation error; allow manual set on property detail (`estateweb_location_id` field already exists).

### Optional later

- Gateway match client for Spitogatos-style imports (`gateways/location/match`) — separate from scrape→CRM name matching.
- Per-account location trees if EstateWeb locations prove account-specific (confirm after capture).

---

## What NOT to do

- Do not treat `fieldsOfTypes` as location ids.
- Do not treat `cache.locations` string as the catalog.
- Do not ask the LLM to invent `estateweb_location_id` without a catalog.
- Do not assume match-endpoint request ids equal create/update `location_id`.

---

## Key file references

| Path | Role |
|------|------|
| `api/src/integrations/estateweb/services/estateweb-cms-sync-adapter.service.ts` | Asserts location required; maps to payload `location_id` |
| `api/src/modules/properties/constants/normalization-prompt.ts` | Prompt rules for type vs location |
| `api/src/integrations/estateweb/constants/` | Types/fields catalogs; **no locations yet** |
| `api/src/integrations/estateweb/interfaces/estateweb-init.interface.ts` | `cache.locations: string` |
| `scripts/api-generator/example-requests/estate-web-init.json` | Full `/api/init` dump |
| `scripts/api-generator/example-requests/estate-web-location-responses.md` | Gateway match examples |
| `api/src/background/cms-sync.processor.ts` | Worker + detailed failure logs |

---

## Next action for implementing session

1. Obtain / capture **full EstateWeb internal locations list** JSON.  
2. Add constants + TypeScript interfaces.  
3. Implement name→id resolver.  
4. Wire into normalization (and/or pre-push).  
5. Re-test push for property with city/district but previously null `estateweb_location_id` (e.g. Θεσσαλονίκη / Ιστορικό Κέντρο).
