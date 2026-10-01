# Incident: EstateWeb code/internal_id mismatch created a duplicate listing (and could have created ~64 more)

**Date:** 2026-10-01
**Affected agency:** `bitsimis-real-homes` (client calls it "bigidis"), EstateWeb account `info@bitsimis-real-homes.gr`
**Reported by:** client, via WhatsApp (see `docs/CLIENT-ISSUES-2026-10-01.md` #4 for the full client-facing investigation)

## Problem

Client reported property code `2569` showing a `created_at` of `2026-10-01 00:07`
and `updated_at` of `00:40` in EstateWeb, even though property-sync has tracked
this listing since 2026-07-25. Confirmed via a live, read-only call to the
client's own EstateWeb account: this was a genuine **duplicate** — EstateWeb
property id `59254` (code `"2569"`, created 2026-10-01 00:07) sits alongside the
real original, id `51965` (code `"4-2569"`, created 2026-07-26), both still
live/active.

## Root cause (two layers)

1. **Extraction bug.** `bitsimis-real-homes.gr` renders its listing code only
   inside a labeled specs table (`_detail_specs: {"Κωδικός": "4-2569"}`), never
   in the free-text description. property-sync's code extraction
   (`extractSourcePropertyIds` in `api/src/integrations/crawler/utils/crawler.utils.ts`)
   only ever searched the free-text description/title for a `"Κωδικός: ..."`
   pattern — it never read the structured specs table. So for this listing
   extraction found nothing and `internal_id` silently fell back to the URL
   slug (`"2569"`), permanently dropping the `"4-"` category prefix the site
   displays and that EstateWeb's original record (`51965`) was created with.

2. **Fragile ownership check (the part that actually creates a duplicate).**
   Before every CRM `UPDATE`, `CmsSyncOrchestratorService.listingBelongsToLinkedIntegration()`
   / `CmsSyncProcessor.listingBelongsToIntegration()` verified an already-linked
   listing still "belongs to us" by comparing the live listing's `code` string
   against candidate codes built from our own `internal_id`/`property_id`. Our
   own computed code can legitimately change over time (exactly what fixing
   bug #1 does) with no corresponding change on the CRM side — so a `code`
   mismatch alone is not safe proof that an id now points at a different
   listing. Once `internal_id` changed, this check would conclude "not ours,"
   clear `integration_property_id`, and create a duplicate instead of updating
   the existing one.

Each time this property's link went stale (confirmed via `activity_log_changes`:
`2026-09-25` and again `2026-09-30`), the code-matching gap in CREATE-time
reconciliation (`EstateWebPropertyReconciliationService.reconcileCreate()`'s
catalog index, keyed by raw code only) also meant the search for the true
original (`51965`, code `"4-2569"`) never found it, so a fresh duplicate got
created each time instead of relinking.

**Caught before shipping:** fixing bug #1 in isolation (just correcting
`internal_id` extraction) would, by itself, have changed `internal_id` for 73
properties platform-wide — **64 of which are already linked** to a live
EstateWeb listing. Tracing through the ownership check above confirmed that
change would have broken it for all 64, producing up to 64 *new* duplicates on
their next sync — a much bigger incident than the one being fixed. This is why
bug #2 had to be fixed as part of the same change, not treated as a separate
follow-up.

## Fix

1. **`extractInternalIdFromSpecs()`** added to `crawler.utils.ts`: reads the
   already-parsed `_detail_specs` table for a labeled code row (`Κωδικός`,
   `Κωδ.`, `Κωδικός Ακινήτου`, `Code`, `Reference`, `Property ID`) and returns
   it verbatim, prefix included. Wired in ahead of the free-text regex (after
   an explicit scraper-set raw field) in both `extractSourcePropertyIds()`
   (crawl-time) and the non-AI normalization fallback in
   `property-normalization.utils.ts`.

   Audited the blast radius against all ~4,500 active `source_properties`
   platform-wide before wiring it in: only 73 properties get a different
   `internal_id` — 68 on `bitsimis-real-homes` (regaining their missing
   numeric category prefix, e.g. `"2764"` → `"9-2764"`) and 5 on
   `housemarket-realestate` (a missing `" S"` suffix). No other agency is
   touched.

2. **`isEstateWebListingIdentityMismatch()`** added in a new shared util,
   `api/src/integrations/estateweb/utils/estateweb-listing-identity.util.ts`:
   the same identity check (`scope_id`, `address`, `price`, `sqm` — compared
   only when both sides have a value) that `reconcileCreate()` already used to
   refuse a *coincidental* code match before CREATE, extracted so it can also
   gate the UPDATE ownership check. Now:
   - `EstateWebPropertyReconciliationService.isDefiniteCodeCollision()`
     (CREATE path) delegates to it — behavior unchanged, de-duplicated.
   - `CmsSyncOrchestratorService.listingBelongsToLinkedIntegration()` /
     `CmsSyncProcessor.listingBelongsToIntegration()` (UPDATE path) now treat
     an id as still ours whenever it resolves (not a 404) **and** there is no
     identity conflict — regardless of whether its `code` string matches.
     Removed the now-dead `buildEstateWebOwnershipCodes()` /
     `estateWebCodeMatchesCandidates()` code-matching helpers they used to
     call.

3. **`EstateWebPropertyReconciliationService.buildCodeIndex()`** also indexes
   each catalog listing under its de-prefixed code as a fallback (via
   `estateWebCodeLookupKeys()` in `estateweb-property-code.util.ts`), so
   `reconcileCreate()` can find a bulk-imported listing like `"4-2569"` when
   searching for `"2569"` — this is what will let property `2569`'s link
   self-heal onto the real original (`51965`) once the duplicate (`59254`) is
   removed (see Open items).

4. **Sqm-tolerance bug found while verifying fix #2 against live data:** the
   identity check's sqm comparison used a `< 0.01` tolerance (carried over
   unchanged from the original `isDefiniteCodeCollision`). EstateWeb stores
   `sqm` as a whole number, so an already-linked listing's live value is
   routinely off by a fraction from our own decimal value (e.g. our `"53.29"`
   vs their live `53`) — that tolerance would have falsely flagged a real,
   correctly-linked listing as "different." Loosened to `<= 1`.

## Verification

- Audited blast radius for fix #1 against production data (read-only): 73
  properties change, 68/73 bitsimis-real-homes, 5/73 housemarket-realestate.
- Of those 73, found 64 already linked (`integration_property_id` set) — the
  ones at risk from the ownership-check fragility.
- Pulled all 64 already-linked properties' **live** EstateWeb records
  (read-only `GET /api/property/:id`, one call per listing) and ran the new
  `isEstateWebListingIdentityMismatch()` check against real data: **64/64
  pass, 0 false mismatches** (one initial failure, from the sqm-tolerance bug
  above, fixed and re-verified).
- Added regression tests: `crawler.utils.spec.ts` (new — specs-table
  extraction, including the exact `bitsimis-real-homes` case),
  `estateweb-listing-identity.util.spec.ts` (new — identity check, including
  the sqm-rounding case and a case proving a fully-changed `internal_id` is
  not treated as a conflict), a `loadCatalog` + `reconcileCreate` regression
  in `estateweb-property-reconciliation.service.spec.ts`, and a case in
  `cms-sync.processor.spec.ts` proving a fully-changed `internal_id` no longer
  breaks an existing CRM link.
- Full `api` test suite: 19 suites / 217 tests pass. `tsc --noEmit` clean.

## Open items

- **The live duplicate (EstateWeb id `59254`, code `"2569"`) has not been
  deleted or merged with the original (`51965`).** It's still active, and
  this client's `UserProperty` for this listing is still linked to the
  duplicate, not the original. Deliberately left out of this fix (client
  asked for the matching-logic fix only, not the cleanup) — needs explicit
  confirmation before deleting a live CRM record, since it may already be
  published to public portals (this account pushes to 6 sites).
- Fix #1 (`internal_id` correction) only takes effect on each affected
  property's next crawl — for `bitsimis-real-homes` that's its next scheduled
  run (crawl_interval `0 7 * * 2,5`, Tue/Fri 07:00 Athens; see
  `docs/CLIENT-ISSUES-2026-10-01.md` #4 for why it was accidentally changed
  off daily during the same incident window).
- Once property `2569`'s `internal_id` is corrected to `"4-2569"` by a crawl,
  its *next* push will still target whatever id it's currently linked to
  (`59254`) unless that link has gone stale in the meantime — so the
  duplicate cleanup above should happen before or shortly after that crawl to
  avoid renaming the duplicate's code to `"4-2569"` too (recreating the same
  collision under a different id).
