import { UserProperty } from 'generated/prisma';
import {
  EstateWebListingIdentityUserProperty,
  isEstateWebListingIdentityMismatch,
} from './estateweb-listing-identity.util';

function makeUserProperty(
  overrides: Partial<EstateWebListingIdentityUserProperty>,
): EstateWebListingIdentityUserProperty {
  return {
    listing_type: 'SALE',
    estateweb_scope_id: null,
    address: null,
    price: null,
    price_web: null,
    square_meters: null,
    ...overrides,
  } as unknown as UserProperty;
}

describe('isEstateWebListingIdentityMismatch', () => {
  // Regression test for docs/CLIENT-ISSUES-2026-10-01.md #4: correcting an
  // internal_id extraction bug must not make already-linked listings look like
  // a different property and trigger a duplicate CREATE. The listing's `code`
  // is deliberately NOT part of this check.
  it('is not a mismatch when only the code would differ, scope/price/sqm match', () => {
    const userProperty = makeUserProperty({
      listing_type: 'SALE' as never,
      price: 250000 as never,
      square_meters: 95 as never,
    });
    const listing = { scope_id: 1, price: 250000, sqm: 95 };

    expect(isEstateWebListingIdentityMismatch(userProperty, listing)).toBe(
      false,
    );
  });

  it('is a mismatch on a different scope (sale vs rent)', () => {
    const userProperty = makeUserProperty({ listing_type: 'RENT' as never });
    const listing = { scope_id: 1 }; // SALE

    expect(isEstateWebListingIdentityMismatch(userProperty, listing)).toBe(
      true,
    );
  });

  it('is a mismatch on a genuinely conflicting price', () => {
    const userProperty = makeUserProperty({ price: 250000 as never });
    const listing = { scope_id: 1, price: 900000 };

    expect(isEstateWebListingIdentityMismatch(userProperty, listing)).toBe(
      true,
    );
  });

  it('is a mismatch on a genuinely conflicting address', () => {
    const userProperty = makeUserProperty({ address: 'Odos A 1' as never });
    const listing = { scope_id: 1, address: 'Odos B 2' };

    expect(isEstateWebListingIdentityMismatch(userProperty, listing)).toBe(
      true,
    );
  });

  it('does not treat a blank field on either side as a conflict', () => {
    const userProperty = makeUserProperty({ address: null, price: null });
    const listing = { scope_id: 1, address: 'Odos B 2', price: 900000 };

    expect(isEstateWebListingIdentityMismatch(userProperty, listing)).toBe(
      false,
    );
  });

  // Confirmed against live EstateWeb data while fixing docs/CLIENT-ISSUES-2026-10-01.md
  // #4: EstateWeb stores sqm as a whole number, so an already-linked listing's live
  // sqm is routinely off by a fraction from our own decimal value.
  it('tolerates EstateWeb rounding sqm to a whole number (not a mismatch)', () => {
    const userProperty = makeUserProperty({ square_meters: '53.29' as never });
    const listing = { scope_id: 1, sqm: 53 };

    expect(isEstateWebListingIdentityMismatch(userProperty, listing)).toBe(
      false,
    );
  });

  it('still catches a genuinely different sqm beyond rounding tolerance', () => {
    const userProperty = makeUserProperty({ square_meters: 53 as never });
    const listing = { scope_id: 1, sqm: 180 };

    expect(isEstateWebListingIdentityMismatch(userProperty, listing)).toBe(
      true,
    );
  });

  it('accepts a price that equals the pushed base price, not just the raw price', () => {
    const userProperty = makeUserProperty({
      price: 95 as never,
      price_web: 250000 as never,
      square_meters: 95 as never,
    });
    const listing = { scope_id: 1, price: 250000 };

    expect(isEstateWebListingIdentityMismatch(userProperty, listing)).toBe(
      false,
    );
  });
});
