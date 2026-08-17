# EstateWeb Sync: CREATE vs UPDATE Decision Flow

What happens after a scrape, when deciding whether to create or update a property on EstateWeb. Traced directly from `CmsSyncOrchestratorService`, `CmsSyncProcessor`, and `EstateWebPropertyReconciliationService`.

## Overall pipeline

1. The crawler finds new/changed/removed listings and creates/updates the canonical `Property` and the user's `UserProperty` copy.
2. For each affected `UserProperty`, the operation type is decided by one simple signal: **does it already have an `integration_property_id` stored or not.**
   - No `integration_property_id` → we've never pushed this before → **CREATE**.
   - Has `integration_property_id` → we already know which EstateWeb record it maps to → **UPDATE**.
3. This becomes a background BullMQ job per tracked agency, where the checks below happen.

## 1. A property that doesn't exist yet (first time we see it)

Operation = **CREATE**. Before creating anything new, `EstateWebPropertyReconciliationService.reconcileCreate()` does **not** blindly trust that it's actually new — it fetches the full EstateWeb catalog for that integration (`listAllPropertiesForIntegration`) and checks whether any existing EstateWeb record already has a `code` equal to our `internal_id`/`property_id`:

- **No match found** → genuinely new → normal `pushCreate()`.
- **A matching code is found, and there's no collision** (see §2) → does **not** create a duplicate. Links the local `UserProperty` to that existing EstateWeb record (sets `integration_property_id`), then either `pushUpdate()`s it (if something actually changed) or just links it silently (if nothing changed, no push needed).

## 2. A property whose code collides with another

`isDefiniteCodeCollision()` runs even when a matching code is found, to confirm it's genuinely the *same* listing rather than a coincidental code collision with something else. It compares scope (sale/rent), address, price, and square meters — but **only when both sides actually have a value**; a blank field on either side is never treated as a conflict (this exact "blank field = reject the match" behavior was the bug fixed on 2026-08-12, see `estateweb-duplication-investigation-summary.md` §9.3).

- If a **real conflict** is found (different price/address/scope) → the code match is refused, treated as coincidental, and a normal `pushCreate()` happens as if nothing was found (a warning is logged).
- **Honest caveat:** this means if two genuinely different properties (possibly from different agencies) ever end up with the same raw `internal_id`/`property_id`, EstateWeb will end up with two records sharing that code — not because of a duplicate-push bug, but because there's no global uniqueness constraint on the code namespace. Rare, but not impossible. The code doesn't prevent this; it just correctly avoids confusing it with a real duplicate.

## 3. A property that already exists (we know its EstateWeb id) — the normal UPDATE path

Operation = **UPDATE**. Before pushing the update, `listingBelongsToLinkedIntegration()` (`api\src\modules\cms-sync\services\cms-sync-orchestrator.service.ts:864-885`) checks whether the stored `integration_property_id` still belongs to the linked account. It's a two-step check:

1. **Existence**: fetches the live record via `estateWebPropertyService.getProperty(userIntegrationId, integrationPropertyId)`, i.e. asks EstateWeb directly, using the linked account's own credentials, whether that id exists under that account.
2. **Code match**: if found, and our local `internal_id` is set, compares the live record's `code` against our `internal_id` (trimmed/lowercased on both sides). If `internal_id` is blank locally, this step is skipped and existence alone is trusted.

- **Matches** (or no `internal_id` to check against) → normal `pushUpdate()` (always a full-record round-trip payload now, never a partial PATCH — see `estateweb-duplication-investigation-summary.md` §2).
- **Doesn't match, or the record isn't found (404, `isNotFoundEstateWebError`)** → the local link is considered stale (e.g. someone deleted it manually on EstateWeb, or the id now points to a different listing) → the local `integration_property_id` is cleared, and the property re-enters the **same** flow as §1 (it searches by code again before creating — never a blind create).
- **Any other error** (network, timeout, rate limit) → **not** treated as "doesn't belong anymore" (this was the bug fixed 2026-08-12, see `estateweb-duplication-investigation-summary.md` §9.2). The operation fails and is retried instead.

## One-sentence summary

The logic always searches by code before creating anything — CREATE never means a blind create, it means "check if this already exists under this code first, and link to it instead of duplicating it if it does."
