# EstateWeb Location Resolution — Accuracy Debugging Session

**Date:** 2026-08-31 (updated 2026-09-02 — root cause #8 + its backfill)
**Status:** ✅ Root causes fixed and verified against production data. One optional follow-up (AI tie-break) not started. Root cause #8's backfill (2026-09-02) is complete.
**Related doc:** `docs/ESTATEWEB-LOCATION-MAPPING.md` (original build/handoff doc — read that first for the base architecture; this doc covers a follow-up debugging session that found and fixed several correctness bugs in what that doc shipped).

If you're an agent picking this up cold: read `ESTATEWEB-LOCATION-MAPPING.md` first for what `estateweb_location_id` is and the base resolver design, then this doc for what was *wrong* with the first implementation and how it was fixed. The diagnostic recipes in this doc (SQL queries, live Google API probes) are reusable if the same class of bug resurfaces.

---

## The problem, in one example

`user_properties.id = 69912719-e055-4102-b68a-614f5b1143e2` — a listing in **Νέο Ψυχικό, Αγία Σοφία** (a real, specific neighborhood in Athens' northern suburbs) had `estateweb_location_id = 114915`, which is EstateWeb's catalog node for **Αγία Σοφία, Thessaloniki** — a completely different, unrelated place ~500km away that happens to share the same neighborhood name.

The EstateWeb location catalog (`api/src/integrations/estateweb/constants/estateweb-locations.data.json`, ~14,379 nodes) has **11 different "Αγία Σοφία" nodes nationwide** (Athens, Thessaloniki, Larissa, Piraeus, Corinthia, Laconia, Messenia, Lesvos, Evia, Aitoloakarnania, Magnesia). This is systemic — any Greek place name that repeats across multiple regions is a landmine for this feature, and it affected properties across many agencies, not just one.

---

## Root cause #1 — the original resolver had no region-scoping ground truth

`api/src/integrations/estateweb/utils/estateweb-location-lookup.util.ts` resolves `estateweb_location_id` via pure Greek-text/alias matching against the static catalog — no geocoding, no coordinates, just string matching (`resolveEstateWebLocationFromSources`). It has a `preferredPathSegments` scoping mechanism, but it was only ever fed by weak regex hints (`REGION_PATH_HINTS`, hardcoded for Crete) inferred from title/description text.

When the scraped `city` string doesn't exactly match a catalog node or alias (e.g. `"Νέο Ψυχικό"` isn't in the catalog — only plain `"Ψυχικό"` is), the resolver **silently drops the city/region constraint** and falls back to `pickMostSpecific()`, which just picks whichever same-named node happens to sit **deepest in the catalog tree**. Catalog depth is an accident of how each region's admin hierarchy happens to be modeled — it has zero relationship to geographic proximity. That's how Thessaloniki (nested one level deeper: city → neighborhood) won over Athens (nested one level shallower: municipality → neighborhood) for this property.

### Fix — feed real Google geocoding data as a scoping hint

Added `googleAddressSegments?: string[] | null` to `resolveEstateWebLocationFromSources()` (validated live against the real API — see "Diagnostic recipes" below). Google's admin hierarchy for a Greek address/coordinate reliably contains names that literally match catalog `path` segments (region, prefecture, sometimes municipality, locality, neighborhood). These are prepended into the existing `preferredPathSegments` array — no other resolver logic changed; `filterByPreferredPath()` already progressively narrows by segment and skips any segment that would empty the candidate set, so this combines safely with the existing regex hints.

New pipeline (mirrors the existing `geocode-missing-coordinates` job pattern):
- `GoogleMapsService.reverseGeocode(lat, lng)` / `.geocodeAddressDetailed(address)` — `api/src/shared/services/google-maps/google-maps.service.ts`
- New queue `resolve-estateweb-location` (`RESOLVE_ESTATEWEB_LOCATION_QUEUE`), processor `api/src/background/resolve-estateweb-location.processor.ts`, job service `api/src/modules/user-properties/services/resolve-estateweb-location-job.service.ts`
- Runs **automatically** after every new `Property`/`UserProperty` creation, and is also **admin-triggered** on demand (see below)
- Lat/lng backfill deliberately out of scope — reads coordinates when already present, discards any lat/lng Google returns otherwise; only the address components are used

---

## Root cause #2 — the extraction regex only worked for Athens

First implementation only looked for an `address_components` entry whose `long_name` matched `/^Δήμος\s/` ("Δήμος" = municipality). **This pattern is Attica-specific.** For Thessaloniki, Crete, Halkidiki, etc., Google returns bare names (e.g. `"Θεσσαλονίκη"`, `"Χανιά"`) with no `"Δήμος"` word anywhere. Verified live:

```
Reverse-geocode 40.5711324,22.9626263 (Καλαμαριά, Θεσσαλονίκη) →
  administrative_area_level_3 = "Θεσσαλονίκη"   (no "Δήμος" anywhere)
```

### Fix — collect every admin/locality name, not just "Δήμος"-prefixed ones

`GoogleMapsService` now walks a priority-ordered list of component types (`administrative_area_level_1`..`7`, `locality`, `sublocality*`, `neighborhood`) and returns them all as `adminSegments: string[]`, broad-to-specific. Google's bare `"Θεσσαλονίκη"` still matches the catalog's prefecture path segment directly (catalog paths are literally `"Μακεδονία » Θεσσαλονίκη » Δήμος Καλαμαριάς » Αρετσού"` — the prefecture segment matches even with no "Δήμος" word anywhere in the response), so this is sufficient scoping without needing the municipality specifically.

---

## Root cause #3 — the job hard-gated resolution on finding a hint

If Google didn't return a "Δήμος"-prefixed string (i.e. almost always, per bug #2), the job **skipped the property entirely** — never even attempted the resolver's own city/district matching, which had a real chance of being correct on its own. Combined with bug #2, **3,156 of 3,176 properties (99%) came back `skipped`** on the first production backfill run.

### Fix — never gate; the resolver always runs

`resolveGoogleAddressSegments()` returns `[]` (not an error) when Google has nothing usable (`ZERO_RESULTS`, or no admin components at all). The resolver always runs afterward, with or without hints. `skipped` is now reserved for the (much rarer) case where the resolver truly can't find anything even with hints. Only a real Google API error (bad key, quota, network) fails the item.

---

## Root cause #4 — reverse geocoding spreads the hierarchy across separate `results[]` entries

Even for the Athens case that bug #1's fix was validated against, the code only read `data.results[0].address_components`. Google's **reverse** geocoding API returns up to ~17 separate top-level `results[]` entries for one lat/lng — one per distinct geographic feature containing that point (street address, postal code area, locality, each `administrative_area_level_N`, country, ...) — each with its **own, minimal** `address_components`. For the original bug property, `"Δήμος Φιλοθέης-Ψυχικού"` only appeared in `results[12]`, never in `results[0]` (the precise street-address result).

### Fix — merge components across all result entries

```ts
const components = results.flatMap((r) => r.address_components ?? []);
```
`lat`/`lng`/`formattedAddress` still come from `results[0]` (the most precise geometry); the admin/locality segment collection now scans every result entry.

---

## Root cause #5 — job progress numbers were misleading

The job result only reported a combined `resolved` count that actually meant "processed without error" (lumping together genuinely-changed, already-correct, and skipped items) plus `failed`. A user running the backfill saw *"3163 resolved, 13 failed"* and reasonably assumed 3163 properties got fixed — the real breakdown (via `job_log_items.status`) was **4 resolved, 3 unchanged, 3156 skipped, 13 failed** (this was root cause #2/#3 in action).

### Fix — report real breakdown

`ResolveEstateWebLocationJobResult` now has separate `resolved` / `unchanged` / `skipped` / `failed` counts, computed via SQL `COUNT(*) FILTER (WHERE status = ...)` per status in `resolve-estateweb-location.processor.ts`. The modal UI shows all four.

---

## Root cause #6 — `OVER_QUERY_LIMIT` from Google during bulk runs

Not the monthly free-tier cap (10k/month — nowhere near exceeded). `OVER_QUERY_LIMIT` is a **per-second throughput throttle**. The worker ran at `concurrency: 15` with **no rate limiting**, so a multi-thousand-item backfill just hammered Google as fast as BullMQ would allow. Per-item retry (3 attempts, exponential backoff) didn't help: it only delays *that job's* own next attempt while the other ~14 concurrent slots keep hammering at the same aggregate rate, so a sustained throttle condition fails most retries identically.

### Fix — worker-level rate limiter

Added BullMQ's `limiter: { max: 8, duration: 1000 }` to `@Processor(...)` on **both** `ResolveEstateWebLocationProcessor` and the pre-existing `GeocodeCoordinatesProcessor` (same architecture, same exposure, even though it hadn't been reported failing yet).

---

## Root cause #7 — re-crawls could silently regress an already-fixed id (found while auditing, not observed directly)

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

### Fix — protect already-set ids from the weak synchronous path; extend auto-verification to re-crawls

In `property-normalization.service.ts`'s update branch, flipped precedence:
```ts
estateweb_location_id: existingLink.property.estateweb_location_id ?? record.estateweb_location_id,
```
Once a location id is set, only the async Google-verified job (or an admin bulk run) may change it — never the synchronous re-normalization. Added a conditional enqueue of the async re-check job on re-crawl too (gated: only when there was no id yet, or `city`/`district` text actually changed — not on every re-crawl regardless of relevance, to avoid needless Google calls on price/image-only updates). Mirrored the same conditional async-recheck addition on the `UserProperty` `'updated'` sync branch (precedence there was left as-is — preferring canonical's current value — since canonical is now protected from regression, so propagating it down is safe and is how an admin bulk fix reaches existing `UserProperty` rows over time).

The one path deliberately left untouched: `UserPropertiesService.resync()` — an explicit user-triggered "reset my edits, re-pull everything from canonical" action (`is_modified: false`). Pulling canonical's current value there is the correct, intended behavior for that action.

---

## Root cause #8 — the "last resort" fallback unconditionally defaulted to Crete (found 2026-09-02, fixing `user_properties.id = cb630743-30b6-4c49-a14b-45e1a4fdec7d`)

`resolveEstateWebLocationFromSources()`'s final fallback (for when nothing else matched) looped over `preferredPathSegments` looking for a segment that named a real `is_city` catalog node; if none did, it **unconditionally** returned the single island-level `"Κρήτη"` node (id `4`) — regardless of whether Crete had anything to do with the property. This was safe back when this resolver only ever ran against Crete-specific regex hints (`REGION_PATH_HINTS`), but root cause #1 made `googleAddressSegments` feed this nationwide, and the comment's assumption ("if we only know it's Crete generally") stopped being true.

Concretely: `UserProperty.id = cb630743-30b6-4c49-a14b-45e1a4fdec7d` (agency ref `AG131`) has `city: "Σύρος"`, `district: null` — Syros, a Cycladic island, ~300km from Crete. `"Σύρος"` has no exact/aliased catalog node (only `"Άνω Σύρος"`, `"Ερμούπολη"`, etc. exist under `Δήμος Σύρου-Ερμουπόλεως`), and **none of Syros's catalog nodes are flagged `is_city`** — so the `is_city` loop found nothing, even with correct Google hints (`adminSegments: ["Σύρος", "Άνω Σύρος", "Ερμούπολη", ...]`), and fell through to the blind Crete default: `estateweb_location_id = 4`.

### Fix — pick the most specific node actually named by a hint segment; no blind regional default

```ts
const namedMatches = preferredPathSegments.flatMap(
  (segment) => LOCATION_BY_NORMALIZED_NAME.get(segment) ?? [],
);
const bestNamed = pickMostSpecific(namedMatches);
if (bestNamed) return bestNamed;
```
Still never guesses a same-named-but-wrong-region homonym — every candidate here was named by a real hint segment (Google ground truth or a region regex), not picked blind. For the Syros case this now resolves to `107399` (`"Άνω Σύρος"`), matching Google's own `formattedAddress` for that exact coordinate. Regression test added in `estateweb-location-lookup.util.spec.ts` ("does not blindly default to Crete when no hint segment has an is_city anchor").

**This is systemic, same as the original bug**: any property outside Crete whose city/district text doesn't exactly match a catalog node, and whose Google hint segments don't happen to hit one of the handful of `is_city`-flagged nodes (Χανιά/Ρέθυμνο/Ηράκλειο/Λασίθι and similar prefecture seats), would have been silently mis-set to Crete (`id 4`). Measured in production before the fix: **60 `Property` rows and 64 `UserProperty` rows** had `estateweb_location_id = 4`, and a sample of their `city` values (`Αγία Τριάδα Βοιωτίας`, `Λιβάδι Παρνασσού`, `Ορεινή Ναυπακτία`, `Κλίμα`, `Πιτσινιά`, ...) confirmed most were nowhere near Crete — mostly mainland (Φωκίδα/Παρνασσός/Βοιωτία/Ναυπακτία), some in Crete itself but the wrong specific node, one on Mykonos, one in Nicosia, Cyprus.

```sql
-- Find remaining rows hit by this bug (before the backfill below was run)
SELECT id, city, district FROM properties WHERE estateweb_location_id = 4;
SELECT id, city, district FROM user_properties WHERE estateweb_location_id = 4;
```

**Backfill run 2026-09-02** (ad hoc script, same Google-reverse-geocode + resolver call as the real job, run directly against production rather than via BullMQ since the affected set was small): `Property: 55 resolved, 2 unchanged, 3 skipped, 0 failed`. `UserProperty: 58 resolved, 2 unchanged, 4 skipped, 0 failed`.
- **unchanged (4 rows total)** genuinely resolved to Crete again (`id 4`) — real Crete properties where the resolver still can't pin a more specific node; correct, not a bug.
- **skipped (7 rows total)** correctly left alone rather than guessed: `Μύκονος` (no catalog node — Mykonos isn't in this catalog at all), `Κάμιλα`/`Κavousi` (ambiguous/typo'd spelling with no catalog or Google match), and `Κοκκινοτριμιθιά`/`Λευκωσία` (Nicosia, **Cyprus** — correctly not force-matched into the Greek catalog).

---

## Current architecture summary

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

---

## Key files

| File | Role |
|---|---|
| `api/src/integrations/estateweb/constants/estateweb-locations.data.json` | Static ~14,379-node catalog |
| `api/src/integrations/estateweb/utils/estateweb-location-lookup.util.ts` | Resolver (`resolveEstateWebLocationFromSources`), accepts `googleAddressSegments` |
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

## Commits (this session, chronological)

1. `a1b76a0` — fix estateweb location resolution scoping via google geocoding (root cause #1: core Google-hint mechanism + job pipeline + admin/dashboard endpoints, first version)
2. `a07810a` — correcting location (root causes #2–#6: broader segment extraction, multi-result merge, always-run resolver, real progress breakdown, failures list, rate limiter)
3. `23df658` — selecting locations to fix (switched both resolve endpoints from "all properties" to selection-scoped, per explicit request)
4. `ac49c44` — fixed estateweb location ids (root cause #7: re-crawl regression fix)

## Test case used throughout

| | |
|---|---|
| `UserProperty.id` | `69912719-e055-4102-b68a-614f5b1143e2` |
| `Property.id` (canonical) | `09b48b59-c603-4fa9-846d-3d0137c19fc0` |
| City / District | Νέο Ψυχικό / Αγία Σοφία |
| Wrong id (before fix) | `114915` — Θεσσαλονίκη |
| Correct id | `101123` — Στερεά Ελλάδα » Αθήνα » Δήμος Φιλοθέης-Ψυχικού » Αγία Σοφία |

Also used as a real production regression sample during root cause #7 debugging (Kalamaria/Aretsou, Thessaloniki): `id 51206`/`103992`/`103986` catalog nodes under `Δήμος Καλαμαριάς`.

---

## Diagnostic recipes (reuse if this class of bug recurs)

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

---

## Known follow-ups / not done

- **Option 2 (discussed, not built):** use a cheap LLM (e.g. Claude Haiku 4.5) as a tie-breaker over a Google-narrowed shortlist of catalog candidates, instead of relying solely on deterministic string matching. Cost analysis for this was done (see conversation) but no code was written — explicitly deferred until the Google-scoping fix (this doc) was proven out first.
- The `UserProperty` `'updated'` sync branch still prefers canonical's current value on conflict (not flipped like the `Property` update branch) — this is intentional (see root cause #7 fix notes), but worth re-checking if a future bug suggests canonical itself can still drift.
- No backfill has been run yet against the *fixed* pipeline at the time of writing this doc for the full ~3,176 properties / all agencies — only the single test case and a small production sample (8 properties) were verified live. Run the admin bulk action (now selection-scoped — select all rows first) to backfill the rest.
- ~~Root cause #8 backfill not run~~ — done 2026-09-02, see root cause #8 above for the final counts.
