# EstateWeb Duplicate Properties — Investigation & Cleanup Summary

Session date: 2026-08-13 to 2026-08-14

## 1. How this started

Investigating a single property (`edc12a22-fa40-4307-a064-a5d88cef8596`, internal id `1987`) that had EstateWeb code `5022` instead of matching its own id. Traced to a scraper bug: cretahouses.gr's scraped property ids sometimes carried a leading `#` (e.g. `#1987`), and the EstateWeb push code-validation regex rejected the `#`-prefixed value outright instead of stripping it, silently falling back to a different value.

**Root cause fixed:**
- `api/src/integrations/crawler/utils/crawler.utils.ts` — added `stripIdPrefix()`; scraped ids now have leading non-alphanumeric characters stripped before being used as `property_id`/`internal_id`.
- `api/src/integrations/estateweb/services/estateweb-cms-sync-adapter.service.ts` — `resolveEstateWebCode()` now sanitizes the candidate code instead of discarding it when it fails validation.

## 2. cretahouses.gr code-alignment migration

Live migration was scoped strictly to cretahouses.gr per explicit instruction. Audited all 159 cretahouses `UserProperty` records, found many EstateWeb codes misaligned with the correct `property_id`/`internal_id`, and pushed the correct codes.

**Incident (disclosed immediately when it happened):** the first safety-test PATCH used a minimal payload (`{id, type_id, scope_id, location_id, code}`) on property `54611`. EstateWeb's PATCH endpoint is **not a true partial update** — any field omitted from the payload resets to its default. This wiped price, description, ads, sites, metadata, lat_lng, and show_map_on_site on that one property. Recovered the exact pre-damage values from the captured diff log, rebuilt a full restoration payload, and verified byte-for-byte restoration via re-fetch comparison.

**Resulting safe-update rule**, extracted into a reusable utility used everywhere since:
- `api/src/integrations/estateweb/utils/estateweb-full-update-payload.util.ts` — `buildEstateWebFullUpdatePayload()` round-trips **every** field from the current GET response before any PATCH, so nothing is ever silently reset again.

153 of 159 codes were migrated cleanly in the first pass; 6 properties couldn't be corrected immediately because another EstateWeb record already owned the target code.

## 3. Mass EstateWeb duplication discovered (cretahouses)

While migrating codes, discovered many cretahouses properties existed **2–3 times** on EstateWeb (one linked to our system, one or two orphaned copies with no local record). Investigated and quantified: 159 real cretahouses properties, but EstateWeb had significantly more records due to duplicate CREATE pushes over time. Root cause at the time was attributed to the `#`-prefix code mismatch (fixed above), which made the reconciliation step fail to find the existing EstateWeb record by code and fall through to creating a new one on every retried sync.

Generated `cretahouses-estateweb-duplicates.txt` (159-listing report) and `cretahouses-estateweb-code-collisions.txt` (the 6 unresolved collisions). The user manually deleted the legacy stub duplicates via a new admin tool (see §4), which freed up their codes; the correct codes were then pushed onto the 6 real, crawler-linked properties, verified via before/after field comparison (price, description, ads, sites, images all unchanged, only `code` moved).

## 4. Admin tooling built: "Manage EstateWeb properties by code"

New feature on `/dashboard/properties` → Actions: a modal to bulk-manage orphaned EstateWeb properties that have no matching local record, since they can't be reached through the normal per-UserProperty UI.

- Pick an EstateWeb integration, paste in property codes (or ids — see below), choose an action:
  - **Update site placements** — apply a site selection to every matched property (e.g. unpublish orphans everywhere).
  - **Delete properties** — permanently delete every matched property from EstateWeb (irreversible; gated behind a confirmation dialog).
- Runs as a BullMQ background job (one job per property) since a paste of hundreds of codes, each needing a live HTTP round trip, would exceed any request timeout. Progress is tracked via the existing `job_logs` admin jobs UI.

Backend: `api/src/modules/estateweb/admin-estateweb-properties.{service,controller}.ts`, two new queues (`estateweb-bulk-sites-by-codes`, `estateweb-bulk-delete-by-codes`), processors, and job-result interfaces. Delete endpoint uses `DELETE https://app.estateweb.gr/api/property/:id` (confirmed correct, response is a number).

**Follow-up fix — code vs. id ambiguity:** the delete-by-code resolution only kept the *first* EstateWeb record it saw for a given code, so when two properties genuinely shared a code (the duplicate case this tool exists to clean up), it could silently target the wrong one. Added an `identifier_type: 'code' | 'id'` option end-to-end (DTOs, service, frontend picker) — `id` mode skips the code lookup entirely and treats the pasted values as EstateWeb's own numeric property ids (from the property URL), which uniquely and unambiguously target one record. The modal now has a "Code / ID (from EstateWeb URL)" toggle next to the sites/delete toggle.

## 5. Duplicate problem exists beyond cretahouses

User discovered the same symptom on `pagalos-trust`. Investigated read-only and found it's a **different, more general reconciliation bug**, not specific to cretahouses' `#`-prefix issue — pagalos-trust's ids never had that prefix, and the local database was clean (no local duplication), but EstateWeb itself had far more records than we track.

**Full discovery pass across all 10 tracked agencies** (local count vs. live EstateWeb count):

| Agency | Local | EstateWeb | Extra | Duplicate codes | Duplicate records | Orphan records |
|---|---:|---:|---:|---:|---:|---:|
| pagalos-trust | 95 | 167 | +72 | 51 | 102 | 72 |
| samson-homes | 98 | 132 | +34 | 8 | 17 | 34 |
| euroland-crete | 594 | 601 | +7 | 7 | 14 | 9 |
| bitsimis-real-homes | 474 | 477 | +3 | 2 | 4 | 4 |
| nikiestate | 96 | 97 | +1 | 0 | 0 | 1 |
| bougla | 53 | 52 | −1 | 0 | 0 | 0 |
| cretahouses | 159 | 159 | 0 | 0 | 0 | 0 |
| creta-invest | 496 | 496 | 0 | 0 | 0 | 0 |
| domilux | 40 | 40 | 0 | 0 | 0 | 0 |
| tsimedogiannis | 158 | 158 | 0 | 0 | 0 | 0 |

5 of 10 agencies affected, dominated by pagalos-trust and samson-homes.

## 6. Distinguishing "duplicate records" from "orphan records"

- **Duplicate records** = every EstateWeb record sharing a `code` with another, *including* the legitimate copy being kept.
- **Orphan records** = records with no matching local `integration_property_id` at all — the actual junk to delete.

Classified every orphan as either:
- **DUPLICATE** — shares a code with a record we do track locally (the "keeper"); the extra copy(ies) are byproducts of a failed reconciliation match.
- **STANDALONE** — no code collision, and no local property matches its code at all (mostly legacy code formats, e.g. pagalos's `0204`–`0240` batch).

## 7. Methodology for confirming duplicates are real

`code` is not a listing attribute — it's an identifier our own `EstateWebPropertyReconciliationService` assigns, mirrored from the local `internal_id`/`property_id`, used as the CREATE-vs-UPDATE lookup key. Two EstateWeb records sharing an identical code means our own sync assigned the same identifier twice, which only happens on a failed-match retry — not a coincidence the way sharing a price would be. The record linked to a local `UserProperty` (via `integration_property_id`) is the keeper; the other is the orphan.

**Independent cross-check** (not just the code match): compared price, location, and square meters between every DUPLICATE pair against live EstateWeb data — three fields the code-matching logic never looked at. Report: `estateweb-duplicate-verification.md`.

Results (69 pairs total): 5 clean exact matches outright; the rest needed interpretation:
- **pagalos-trust (51 pairs):** 48 had the orphan's `price` field literally equal to its own `sqm` value — a data-corruption artifact from the original bad push, not a real mismatch. Location + sqm matched exactly on 50 of 51. Only **1 pair** (`52452 → 52489`) has a genuine location mismatch and needs manual review.
- **samson-homes (9 pairs):** 3 clean matches; **3 pairs** (`51202`, `50899`, `50719`) have a real location mismatch plus an 11–15% price gap — the most likely false-positive code collisions; 3 more have unexplained price/sqm drift worth a glance.
- **euroland-crete (7 pairs):** mostly the keeper being tagged with the generic city ("Χανιά") while the orphan has a specific neighborhood — likely coarser granularity, not a different property, but flagged for a quick check regardless. One (`50440`) has a 100% sqm mismatch, the most suspicious of the set.
- **bitsimis-real-homes (2 pairs):** both clean exact matches.

Net: of 68 DUPLICATE-classified orphans, roughly **9 genuinely need a manual double-check** before deleting; the rest are confirmed duplicates once the pagalos price-bug artifact is accounted for.

## 8. Generated reports (repo root)

- `estateweb-orphans-all-agencies.md` — full per-agency table (id, code, link, status, keeper, local title) for all 120 orphan records across the 5 affected agencies, plus per-agency `delete_ids`, `duplicates only`, and `standalone only` comma-separated id lists (a strict partition: duplicates + standalone = delete_ids).
- `estateweb-duplicate-verification.md` — the price/location/sqm cross-check described in §7.
- `estateweb-duplicates-to-delete.txt` — code + link per agency, DUPLICATE-classified records only.
- `cretahouses-estateweb-duplicates.txt`, `cretahouses-estateweb-code-collisions.txt` — earlier cretahouses-specific reports (§2–3).

These reflect the state as the user works through cleanup by hand (deleting orphans via the new tool once each has client approval); ids already handled have been moved out of the `delete_ids` lists as the user updates the file.

## 9. Root cause of the ongoing (non-cretahouses) duplication — fully diagnosed

The user asked directly: what caused this, and will it happen again after the orphans are deleted? Investigated the actual sync code (not just symptoms) and found **three independent, complementary bugs**, all in the CMS sync pipeline, all fixed on the **same day (2026-08-12)** — all landing *before* every duplicate timestamp found in §5:

1. **Stalled BullMQ job lock** (`3d4fd7d`, 08:51) — the sync worker's default 30-second BullMQ lock could expire mid-batch on a large sync (many properties, each a real HTTP push plus the configured `insertion_interval_seconds` delay). BullMQ then treated the job as stalled and handed it to another worker **while the original execution was still running** — the re-entrant execution reprocessed the same batch of CREATE operations concurrently. Since neither execution had yet seen the other's writes, both independently decided "property not found on EstateWeb, create it" — producing two records per property. Fixed by raising the lock duration to 30 minutes (`api/src/background/cms-sync.processor.ts`).
2. **Swallowed errors during ownership verification** (`c0fd344`, 10:43) — before doing an UPDATE, the sync checks whether the stored `integration_property_id` still belongs to the linked EstateWeb account. Previously, **any** error during that check (network blip, timeout, rate limit — not just a genuine "not found") was treated as "doesn't belong," silently clearing the link and creating a brand-new property instead of retrying the update. Fixed to only treat a genuine 404 as "create a new one"; any other error now fails the operation for retry instead of duplicating.
3. **Overly strict reconciliation corroboration** (`6bc46ce`, 15:03) — the code/internal_id match was additionally required to agree on address, price, and square meters before being trusted. When those fields were blank on either side (common for some agencies — no address, price-on-application listings), the corroboration check rejected a valid match and fell through to creating a duplicate instead of updating the existing record. Fixed to only reject a match on a *positive* conflict, not merely missing data (`api/src/integrations/estateweb/services/estateweb-property-reconciliation.service.ts`).

(Separately, the `#`-prefix scraper bug from §1 caused *code misalignment* specifically for cretahouses — a related but distinct failure mode, fixed 2026-08-13.)

**Verification, not assumption:** re-checked creation timestamps for every duplicate pair found across pagalos-trust, samson-homes, euroland-crete, and bitsimis-real-homes — every single one predates 2026-08-12. The most recent EstateWeb record on any affected agency was created 2026-08-08, four days before the fixes landed. No duplicate created *after* any of the three fixes was found on any agency.

## 10. Will this happen again after deleting the orphans?

Based on the above, no — not through the same mechanisms. All three bugs that produced every duplicate found in this investigation are fixed in the currently deployed code, and there is no evidence of a new duplicate being created since those fixes landed, across any of the affected agencies.

**One caveat that could not be confirmed from the code alone:** the protection against the stalled-job double-execution bug (§9.1) relies on the BullMQ worker's `concurrency: 1` setting, which only guarantees no double-processing **within a single running instance**. If the deployment were ever scaled to run with more than one replica/instance simultaneously, that in-process lock would not protect against a race between two separate instances each picking up a sync job for the same agency. No multi-replica configuration was found in the repository (no `railway.json`/`railway.toml`/`Procfile` specifying replica counts), so the deployment most likely runs as a single Railway instance today — but if that ever changes, an additional distributed lock would be needed to keep the same guarantee.
