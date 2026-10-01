import { UserProperty } from 'generated/prisma';
import { resolveSaleBasePrice } from '@/modules/user-integrations/utils/sales-pricing.util';
import { EstateWebScope } from '../constants/estateweb-enums.constants';
import { resolveEstateWebScopeId } from './estateweb-catalog.util';

export type EstateWebListingIdentityUserProperty = Pick<
  UserProperty,
  | 'listing_type'
  | 'estateweb_scope_id'
  | 'address'
  | 'price'
  | 'price_web'
  | 'square_meters'
>;

export interface EstateWebListingIdentityListing {
  scope_id: EstateWebScope | number;
  address?: string | null;
  price?: number;
  sqm?: number;
}

function resolveScopeId(
  userProperty: EstateWebListingIdentityUserProperty,
): EstateWebScope {
  const scopeId = resolveEstateWebScopeId(
    userProperty.listing_type,
    userProperty.estateweb_scope_id,
  );
  if (scopeId === EstateWebScope.RENT) return EstateWebScope.RENT;
  return EstateWebScope.SALE;
}

function stringsEqual(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function pricesEqual(left: unknown, right: number | undefined): boolean {
  const a = left != null ? Number(left) : null;
  const b = right != null ? Number(right) : null;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (a === b) return true;
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return true;
  return Math.abs(a - b) / max <= 0.01;
}

function numbersEqual(left: unknown, right: number | undefined): boolean {
  const a = left != null ? Number(left) : null;
  const b = right != null ? Number(right) : null;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  // EstateWeb stores sqm as a whole number (e.g. our "53.29" comes back as its
  // live 53) -- a sub-0.01 tolerance here flags every real, already-linked
  // listing as "different" purely from that rounding, which would incorrectly
  // break the ownership check an already-linked listing's next sync relies on
  // (confirmed against live data while fixing docs/CLIENT-ISSUES-2026-10-01.md
  // #4). A tolerance of a full unit absorbs that rounding either direction.
  return Math.abs(a - b) <= 1;
}

/**
 * True when `listing` (a live EstateWeb record) clearly identifies a DIFFERENT
 * real-world property than `userProperty` -- different scope (sale/rent),
 * address, price or square meters, compared only when both sides actually have
 * a value (a blank field on either side is never treated as a conflict).
 *
 * This is the one ground-truth identity check, used in two places:
 *  - EstateWebPropertyReconciliationService.reconcileCreate(), to refuse a
 *    coincidental code match before CREATE;
 *  - CmsSyncOrchestratorService / CmsSyncProcessor's ownership check, to
 *    confirm an already-linked listing still belongs to us before UPDATE.
 *
 * A mismatched `code` string is deliberately NOT part of this check: our own
 * internal_id/property_id (and thus the code we compute from them) can
 * legitimately change over time as scraping/normalization improves, with no
 * corresponding change on the CRM side. Requiring the code to still match
 * before trusting an id that still resolves on EstateWeb's side turned a
 * routine internal_id correction into a false "this listing isn't ours
 * anymore", clearing a perfectly valid link and creating a duplicate instead
 * of updating it (see docs/CLIENT-ISSUES-2026-10-01.md #4).
 */
export function isEstateWebListingIdentityMismatch(
  userProperty: EstateWebListingIdentityUserProperty,
  listing: EstateWebListingIdentityListing,
): boolean {
  if (resolveScopeId(userProperty) !== Number(listing.scope_id)) {
    return true;
  }

  const userAddress = (userProperty.address ?? '').trim();
  const listingAddress = (listing.address ?? '').trim();
  if (
    userAddress.length > 0 &&
    listingAddress.length > 0 &&
    !stringsEqual(userAddress, listingAddress)
  ) {
    return true;
  }

  // The price we push is resolveSaleBasePrice(price, price_web, sqm), which can
  // legitimately differ from the raw `price` (e.g. `price` was mis-parsed as the
  // sqm figure). Accept a match on either, or we'd refuse our own listing.
  const pushedPrice = resolveSaleBasePrice(
    userProperty.price,
    userProperty.price_web,
    userProperty.square_meters,
  );
  if (
    userProperty.price != null &&
    listing.price != null &&
    !pricesEqual(userProperty.price, listing.price) &&
    !pricesEqual(pushedPrice, listing.price)
  ) {
    return true;
  }

  if (
    userProperty.square_meters != null &&
    listing.sqm != null &&
    !numbersEqual(userProperty.square_meters, listing.sqm)
  ) {
    return true;
  }

  return false;
}
