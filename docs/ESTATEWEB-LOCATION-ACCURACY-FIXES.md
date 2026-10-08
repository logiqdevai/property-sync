# EstateWeb Location Resolution — Accuracy Debugging Session

**Date:** 2026-08-31 (updated 2026-09-02 — root cause #8 + its backfill; updated 2026-09-03 — root cause #9 + its backfill; updated 2026-09-21 — root cause #12; updated 2026-09-29 — root cause #13 + its backfill; updated 2026-09-30 — agencyCity regional scope + its housemarket-realestate.gr backfill; updated 2026-10-01 — root cause #14 + its backfill, plus discovery that the general post-fix backfill was never run — see "Known-stale backfill" section; updated 2026-10-08 — root cause #15 + its backfill)
**Status:** ✅ Root causes fixed and verified against production data. One optional follow-up (AI tie-break) not started. Root cause #8's backfill (2026-09-02), root cause #9's backfill (2026-09-03), root cause #13's backfill (2026-09-29), the agencyCity backfill for housemarket-realestate.gr (2026-09-30), and root cause #14's backfill (2026-10-01) are complete. ⚠️ The GENERAL full-catalog backfill (re-running the resolve job against every property to pick up ALL fixes #1-#14 for properties never reprocessed since they landed) has still never been run — see "Known-stale backfill" section.
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

## Root cause #9 — municipality catalog nodes are only reachable by their exact "Δήμος <Genitive>" string (found 2026-09-03, fixing `user_properties.id = e02c44ec-6412-4459-99dc-775d483883a4`)

`user_properties.id = e02c44ec-6412-4459-99dc-775d483883a4` (property ref `KH392`, city `Χανιά`, district `Αποκορώνας`, address `Kalamitsi`, coords in Georgioupoli/Kalamitsi Amygdaliou) had `estateweb_location_id = 113671` — **Χανιά town** (catalog node under `Δήμος Χανίων`). The real coordinates are in **Δήμος Αποκορώνου** (id `40300`), a different, adjacent municipality within the same Χανιά *prefecture* — same shape of bug as the original one (right prefecture, wrong specific place), but this one survived all 8 previous fixes because it's a different mechanism: this property's canonical `Property` and `UserProperty` rows already agreed (ruling out root cause #7), and the async Google-hint job had already run **twice against the fully-patched resolver** (most recently hours before this was reported) and both times returned `unchanged` — i.e. the current code was confidently computing the wrong answer, not skipping or drifting.

Traced with the live compiled resolver: `resolveEstateWebLocation('Χανιά', 'Αποκορώνας')` returns `113671` regardless of Google hints, because:
- The catalog has **no node literally named "Αποκορώνας"** — only `"Δήμος Αποκορώνου"` (genitive-cased, as essentially all Greek municipality catalog names are: `"Δήμος <region genitive>"`). `LOCATION_BY_NORMALIZED_NAME` indexed catalog nodes only by their **full** name string, so nothing short of the literal `"Δήμος Αποκορώνου"` text ever matched it — not even the bare genitive `"Αποκορώνου"` alone.
- Live-probed Google reverse-geocoding for this coordinate: `administrative_area_level_4 = "Αποκόρωνος"` — the **nominative** form (2nd-declension: nominative `-ος` / genitive `-ου`, e.g. `Ρόδος`/`Ρόδου`, `Νάξος`/`Νάξου`). This is a completely regular, productive Greek grammar pattern, but the resolver's only genitive-handling helper (`stripGreekGenitive`, added for city-label matching, e.g. `"Ν. Χανίων"` → `"Χανιά"`) only stripped `-ης/-ας/-ων` endings to a nominative form — the reverse direction (nominative → genitive, needed to reach a `"Δήμος X"` node) didn't exist at all, and neither did the `-ος/-ου` pair in either direction.
- With no district-catalog match, the resolver silently fell through to matching bare `city: "Χανιά"` against **all** same-named `"Χανιά"` nodes nationwide (12 of them) and picked the deepest one by tree depth (`pickCanonicalCity`/`pickMostSpecific`) — the Χανιά *town* under `Δήμος Χανίων` — the same "give up and pick something plausible by catalog-tree-shape" failure pattern as root causes #1 and #8, just triggered by a different upstream gap.
- Scraped `district: "Αποκορώνας"` (the modern, colloquial nominative everyone actually writes) turned out to be a further wrinkle: it's an **irregular alternate lemma** of the catalog's formal `"Απόκορος"` (nominative) / `"Αποκορώνου"` (genitive) — not reachable via *any* regular Greek declension rule, the same category of exception the codebase already curates for other nomos names (`θεσσαλονικης`, `πιεριας`, `χαλκιδικης`, etc. in `CITY_ALIASES`).

This is systemic in the same way as #1/#8: **any Greek municipality whose scraped/Google-sourced district text doesn't spell out the catalog's exact `"Δήμος <Genitive>"` string** (true for effectively all real-world text — nobody writes the bureaucratic form) **falls through to a same-named `is_city` seat town in a different municipality of the same prefecture, if one happens to exist.** Chania prefecture has this shape (Χανιά town vs. Αποκόρωνας/Κίσσαμος/Πλατανιάς/Σέλινο and other municipalities); it likely recurs for Ηράκλειο, Ρέθυμνο, Λασίθι, and mainland prefectures with a same-named capital-city municipality — i.e. multiple agencies, not just this one property.

### Fix — index municipalities by their bare name; handle the regular -ος/-ου pair; alias the one irregular case found

`api/src/integrations/estateweb/utils/estateweb-location-lookup.util.ts`:
1. **Bare-municipality-name indexing**: every `"Δήμος X"` catalog node is now also indexed under its bare name `X` (Δήμος-prefix stripped), so `"Αποκορώνου"` alone finds `Δήμος Αποκορώνου`. Applied catalog-wide (~325 municipalities), not just this one — but **only where the bare name doesn't already collide with an unrelated existing catalog entry** (11 such collisions exist, e.g. `"Δήμος Πύργου"` in Ilia vs. the Crete settlement `"Πυργού"` in Heraklion — those are deliberately left unindexed by their bare form to avoid introducing any new ambiguity for other agencies' properties).
2. **`guessGreekGenitive()`** (new, inverse of the existing `stripGreekGenitive`): adds the regular `-ος → -ου` nominative-to-genitive pattern, applied when expanding district labels. This alone fixes any municipality where Google or scraped text gives the *regular* nominative form (Google's `"Αποκόρωνος"` here) — no curated alias needed for that half of the bug.
3. **Curated alias** (`CITY_ALIASES`, same pattern as the existing nomos-name entries): `αποκορωνας`/`αποκορωνα` → `αποκορωνου`, for the specific irregular lemma pair that no grammatical rule can bridge.

Together, `resolveEstateWebLocation('Χανιά', 'Αποκορώνας')` now returns `40300` (`Δήμος Αποκορώνου`) directly via the existing district-resolution path — no Google hint required, so the *synchronous* creation-time resolver also gets future Apokoronas-area listings right immediately, not just the async job. Regression tests added in `estateweb-location-lookup.util.spec.ts` (the real bug case, plus a synthetic case proving the general `-ος/-ου` handling works with no alias needed).

**Backfill run 2026-09-03**: swept `properties`/`user_properties` nationwide for `district ILIKE '%αποκορ%'` (any spelling/casing variant, incl. `apokoronas`/`apokoronos` Latin) and re-ran the fixed resolver against each row (ad hoc script, direct DB update, same pattern as root cause #8's backfill — ~325 rows checked in total, cheap since this fix needs no Google calls). Result: **175 `Property` rows and 170 `UserProperty` rows corrected** across many agencies (173/168 were the exact reported bug — Χανιά town → `Δήμος Αποκορώνου`; the remaining 2/2 were two more mis-resolutions found along the way — one to a wrong Ioannina village, one to the wrong Chania sub-municipality). The other 60/59 rows in that set were already correct (e.g. city already a specific Αποκορώνου village like Κεφαλάς/Βάμος) and were left untouched — verified via the regression test added for exactly this case (see fix section above). Every corrected `Property` row got a matching `property_history` entry (`event_type: UPDATED`, `field: estateweb_location_id`, `crawl_run_id: null`) so the change is visible in each property's own audit trail, not just this doc.

---

## Root cause #10 — Google's forward geocoding names the prefecture "Νομός <Genitive>", which never equals a catalog segment (found 2026-09-19, fixing `user_properties.id = 02c5f549-9afe-4e1b-ae37-38105bb25169`)

`user_properties.id = 02c5f549-9afe-4e1b-ae37-38105bb25169` (samoshouse.gr ref `Λ-1293`, city `ΒΑΘΥ`, district `ΚΟΚΚΑΡΙ`, **no coordinates, no address**) had `estateweb_location_id = 100010` — **Βαθύ, Lasithi, Crete** — for a plot in Kokkari, **Samos**. The admin "Resolve EstateWeb locations" action returned it unchanged/no-op, same as #9: the code was confidently computing the wrong answer. The canonical `Property` (`11727d4f-5c56-410c-87d3-46acf968b72c`) carried the same wrong id, so a re-sync would have re-imported it.

- The catalog has 12 nationwide `"Βαθύ"` nodes and **no Κοκκάρι node**, so the only thing that can disambiguate is the region hint from Google.
- With no coordinates, the job **forward-geocodes** `"ΚΟΚΚΑΡΙ, ΒΑΘΥ, GR"`. Google answers `Κοκκάρι / Νομός Σάμου` — the legacy prefecture in **genitive with a "Νομός" prefix**. Reverse-geocoding (coordinates present) instead yields plain `Σάμος` (admin_level_4), which is why this never showed up on coordinate-bearing rows.
- `filterByPreferredPath` matches by exact segment equality: `"νομος σαμου"` ≠ catalog `"σαμος"`, so the hint matched nothing, was skipped, and `pickMostSpecific` chose the deepest `Βαθύ` by tree shape (Lasithi). Verified: same resolver with `['Σάμος']` → `107876`; with `['Νομός Σάμου']` → `100010`.

### Fix
`expandGoogleAdminSegment()` in `estateweb-location-lookup.util.ts`, applied to every Google segment before it becomes a hint: strips a leading `Νομός ` / `Περιφερειακή Ενότητα ` and derives the nominative by trying genitive→nominative rewrites (`-ου→-ος/-ο/-ι`, `-ης→-η/-α`, `-ας→-α`, `-ων→-α/-ες`), **keeping only candidates that are a real catalog prefecture segment** (`PREFECTURE_SEGMENTS`, path[1]; 54 of them) so it can't invent matches. Irregular ones added to `CITY_ALIASES`: `δωδεκανησου→δωδεκανησα`, `πελλης→πελης` (catalog spells it with one λ), `πειραιως→πειραιας`. Regression tests added (Samos case + a table of 14 prefectures).

### Data fix (2026-09-19)
Guarded transaction: `user_properties` + canonical `properties` `100010 → 107876` (`Νησιά Αιγαίου » Σάμος » Βαθύ`), `pending_crm_update = true` on the user row, `property_history` entry on the canonical row.

### Not done: sweep
~701 `Property` / ~662 `UserProperty` rows with an id set have no coordinates and so go through the forward-geocode path. Only those whose city/district is a **nationwide homonym** could be wrong. A sweep needs a Google call per row (dry-run diff first, as in #8/#9) — not run.

---

## Root cause #11 — Samos villages the catalog doesn't have, on an agency whose region only the agency itself knows (found 2026-09-19, samoshouse.gr; **not fixed in code**)

Client reported `Λ-969, Λ-1198, Λ-1120, Λ-28, Λ-19, Λ-1308, Λ-1235` (tracker `48e9b8fa-d21f-497f-9fe7-5db0bcd6485c`) as wrong. Sizing the agency: **37 of 141** samoshouse properties sit outside Samos (104 are correct). They are Samos towns/villages — `ΚΑΡΛΟΒΑΣΙ` + `ΜΕΣΑΙΟ`/`ΑΛΩΝΑΚΙ`/`ΑΓ. ΘΕΟΔΩΡΟΙ`/`ΠΟΤΑΜΙ`/`ΑΜΜΟΥΔΙΕΣ`, `ΒΑΘΥ`, `ΠΥΘΑΓΟΡΕΙΟ`/`ΠΥΡΓΟΣ`, `ΑΓ.ΚΩΝ/ΝΟΣ` — resolved to Thessaloniki, Arta, Corinthia, Evia, W. Attica, Crete, Ilia, Phthiotida. **None of the 141 has coordinates or an address**, and the description text never says "Σάμος"; the only region signal is the agency itself.

Three mechanisms combine:
1. **Unique-district fallback.** In `resolveByDistrict`, `!anyKnownCity || districtMatches.length === 1` accepts a district that has exactly one catalog node nationwide even when the scraped city is a known place elsewhere. `ΚΑΡΛΟΒΑΣΙ / ΜΕΣΑΙΟ`: the catalog's only `Μεσαίο` is in Thessaloniki (Karlovasi's village isn't catalogued), so it beats the known Samos `Καρλόβασι` (107877).
2. **Polluted forward-geocode hints.** For a bare ambiguous name Google's results merge several homonyms' components (root cause #4's merge is right for reverse geocoding, wrong here): `ΒΑΘΥ, ΒΑΘΥ, GR` → `["Εύβοια","Νομός Σάμου","Μήλος","Βαθύ"]`, and Google's *top* hit is Evia. `ΑΛΩΝΑΚΙ, ΚΑΡΛΟΒΑΣΙ` → `["Νομός Σάμου","Άρτα","Νέο Καρλόβασι","Αλωνάκι"]`; the stray `Άρτα` narrows the many `Αλωνάκι` nodes to the single Arta one and mechanism 1 accepts it. For `Λ-19`/`Λ-28` the **un-hinted** resolver gives the right `Σάμος » Καρλόβασι`; the hinted (admin/async) job overwrites it with Arta.
3. **Catalog gaps.** Samos has only `Βαθύ` 107876, `Καρλόβασι` 107877, `Πυθαγόρειο` 107879 — no `Αλωνάκι`, `Μεσαίο` or `Άγιος Κωνσταντίνος`.

**Tried and reverted:** "if the district's only match is in a different prefecture than the known city, use the city". It fixes samoshouse but the old-vs-new run over **all 4,126 properties changed 90 rows in 12 agencies, many of them regressions** (`Γλυφάδα / Άνω Γλυφάδα` → Komotini, `Κυψέλη / Νέα Κυψέλη` → Troizinia, `Πεύκη`→Trikala, `Δάφνη`→Sitia, `Αγία Παρασκευή`→Heraklion). Reason: the catalog's *city* node is often itself the homonym (bare municipality names aren't indexed when a homonym exists — `γλυφαδα` maps only to the Komotini village), so from two text labels alone the resolver cannot tell which one is right.

**Missing signal (not built):** an agency region prior — e.g. the dominant prefecture of the agency's other properties (samoshouse: 104/141 Samos), used only to break ties between candidate nodes. Needs a design decision; it changes behaviour for every agency.

**Before changing shared resolver logic, always run the old-vs-new diff over every `properties` row** (load `git show HEAD:…util.ts` as a temp sibling file, compare `resolveEstateWebLocationFromSources` per row, review every changed group). The spec alone passed 32/32 on the bad rule.

**Do not run the admin "Resolve EstateWeb locations" action on samoshouse rows** until this is resolved — the hinted job produces the Arta/Evia results above.

**Data fix applied 2026-09-19** (guarded transaction, dry-run first, per the #8/#9/#10 pattern): the 37 off-Samos `user_properties` (+ their 37 canonical `properties`, none shared with other users) set to `Σάμος » Καρλόβασι` 107877 (24), `Σάμος » Βαθύ` 107876 (6), `Σάμος » Πυθαγόρειο` 107879 (3) and the prefecture node `Σάμος` 603 (4 × `Άγιος Κωνσταντίνος`, which has no Samos catalog node); `pending_crm_update = true` on the user rows and a `property_history` entry (`UPDATED`, `estateweb_location_id`) on each canonical row. All 141 samoshouse properties are now under Samos. The CRM listings keep the old location until each is pushed (tracker has `auto_update_to_crm = false`, so use "Push to CRM").

---

## Root cause #12 — hints are soft, so coordinates that contradict EVERY text candidate were ignored (found 2026-09-21, fixing agency refs `16242`, `631`, `16327`, `16233`)

Four listings in **Φουρνή, Lasithi** (coords `35.2591, 25.6625`, city `Φούρνοι`, no district) had `estateweb_location_id = 107898` (`Νησιά Αιγαίου » Σάμος » Δήμος Φούρνων » Φούρνοι`); correct is `100216` (`Κρήτη » Λασίθι » Δήμος Αγίου Νικολάου » Φουρνή`). "Resolve EstateWeb locations" returned *unchanged*, although Google's reverse geocode was exact: `Κρήτη / Λασίθι / Δήμος Αγίου Νικολάου / Νεάπολη / Φουρνή`.

- The catalog calls the Lasithi village `Φουρνή`; `Φούρνοι` only names nodes in Samos, Argolida, Achaia, Evia, Phthiotida — none in Crete.
- `filterByPreferredPath` is **soft**: a hint segment that would empty the candidate list is skipped. Every Google segment contradicted every candidate, so all were skipped and `pickCanonicalCity` picked the smallest id → Samos. The last-resort branch that would have used Google's own `Φουρνή` was never reached, because the city step "succeeded".

### Fix
- `GoogleMapsService` also returns `prefectureSegments` — only `administrative_area_level_3` (the Περιφερειακή Ενότητα level in Greece). **Not** all admin segments: in Attica the *locality* `Ηράκλειο` equals the Crete prefecture's name.
- The job passes them as `googleCoordinatePrefectures` **only on the reverse-geocode (coordinates) path**. Forward-geocoded text is polluted by homonyms (#11), so it stays soft.
- `resolveEstateWebLocationFromSources` turns them into a **hard** `requiredPrefectureSegments` constraint (applied inside `filterByPreferredPath`, so every step sees it; the four Attica catalog prefectures count as one region), **only when the text is ambiguous**: `textCandidatePrefectures(city, district)` spans ≠ 1 prefecture. Coordinates are sometimes junk (Σικυώνα rows sit on a generic Athens-centre point, `Χανιά / Ακρωτήρι` has a point near Thessaloniki, `Κόρινθος` one in Patras); text that pins one prefecture wins over them.
- When the text finds nothing inside the required prefecture, the most specific Google segment (they are broad-to-specific) with a catalog node inside it is used, before the title patterns / last resort.
- `resolveByDistrict`'s "district is unique nationwide" fallback judges uniqueness **without** the hard filter; otherwise `Κέντρο` filtered down to Athens' `Παγκράτι » Κέντρο` beat `Πειραιάς - Κέντρο`.
- The synchronous creation-time resolver (no Google) is unchanged: 0 diffs over all rows.

### Old-vs-new diff (all 4,142 `properties`, real reverse-geocodes of all 2,555 distinct coordinates)
191 rows change when the job re-runs. Reviewed per group: nearly all fix a same-name wrong-region or coarse pick — `Φούρνοι` Samos→Φουρνή, `Κλίμα`/`Κάμιλα`/`Πιτσινιά` Heraklion town→Φαιστός villages, `… / Αρκάδι` Heraklion→Rethymno villages, `Θεολόγος Φθιώτιδας` Lasithi→Phthiotida, `Λιβάδι Παρνασσού` Arcadia→Boeotia, `Κρήτη` (id 4)→the specific village, `Ηράκλειο` listings whose titles say "Agios Nikolaos"→Agios Nikolaos. A few are neutral (junk coords where the old answer was wrong too, e.g. `Κάβος Ίσθμια` Aegina→Corfu). The regressions of earlier drafts (all admin segments as the constraint; no text-ambiguity guard; unique-district after hard filter) are spec cases now.

---

## Root cause #13 — two independent gaps: a missed re-check trigger, and multi-word municipality genitives (found 2026-09-29, fixing `user_properties.id = 20ed33be-8981-40e0-8b3a-715bcb41914b`)

Client reported: `user_properties.id = 20ed33be-8981-40e0-8b3a-715bcb41914b` (housemarket-realestate.gr ref `6280170`) had `estateweb_location_id = 99696` — **Αγία Παρασκευή, Δήμος Αρχανών Αστερουσιών, Heraklion, Crete** — for a listing whose source page clearly says **"Αγία Παρασκευή (Αθήνα - Βόρεια Προάστια)"**, i.e. the real Agia Paraskevi municipality in Athens' northern suburbs (confirmed by the description text: "5 λεπτά από το Μετρό Νομισματοκοπείο", the actual Athens metro station serving that suburb). Same shape of bug as the original one (a same-named homonym elsewhere in Greece), and, per the client, recurring across many properties with the same city text.

Two independent, compounding bugs, found by tracing this one property's full history:

**Bug A — the async re-check gate never re-fires when coordinates arrive later.** This property was `CREATED` with `city: "Αγία Παρασκευή"`, `district: null`, **no coordinates** — the synchronous resolver (no Google hint) ran, found only same-named homonyms nationwide, and picked the deepest one by tree shape (Crete), exactly the root cause #1 failure mode. Two days later a re-crawl added real coordinates (`37.97499, 23.73177`) for the first time — but the `'updated'` branch's re-check gate (`property-normalization.service.ts` / `user-properties.service.ts`, added in root cause #7's fix) only re-enqueues the async Google-hint job when `estateweb_location_id == null` or the `city`/`district` **text** changed. Coordinates newly appearing satisfies neither condition, so the one chance for the async job to self-correct via a real geocode was silently skipped — and once an id is set, the synchronous path is barred from ever touching it again (also root cause #7), so it would have stayed wrong forever.

### Fix
Both gates now also re-enqueue when latitude/longitude just went from `null` to set (`gotCoordinatesForTheFirstTime`) — the exact moment the resolver gains a scoping signal it didn't have before.

**Bug B — the catalog's genitive municipality names are often whole declined phrases, not one word.** Root cause #9 added bare-municipality-name indexing and a single-word `-ος → -ου` genitive guess (`guessGreekGenitive`), but "Αγία Παρασκευή" (Athens) is catalogued only as `"Δήμος Αγίας Παρασκευής"` — a two-word genitive phrase (`-η → -ης`), a declension pattern #9 explicitly didn't add ("ambiguous... would risk false matches" as a *standalone* guess). With no route to that node, `city: "Αγία Παρασκευή"` alone still fell through to the same-named homonym pick, even with a correct Google region hint (none of the 36 nationwide "Αγία Παρασκευή" neighborhood nodes carry region "Αθήνα" — only the municipality node itself does, and it wasn't reachable at all).

### Fix
`guessMunicipalityGenitivePhrase()` (new): guesses a nominative→genitive phrase per word (`-ος→-ου`, `-η→-ης`, `-α→-ας`; abbreviated tokens like `"Αγ"` pass through unchanged, since `PLACE_WORD_ABBREVIATIONS` already unifies `"Αγία"/"Αγίας"/"Άγιος"/...` before this runs) and only trusts the result when it lands on a *real* `"Δήμος <X>"` node — never a blind guess. Getting this to actually fix the bug (not just add a matching label) needed several more changes, all found by running the full old-vs-new diff every fix in this file is supposed to run before landing:
- The municipality guess must not compete as just another label in the existing "first label with any match wins" **city** loop — that either buries it behind the raw label's own (wrong) homonym match, or, given priority, coarsens already-correct matches (e.g. "Νέα Σμύρνη" → its own specific town node) down to the bare municipality. It's tried as an explicit, separate step: only overrides the raw match when that match has **no relation** (not equal to, not a descendant of) the guessed municipality.
- Even then, a specific-but-conflicting region in the text must win over the guess (e.g. district "Ρέθυμνο" with city "Καλλιθέα" — "Καλλιθέα" is a unique municipality name nationwide, but in Athens, ~700km from the actual Rethymno/Crete listing). `textMentionsConflictingPrefecture()` hard-blocks the override whenever the city/district text names a real catalog prefecture the guessed municipality isn't in. Written without `\b`-delimited regex: **`\b` never matches around Greek letters in a non-Unicode JS regex** (Greek letters aren't `\w`), so `REGION_PATH_HINTS`-style patterns silently never fire for Greek text at all, only for the Latin alternatives already in that list — a separate, pre-existing gap noted here but not fixed more broadly (out of scope for this fix; worth revisiting since it means every existing Crete-region regex hint has been dead for Greek input this whole time).
- The same guess was *not* added to the **district** label list (`expandDistrictLabels`), unlike every other genitive-guess helper in this file. `resolveByDistrict` returns on the first district label with any match, and its "district is unique nationwide" fallback is unscoped by city when nothing city-scoped matched — so a district-side municipality guess can win that fallback with **no relation to the actual city at all**. Caught live during this fix's own backfill verification: `city: "Νεοχωρούδα"` (a real Thessaloniki-area village, no relation to Athens) / `district: "Καλλιθέα"` was already correctly resolved (`114977`, Thessaloniki's own "Καλλιθέα") by an earlier async run; adding the district-side guess would have overridden it to Athens' unrelated "Δήμος Καλλιθέας" (`90019`) with no coordinates on that row to ever self-heal it back. Left out of scope; the primary bug (bare city, no district) doesn't need it.

### Old-vs-new diff (all 5,635 `properties`, synchronous resolver, no Google hints)
105 rows change (after dropping the district-side addition above). Reviewed every group: same-named-homonym-to-correct-municipality fixes (Αγία Παρασκευή — the large majority of the set — plus Καλλιθέα, Ερέτρια, Αγία Βαρβάρα, Άγιος Δημήτριος, Γλυφάδα, Πέλλα, Πολύγυρος, and others), plus two previously-unresolved cities now resolving (Επίδαυρος, Μύκονος). Spot-checked several against real coordinates/titles from the source listing where available (Άνω Γλυφάδα: coordinates confirm Athens, not the earlier-flagged Komotini homonym; Καλλιθέα Ρεθύμνου: correctly held back from the Athens guess by the new conflicting-prefecture guard). One diffed row (`Καλλιθέα`/`Άνω Πόλη`, real coordinates in Thessaloniki) already carries a *different*, already-correct value in production (`114977`, set by the async Google-hint job) — confirmed the async path's hard `requiredPrefectureSegments` constraint still overrides the new municipality guess correctly when real coordinates disagree with it, so this diff (synchronous-only) doesn't represent a production regression for that row.

### Backfill run 2026-09-29
Fixed the reported property directly first (`Property` + its `UserProperty`, guarded transaction, `property_history` entry, `pending_crm_update = true`). For the broader sweep, rather than writing the synchronous-only diff values directly (risking exactly the kind of regression the `Καλλιθέα`/`Άνω Πόλη`/Thessaloniki case above shows — a row a fresh geocode may already have superseded), every row in the 105-row diff was **re-resolved through a live Google reverse-geocode of its own coordinates** (same `adminSegments`/`prefectureSegments` extraction and hard-prefecture-constraint logic as the real async job) before writing anything, and only rows where the current DB value still disagreed with that Google-verified answer were updated: **25 `Property` rows corrected** (22 with a tracked `UserProperty`, updated alongside; the other 3 have no tracked `UserProperty`), each with a `property_history` entry and `pending_crm_update = true` on the `UserProperty` side. The other 80 rows in the diff were left untouched — for each, either the row's current DB value already agreed with the best available answer (no-hint guess when no coordinates existed to check further, or the Google-verified answer when they did), so there was nothing to change.

---

## Root cause #14 — Google never names the catalog's South Aegean group prefecture (found 2026-10-01, client-reported via Κώστας Πετράκης)

Client reported 3 properties where a nationwide-homonym city text resolved to the wrong region, with the same shape as the original bug (#1/#8/#9/#13): `Property.id = 5c968f5a-2c94-4dcb-805c-7439832b4560` — city `Γαλήνη`, real coordinates in **Naxos** (confirmed: title literally says "Ναξος", coordinates `37.1194690, 25.4179000`) — had `estateweb_location_id = 100598`, the same-named **Chania, Crete** node, ~190km away. Two more reported examples turned out to be a *different*, already-fixed bug class never backfilled (see "Known-stale backfill" below), but this one was genuinely new.

Live-probed Google's reverse-geocode for the real coordinates:
```
37.1194690,25.4179000 → administrative_area_level_3 = "Νάξος"   (never "Κυκλάδες")
37.4270380,24.9144593 (a Syros property) → administrative_area_level_3 = "Σύρος"  (never "Κυκλάδες")
36.4341,28.2176 (Rhodes) → administrative_area_level_3 = "Ρόδος"  (never "Δωδεκάνησα")
```
Every prior fix in this doc (root causes #1/#2/#10/#12) relies on Google's `administrative_area_level_3` already equalling the catalog's prefecture-level path segment (`path[1]`) — true for Crete (`"Χανιά"`), the mainland (`"Θεσσαλονίκη"`), and even single-island prefectures (`"Σάμος"`, root cause #10). It is **not** true for the two multi-island South Aegean groups: the catalog calls them `"Κυκλάδες"`/`"Δωδεκάνησα"` (old-nomos-era umbrella names covering ~18/~15 municipalities each), but Google's modern administrative hierarchy for a specific island's coordinates jumps straight from the broad region (`"Περιφέρεια Νοτίου Αιγαίου"`) to the island/municipality name itself — it never names the umbrella group at any admin level. None of Google's hint segments then share any text with the correct catalog path, so both `requiredPrefectureSegments` (hard, root cause #12) and `preferredPathSegments` (soft) stay empty/non-matching, and the resolver falls through to `pickMostSpecific()`'s depth/id tie-break — which for `Γαλήνη` (12 same-depth nodes nationwide) picks whichever homonym has the smallest catalog id, Chania, by pure accident of catalog insertion order.

### Fix
`ISLAND_PREFECTURE_SEGMENT` (new, `estateweb-location-lookup.util.ts`): a curated table mapping every Cyclades/Dodecanese island's bare nominative name (verified against the catalog's own municipality list under `Νησιά Αιγαίου » Κυκλάδες`/`» Δωδεκάνησα`, cross-checked live against Google for Naxos/Paros/Mykonos/Rhodes/Santorini) to its catalog group-prefecture segment. Wired into `expandGoogleAdminSegment()` so both the reverse-geocode bare-name case (`"Νάξος"` with no prefix) and the legacy forward-geocode `"Νομός "`-prefixed case get the same treatment uniformly — this benefits both `preferredPathSegments` (soft) and `requiredPrefectureSegments`/`coordinatePrefectures` (hard) since both consume its output. Single-island prefectures (Σάμος/Λέσβος/Χίος) don't need this — already covered by root cause #10.

### Old-vs-new diff (1,360 properties in the South Aegean bounding box, 916 distinct coordinates, real live reverse-geocodes of every one)
Scoped to the South Aegean bounding box rather than the full catalog: this fix only ever adds a new candidate when Google's response contains one of ~36 curated exact island-name strings, which is geographically impossible outside that region — the synchronous creation-time resolver never passes Google hints at all, so it is provably unaffected everywhere. **3 of 1,360 properties changed:**
- `5c968f5a...` (Γαλήνη, Naxos): `100598` (Chania) → `107207` (the real Naxos node). **Genuine fix, backfilled.**
- `10134e64...` (Χρυσοπηγή, district literally `"Χρυσοπηγή (Σίφνος)"`): `113826` (Heraklion, Crete) → `107397` (the real Sifnos node, matching the island named right in the source text). **Genuine fix, backfilled.**
- A Syros property: `107399` (Άνω Σύρος) → `107400` (Ερμούπολη) — both nodes are in the *same, already-correct* municipality (`Δήμος Σύρου-Ερμουπόλεως`); tracing it, this is the pre-existing "scan Google segments backward, return the first match" last-resort branch (unrelated code, predates this fix) now activating for Syros for the first time because `requiredPrefectureSegments` is non-empty where it wasn't before, and preferring Google's `locality` (postal/mailing town) label over the more precise `administrative_area_level_5` value for this specific coordinate. Same-region, not a regression — **left unwritten**, matching the precedent set by root cause #13's own "lateral, neither clearly wrong, excluded from the write" rows. (The existing regression test for this exact Syros case, from root cause #8, still passes unchanged — it doesn't pass `googleCoordinatePrefectures`, so the hard-constraint branch this nuance lives in was never exercised by it.)

### Backfill run 2026-10-01
All 3 changed rows verified independently live against Google before writing (same discipline as every prior backfill). Wrote the 2 genuine fixes (`Property` + linked `UserProperty`, `property_history` entry, `pending_crm_update = true`); left the Syros row untouched per the reasoning above. Regression tests added in `estateweb-location-lookup.util.spec.ts` (the real Naxos case with live-verified Google segments, plus a synthetic Dodecanese case using `Λουτρά`/Nisyros to prove the general island-group mapping, not just Cyclades).

### Known-stale backfill (found while investigating this report, not fixed)
Two of the client's 3 reported properties (a Λαγκαδάς/Θεσσαλονίκη plot wrongly resolved to a same-named Chania village, and an Apokoronas villa wrongly resolved to a same-named village in Magnesia) turned out **not** to be a resolver bug at all: both already resolve correctly through the *current* code (verified live and with zero Google hints, respectively) — they were just never reprocessed since **2026-08-31**, when they got their wrong value from the pre-fix resolver that predates root causes #2/#3/#6/#9. The doc's own "Known follow-ups" section already flagged this exact gap ("No backfill has been run yet against the fixed pipeline... Run the admin bulk action... to backfill the rest") and it was never actioned. Manually fixed the 2 reported instances plus a 3rd (`445b1ab8`/`2e3b26bb`) found by searching for the same wrong id, all verified live against Google before writing. **The general sweep — re-running the resolve job against every property still holding a result computed before whichever fix would have corrected it — has still not been run**, and is very likely affecting many more properties across other agencies, not just this client's.

---

## Root cause #15 — text that only pins a prefecture never steps down to a municipality (found 2026-10-08, staspro / Halkidiki)

Client (tracker `d00081a5-7d28-4be8-8427-11b3b564a5a5`, agency staspro, `SourceAgency.city = 'Θεσσαλονίκη'`) reported that many Halkidiki listings in the CRM had a prefecture but no municipality. 81 of their 498 pushed properties sat on a prefecture-level node (`level 1`); 76 of them were `512 "Μακεδονία » Χαλκιδική"`, almost all with city `Χαλκιδική` / district `Παλλήνη`.

- "Παλλήνη" is the Kassandra peninsula's other name and the pre-2011 municipality now merged into Δήμος Κασσάνδρας. The catalog's only Παλλήνη is the **Athens** suburb (`101058`).
- Creation-time (no Google): the district is unique nationwide, so `resolveByDistrict`'s unique-district fallback put these rows in **Athens**. The async job's hard prefecture constraint (#12) then pulled them back to `512` — right region, but just the prefecture.
- Every row had real coordinates, and Google named the municipality (`administrative_area_level_4 = "Κασσάνδρα"`) and the village (`"Τοπική Κοινότητα Πευκοχωρίου"`). Nothing used them: once the city step returns a node, Google segments only act as soft filters among *candidates*, and the candidate here was the prefecture itself.

### Fix (`estateweb-location-lookup.util.ts`)
- `refineBarePrefecture()`, applied to the city/district/rawLocation result in `resolveEstateWebLocationFromSourcesCore`, only when that result is a prefecture node. It only ever moves to a node **inside** that prefecture.
  - From coordinates (`googleCoordinatePrefectures` present, i.e. the reverse-geocode path only; forward geocoding stays out per #11): only Google segments after the coordinates' own admin_level_3 entry (Athens has a neighborhood called "Αττική"). Municipality = first segment naming a level-2 node (`"ΔΗΜΟΣ ΓΛΥΦΑΔΑΣ"`, or a genitive guess: `"Κασσάνδρα"`→`κασσανδρας`, `"Δάφνη-Υμηττός"`→`δαφνης-υμηττου`), else the first segment whose nodes all sit in one municipality. Village = only from `Τοπική/Δημοτική Κοινότητα <genitive>` (multi-word, per-word rewrites), never from plain locality names: the merged reverse results put `"Παλιούρι"` on every Kassandra point.
  - Skipped if the coordinates' prefecture is a different catalog prefecture, or if the text names a place in this prefecture that lies in another municipality (`Αθήνα / Αγία Παρασκευή` with a generic point in Άλιμος).
  - Otherwise `PREFECTURE_AREA_ALIASES` (curated, per prefecture): `χαλκιδικη: { παλληνη, 'δημος παλληνης χαλκιδικης' } → 50301`.
- `resolveEstateWebLocation` stops at the prefecture the city names when the district is one of those aliases and no other district part names a place there, so "Χαλκιδική / Παλλήνη" no longer lands in Athens at creation ("Χαλκιδική / Παλλήνη, Πευκοχώρι" still gives Πευκοχώρι).

### Old-vs-new diff (all 6,991 `properties`)
- Synchronous: 104 rows, all `Χαλκιδική / Παλλήνη`: Athens Παλλήνη → Δήμος Κασσάνδρας.
- Reverse-geocoded (158 candidates whose stored or text result is prefecture-level, real Google calls): 113 rows, every one prefecture → municipality/village in the same prefecture. Two (`Αθήνα / Γκύζη - Πεδίον Άρεως`, descriptions say "Γκύζη - Άρειος Πάγος") have a junk shared point in Άλιμος; the text guard misses them because the catalog spells it "Πεδίο Άρεως", so they were set by hand to `113237`.

### Backfill run 2026-10-08
112 `Property` rows + their 112 `UserProperty` rows (guarded on the old value, one transaction), `property_history` entry per property, `is_modified = true` + `pending_crm_update = true` on the user rows. 108 staspro (79 already in the CRM; tracker `auto_update_to_crm = false`, so they need "Push to CRM"), 2 realeze, 1 bitsimis. Not written: one `realty properties` row (`Αθήνα / Κέντρο Παγκρατίου`) that stores `Παγκράτι, Δήμος Καλαβρύτων` (Achaia) — wrong, but a stale value from before #12, not this fix.

**Still prefecture-only in that client's list:** `Πειραιάς / Πειραιάς` (Google's `"ΔΗΜΟΣ ΠΕΙΡΑΙΩΣ"` ≠ catalog name) and `Ν. Κέρκυρας / Κέρκυρα` (Google only gives `"Δημοτική Κοινότητα Κερκυραίων"`).

---

## Enhancement — SourceAgency.city as a regional scope (added 2026-09-30)

The recurring "same-named homonym elsewhere in Greece" failure mode (root causes #1/#8/#9/#12/#13) all share one property: the resolver has no idea an agency only ever lists in one metro area, so every guess is made from the property's own text/coordinates alone, nationwide. Root cause #11 flagged this as a missing signal ("an agency region prior... needs a design decision") and a *hard*, unconditional version of it was tried there and reverted — it fixed samoshouse.gr but regressed 90 rows across 12 other agencies, because forcing every candidate into one region breaks the (real, if small) tail of listings an agency carries outside its usual area.

`SourceAgency.city` (`api/prisma/schema.prisma`) already existed as an admin-editable field (`app/src/pages/admin/agencies/components/agency-form.tsx`, labelled "City", placeholder "Athens") but was pure display metadata — populated with `''` for all 21 agencies in production, read nowhere in the resolution code. This wires it in, safely, as an opt-in per-agency scope instead of a global rule:

**Design — scoped-first, unscoped-fallback, never blank.** `resolveEstateWebLocationFromSources` (`api/src/integrations/estateweb/utils/estateweb-location-lookup.util.ts`) takes a new optional `agencyCity` field. When set, `resolveAgencyPrefectureSegments()` resolves it to a catalog prefecture segment (path[1]) via the exact same free-text resolution a property's own city/district goes through — works whether the admin enters a prefecture-level name ("Αθήνα") or a specific city/neighborhood within it ("Χαλάνδρι"), since both land in the same prefecture. Resolution is then tried **once, hard-restricted** to that single prefecture (every stage — district, city, rawLocation, title patterns, and the last-resort fallback — only considers candidates inside it, via the pre-existing `requiredPrefectureSegments` mechanism from root cause #12, now force-set instead of conditionally derived from Google coordinates for this pass). If that scoped attempt returns nothing, the function falls through to the **exact same unrestricted resolution as when `agencyCity` is omitted entirely** — a second, ordinary call with no forced restriction. A scoped miss can therefore never make the result worse or null-er than before (a missing id blocks the CMS push — root cause #8); it can only improve a wrong-region homonym pick into a correct in-region one when the agency scope has an answer.

This sidesteps root cause #11's regression by construction: the hard restriction is *retried unscoped on failure*, not applied unconditionally. A genuinely out-of-region listing (checked against real data before implementing this — housemarket-realestate.gr, the agency behind root cause #13's bug, is ~99% Attica across 200+ neighborhood-level city strings, but also carries ~15–20 real listings in Crete/Cyclades/Epirus/etc.) simply fails the scoped pass (the place name doesn't exist anywhere in the agency's declared prefecture's catalog subtree) and falls through to the unscoped pass, resolving exactly as it did before this feature existed.

**Where it's wired in** (both call sites are additive — nothing changes for an agency with no `city` set):
- Synchronous creation/re-crawl resolver: `buildPropertyRecord()` (`api/src/modules/properties/utils/property-normalization.utils.ts`) takes a new `agencyCity` parameter; `applyNormalizedResults()` (`api/src/modules/properties/services/property-normalization.service.ts`) fetches `SourceAgency.city` once per call (a single indexed PK lookup) and passes it through. This is what lets an agency's listings resolve correctly *immediately at creation*, before any Google hint ever runs.
- Async Google-hint job (`api/src/modules/user-properties/services/resolve-estateweb-location-job.service.ts`): a new `resolveAgencyCity()` helper walks `Property`/`UserProperty` → `PropertySourceLink` (preferring `is_primary_source`) → `SourceProperty` → `SourceAgency.city`, run in parallel with the existing Google geocode call.
- Deliberately **not** wired into `EstateWebCmsSyncAdapterService.resolveLocationId()`'s rare last-resort fallback (only reached if `estateweb_location_id` is somehow still null at push time, which the pipeline above already keeps close to never) — out of scope for this change; would need an extra DB round-trip added to the push hot path for a branch that should essentially never execute.

Regression tests in `estateweb-location-lookup.util.spec.ts` (describe block `"agencyCity scoping (SourceAgency.city)"`): scopes the root cause #1 flagship case (`Νέο Ψυχικό` / `Αγία Σοφία`) to the correct Athens node via `agencyCity: 'Αθήνα'` alone, no Google hint needed; confirms a blank/omitted `agencyCity` is a no-op; confirms a genuine out-of-region listing (`Ιεράπετρα` on an `'Αθήνα'`-scoped agency) still resolves to its real Crete node via the unscoped fallback, not null and not forced into Attica; confirms an already-correctly-resolving property (`Χανιά`/`Αποκορώνας`) is unaffected by an unrelated agency scope.

### Two more resolver bugs found while enabling this for housemarket-realestate.gr (2026-09-30)

Dry-running the "old-vs-new diff" this feature's own design requires (per the discipline above) against housemarket-realestate.gr's 1,300 properties surfaced two more pre-existing resolver bugs -- both *latent*, never triggered by anything before because nothing had ever hard-restricted the candidate pool to one prefecture before. Whole-catalog diffs (5,639 properties, unscoped, no `agencyCity`) confirmed both fixes are inert outside the new agency-scoped pass.

**Bug 1 — `resolveRelatedToAnchor`'s municipality match never handled the genitive/nominative gap.** A `"Village (Municipality)"`-shaped district (e.g. `"Παράδεισος (Αγία Παρασκευή)"`, all over housemarket-realestate.gr's data) goes through `resolveParentheticalDistrict`/`resolveRelatedToAnchor` -- a separate code path from root cause #13's `guessMunicipalityGenitivePhrase` bare-city fallback. `resolveRelatedToAnchor`'s `matchesCity` check only ever compared the anchor's exact nominative form (`"Αγία Παρασκευή"`) against a candidate's own path segments -- but a real child of that municipality carries it in GENITIVE form in its own path (`"Δήμος Αγίας Παρασκευής"`), so the correct candidate (`101166`, `"Παράδεισος"`, an actual child) never looked "related" to its own anchor. With the Attica-hard-restricted candidate pool now small enough to expose it, this fell through to `"Δήμος Αχαρνών » Αγία Παρασκευή"` (`101199`) -- a *different*, unrelated small settlement that also happens to be named exactly "Αγία Παρασκευή", inside a different Attica municipality. **Fix:** also check the candidate against `MUNICIPALITY_PREFIX + guessMunicipalityGenitivePhrase(anchorName)` (the same helper root cause #13 built, re-prefixed to match the raw path-segment text `matchesCity` compares against verbatim). Whole-catalog diff: 54 rows change, all housemarket-realestate.gr, all correcting a same-named-homonym-elsewhere pick (Crete/Ioannina/Trikala) to the real Athens neighborhood.

**Bug 2 — the resolver's own "never return null" last-resort fallbacks fired *inside* the agency-scoped pass, using a forced (not evidenced) prefecture as if it were real evidence.** Two production cases, both real, unique, unambiguous matches genuinely OUTSIDE Athens:
- City `"Μαλεσίνα"` / district `"Θεολόγος"` (Φθιώτιδα, Central Greece): the agency-scoped pass found no confident match in Athens, but its own `requiredPrefectureSegments`-driven "Google named the real place" fallback (built for root cause #12, meant only for when REAL per-property coordinates independently disagree with ambiguous text) fired anyway -- using `agencyCity`'s forced restriction as if it were that same kind of real evidence -- and picked the bare, low-confidence `"Αθήνα"` node (`900`) instead of falling through to the unscoped pass's correct, specific answer.
- City `"Άγιος Κωνσταντίνος"` / district `"Φθιώτιδα"` (the prefecture name spelled out directly in the text): worse, this wasn't even a last-resort pick -- `"Άγιος Κωνσταντίνος"` is common enough to ALSO exist inside Attica (Τροιζηνία), so the agency-scoped pass found a genuinely *confident* match there, silently overriding a real, different, explicitly-named prefecture in the property's own text.

**Fix, two parts:**
1. Gated both of `resolveEstateWebLocationFromSourcesCore`'s "never return null" branches (the `requiredPrefectureSegments`-driven Google-segment loop, and the final `preferredPathSegments`-driven broad-region fallback) behind `!forcedRequiredPrefectureSegments` -- during the agency-scoped pass, only a genuine district/city/rawLocation/title-pattern match counts as a "hit"; anything else properly falls through to the unscoped pass, which has its own, already-battle-tested last-resort logic.
2. Added a `textMentionsConflictingPrefecture` guard (the same helper root cause #13 already uses for `guessMunicipalityGenitivePhrase`) to the `resolveEstateWebLocationFromSources` wrapper itself: skip the agency-scoped pass entirely when the property's own city/district text already names a real, different catalog prefecture.

Both fixes are covered by regression tests in the `"agencyCity scoping"` describe block.

### Backfill run 2026-09-30 (housemarket-realestate.gr)

Set `SourceAgency.city = 'Αθήνα'` for housemarket-realestate.gr (`6fc679b1-328f-4a53-845a-b260b779c775`, 1,300 properties, 1,299 with coordinates, 1 tracker with `auto_update_to_crm = true`). Same dry-run-then-verify discipline as every prior backfill: a text-only diff (no Google hints) against all 1,300 properties found 286 candidates; every candidate was re-resolved through a **live Google reverse-geocode of its own coordinates** (deduped to 110 distinct coordinate pairs among the candidates -- most of housemarket's listings share a handful of fallback coordinates rather than having a unique geocode each) plus `agencyCity`, mirroring the real async job exactly; only rows where the Google-verified answer still disagreed with the current DB value were kept, leaving 67. Manually reviewed all 67 by region-transition pattern -- 65 were an unambiguous wrong-macro-region → Athens/Attica fix (Crete 40, Thrace/Xanthi 18, Epirus/Ioannina 4, Thessaly/Trikala 3); the remaining 2 were same-region "lateral" changes (a broader-vs-narrower node, neither clearly wrong) and were deliberately excluded from the write as unnecessary risk for zero benefit.

**Result:** `SourceAgency.city` set; **65 `Property` rows corrected** (62 with a tracked `UserProperty`, updated alongside with `is_modified = true` + `pending_crm_update = true`, matching the real async job's own field-writes exactly; 3 have no tracked `UserProperty`), each with a `property_history` entry (`UPDATED`, `estateweb_location_id`, `crawl_run_id: null`). Post-write query confirmed zero remaining housemarket-realestate.gr properties pointing at a wrong-region "Αγία Παρασκευή" homonym.

**Not done:** no sweep of any *other* agency. Populating `SourceAgency.city` for a given agency requires the same "run the old-vs-new diff over every property of that agency" discipline every fix in this doc has required before landing (see root cause #11's reverted regression) -- housemarket-realestate.gr was the first, clearly-single-region case; genuinely multi-region/national agencies should stay blank.

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
| `api/src/integrations/estateweb/utils/estateweb-location-lookup.util.ts` | Resolver (`resolveEstateWebLocationFromSources`), accepts `googleAddressSegments` and `agencyCity` |
| `api/src/modules/properties/utils/property-normalization.utils.ts` | `buildPropertyRecord()` -- synchronous creation/re-crawl resolution, accepts `agencyCity` |
| `app/src/pages/admin/agencies/components/agency-form.tsx` | Admin-editable `SourceAgency.city` ("home region") field |
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
- **`REGION_PATH_HINTS`'s Greek regexes are dead code** (found while fixing root cause #13): every pattern there is `\b<greek text>\b`, and `\b` never matches around Greek letters in a non-Unicode-mode JS regex (they aren't `\w`), so these have only ever matched the Latin transliteration alternatives in the same list (`crete`, `heraklion`, ...), never the Greek text they were presumably meant to catch. Not fixed as part of #13 (needs its own old-vs-new diff, same discipline as every other resolver change here) — likely explains other latent mis-resolutions in Crete-adjacent text that this doc hasn't traced yet.
- **A district-side equivalent of root cause #13's municipality-genitive guess was tried and reverted** (see root cause #13's fix notes) — it fixed a few more cases but also regressed at least one real property (`Νεοχωρούδα`/`Καλλιθέα`) by resolving a district name to an unrelated municipality with no city-scoping at all. Doing this safely would need a district-side version of the same conflict guard used on the city side (or a require-related-to-city check), not attempted here.
