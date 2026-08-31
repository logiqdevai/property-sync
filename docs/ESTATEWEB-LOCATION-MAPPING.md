# EstateWeb Location Mapping — Handoff

**Date:** 2026-07-19 (handoff written) · **Implemented:** 2026-08-30  
**Status:** ✅ Implemented — deterministic name/alias/hierarchy matcher against a committed location catalog, with manual override UI  
**Related:** CMS sync push fails when `estateweb_location_id` is null

**⚠️ Accuracy follow-up (2026-08-31):** the deterministic matcher described below shipped
with several real accuracy bugs — it resolved plausible-looking but wrong ids for
properties across many agencies (homonym Greek place names scoped to the wrong region).
See **`docs/ESTATEWEB-LOCATION-ACCURACY-FIXES.md`** for the full root-cause writeup, the
Google-geocoding-based fix, and a re-crawl regression bug found while verifying it — read
that doc if you're debugging a wrong `estateweb_location_id` again.

---

## Implementation summary (2026-08-30)

Everything under "Proposed solution" below was built as described. Kept for historical context; the "Blocked" framing further down no longer applies.

- **Catalog**: `api/src/integrations/estateweb/constants/estateweb-locations.data.json` (full internal location tree: `id`, `parent_id`, `name`, `level`, `path`, `is_city`), loaded via `estateweb-locations.constants.ts` into `ESTATEWEB_LOCATIONS`.
- **Resolver**: `api/src/integrations/estateweb/utils/estateweb-location-lookup.util.ts` — normalizes Greek text (diacritics/case, abbreviations like `Αγ.`↔`Άγιος`, genitive stripping), applies a `CITY_ALIASES` map (incl. Latin→Greek transliteration, e.g. `heraklion`→`ηρακλειο`), matches against the catalog, then disambiguates homonyms via ancestor/path hierarchy and region hints from title/description, preferring the most specific match and falling back to the broader region node instead of returning null. Entry points: `resolveEstateWebLocation(city, district, hints)`, `resolveEstateWebLocationFromSources({city, district, rawLocation, title, description})`. Tests: `estateweb-location-lookup.util.spec.ts`.
- **Wired into normalization**: `api/src/modules/properties/utils/property-normalization.utils.ts` calls `resolveEstateWebLocationFromSources` and persists the result as `estateweb_location_id` on `Property` / `UserProperty` (an AI-supplied id, if already present, is respected).
- **Push validation unchanged**: `estateweb-cms-sync-adapter.service.ts` still asserts the field is present before pushing.
- **Manual override UI**: `app/src/pages/dashboard/properties/components/estateweb-location-picker-modal.tsx` lets a user browse/search the same catalog and override the auto-resolved id when the matcher gets it wrong.

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
