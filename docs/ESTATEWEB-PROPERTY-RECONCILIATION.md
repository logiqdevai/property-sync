# EstateWeb property reconciliation

When a CMS sync **CREATE** runs (no `integration_property_id` yet), we load all listings from the **linked** EstateWeb account and decide whether to link/update an existing listing or create a new one.

Implementation: `api/src/integrations/estateweb/services/estateweb-property-reconciliation.service.ts`

## Step 1: Lookup by code

Primary key is **`internal_id`** on the user property, matched to EstateWeb **`code`** (case-insensitive, trimmed).

Example: property `1-728` → look for a listing with code `1-728` on the linked account.

- No code on our side, or no matching code in CRM → **treat as new → create**.

## Step 2: Reject collisions (different property, same code)

Same code, but identity fields **conflict** → **do not** link to that listing → **create new**.

| Field | User property | EstateWeb listing |
|-------|---------------|-------------------|
| **Scope** | sale vs rent (`listing_type` / `estateweb_scope_id`) | `scope_id` |
| **Address** | `address` | `address` (only if both non-empty) |
| **Price** | `price` | `price` (within ~1%) |
| **Size** | `square_meters` | `sqm` (within 0.01) |

Example: code `1-728` exists on listing `51853`, but scope `1` vs `2`, price `2.5M` vs `150k`, sqm `2800` vs `500` → collision → create new listing instead of updating the old one.

## Step 3: Require corroboration (not code-only)

Same code and **no** collision still is not enough. At least one of address, price, or sqm must **match** on both sides (when both have values).

Code-only match with empty/missing corroborating fields → **reject → create**.

## Step 4: If matched, link or update

If we accept the match:

1. Stamp `integration_property_id` with that listing id.
2. **Update** CRM only if `pending_crm_update` is true, or this crawl run has relevant history (price change, images, status, etc.).
3. Otherwise **link only** — no push.

## Separate check on UPDATE

If the property already has `integration_property_id`:

1. Fetch that listing on the **linked** account.
2. Verify its **code** still matches `internal_id`.
3. Wrong account or wrong code → clear stale id → **CREATE** instead of updating the wrong listing.

## Summary

Existence is **code first**, then **scope + address / price / sqm** to avoid linking the wrong listing when codes are reused.
