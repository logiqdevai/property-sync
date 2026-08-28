# EstateWeb ownership check breaking after an `internal_id` correction

**Commit:** `b4e3660` — "fix estateweb ownership check to also match property_id"

## Problem

For the `realty properties` agency (`fa288eee-04ca-4775-b520-1107755ee930`), the scraper was
storing the same value in `internal_id` as in `property_id` (both the numeric id from the listing
URL, e.g. `10685795`), instead of the real public property code the agency displays on the page
(`Κωδ. 4165`). This was fixed by pointing the scraper's `detail_page.external_id_selector` at
`.property-id` and re-extracting `internal_id` for all 437 already-scraped properties from their
saved HTML snapshots.

That data fix then broke something else: **274 of those properties had already been pushed to
EstateWeb** before `internal_id` was corrected, so EstateWeb's own copy of the listing still had
`code = "10685795"` (or whichever URL id) — not the new value.

Before pushing any update to an EstateWeb listing, the app verifies the listing still belongs to us
by comparing EstateWeb's stored `code` against our current `internal_id`
(`listingBelongsToLinkedIntegration` in `cms-sync-orchestrator.service.ts`, and its duplicate
`listingBelongsToIntegration` in `cms-sync.processor.ts`):

```ts
const listingCode = listing.code?.trim().toLowerCase() ?? '';
return listingCode === internalId.trim().toLowerCase();
```

Since `internal_id` no longer matched what EstateWeb had cached, this check started failing for all
274 already-linked properties. A failed check doesn't just skip the update — it clears
`integration_property_id` locally and falls through to creating a **brand-new** listing on EstateWeb
instead of updating the existing one. In other words: fixing the scraper's `internal_id` extraction
put every already-synced property in this agency one "push to CMS" away from getting duplicated on
EstateWeb.

This was caught before it happened at scale — a manual single-property "push to CMS" test appeared
to do nothing (no CMS sync notification, no cost log entry, EstateWeb's `code` field unchanged when
checked directly), which is consistent with the push either failing this check or never completing.

## Fix

`property_id` (the id parsed from the listing URL) never changes, even when `internal_id` gets
corrected later. Both ownership-check functions now accept a match on either value instead of only
`internal_id`:

```ts
const candidates = [internalId, propertyId]
  .map((value) => value?.trim().toLowerCase())
  .filter((value): value is string => Boolean(value));
...
return candidates.includes(listingCode);
```

Updated in two places (the same check is duplicated between the manual-push path and the
crawl-triggered sync path):
- `api/src/modules/cms-sync/services/cms-sync-orchestrator.service.ts` — `listingBelongsToLinkedIntegration()`
- `api/src/background/cms-sync.processor.ts` — `listingBelongsToIntegration()`

Both call sites now also pass `userProperty.property_id` alongside `userProperty.internal_id`.

## Result

A listing is now recognized as ours if EstateWeb's stored `code` matches **either** identity value,
so correcting `internal_id` for an already-pushed property no longer makes the app think the listing
was disowned. The next real "push to CMS" for these 274 properties will go through `pushUpdate`
(matched via `property_id`) and resend the corrected `code`, instead of creating a duplicate.
