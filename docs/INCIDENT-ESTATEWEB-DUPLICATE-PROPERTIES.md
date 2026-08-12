# Incident: duplicate properties created in EstateWeb CRM

**Date:** 2026-08-11 / 2026-08-12
**Affected agency:** `b446b291-baf7-4cbd-9680-d5c82584fdc6`

## Problem

The same properties were pushed into the agency's EstateWeb CRM **three times**,
producing three near-identical listings per property. Reported duplicate
EstateWeb property IDs: `(4210, 4213, 4216)`, `(4208, 4211, 4214)`,
`(4209, 4212, 4215)` — three sets of the same three properties, each set
created a few IDs apart from the last.

## Root cause

Two issues compounded:

1. **Trigger — a BullMQ jobId bug caused failed syncs to be retried by hand.**
   A commit earlier the same day added the first-ever dedup guard for
   CMS-sync jobs, using a jobId of the form `` `cms-sync:${id}` ``. BullMQ
   rejects any custom jobId containing a single colon, so every sync
   enqueue attempt failed with `"Custom Id cannot contain :"`. That produced
   repeated `CMS_SYNC_FAILURE` notifications, which prompted manual retries
   via the generic Jobs-panel "Retry" action — a path unaffected by the
   colon bug, so each retry succeeded and replayed the full property batch
   from scratch. This was fixed separately (jobId separator changed from
   `:` to `-`).

2. **Enabler — EstateWeb reconciliation silently allowed duplicate CREATE.**
   `EstateWebPropertyReconciliationService.hasPositiveCorroboration()`
   required address, price, or square_meters to *positively agree* on both
   sides before trusting an exact `internal_id`/code match — on top of the
   collision check that already rejected genuine conflicts. When none of
   those fields was comparable (this agency's listings have no scraped
   address at all, and land/business listings often have no price or
   square-meter figure either), the function returned `false`, and the sync
   code treated an already-created property as unmatched, creating a new
   EstateWeb listing instead of updating the existing one.

Each retry from cause 1 hit cause 2 and created another duplicate, producing
the three-batches-of-three pattern reported.

## Fix

Commit `6bc46ce77f0c3fcdf659c672af2d469ce98826d8` ("fix estateweb duplicate
creation on retry") on `main`:

```
fix estateweb duplicate creation on retry

Trust an exact internal_id/code match against the EstateWeb catalog once
isDefiniteCodeCollision rules out a real conflict, instead of also requiring
address/price/sqm to positively agree. When those fields were blank on
either side (common for this agency, e.g. no address, POA pricing), the
extra corroboration check silently rejected the match and fell through to
creating a duplicate listing instead of updating the existing one.
```

Removed `hasPositiveCorroboration()` and its call in `reconcileCreate()`
(`api/src/integrations/estateweb/services/estateweb-property-reconciliation.service.ts`).
An exact code match that passes the existing `isDefiniteCodeCollision` check
(matching scope, and no conflicting address/price/sqm where both sides have
a value) is now trusted as a real match on its own. See
`docs/ESTATEWEB-PROPERTY-RECONCILIATION.md` for the updated reconciliation
rules.

## Open items

- The 9 existing duplicate EstateWeb listings from this incident have not
  been cleaned up as part of this fix.
- No automated test covers this reconciliation path yet.
