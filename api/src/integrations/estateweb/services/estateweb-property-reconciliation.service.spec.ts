import { UserProperty } from 'generated/prisma';
import { EstateWebPropertyListItem } from '../interfaces/estateweb-property.interface';
import {
  EstateWebPropertyCatalog,
  EstateWebPropertyReconciliationService,
} from './estateweb-property-reconciliation.service';

function makeService(): EstateWebPropertyReconciliationService {
  return new EstateWebPropertyReconciliationService(
    { propertyHistory: { findFirst: jest.fn() } } as never,
    {} as never,
    {} as never,
  );
}

function makeCatalog(
  listings: Array<Partial<EstateWebPropertyListItem>>,
): EstateWebPropertyCatalog {
  return {
    byCode: new Map(
      listings.map((l) => [
        String(l.code).toLowerCase(),
        l as EstateWebPropertyListItem,
      ]),
    ),
    pushSiteIds: new Set(),
  };
}

function makeUserProperty(overrides: Partial<UserProperty>): UserProperty {
  return {
    id: 'up-1',
    internal_id: null,
    property_id: null,
    listing_type: 'SALE',
    estateweb_scope_id: null,
    address: null,
    price: null,
    price_web: null,
    square_meters: null,
    pending_crm_update: false,
    canonical_property_id: 'canon-1',
    ...overrides,
  } as unknown as UserProperty;
}

describe('EstateWebPropertyReconciliationService.reconcileCreate', () => {
  it('matches a listing stored under the sanitized code of a raw internal_id', async () => {
    const catalog = makeCatalog([{ id: 501, code: 'AP419', scope_id: 1 }]);
    const result = await makeService().reconcileCreate(
      makeUserProperty({ internal_id: 'AP 419' }),
      catalog,
    );

    expect(result).toMatchObject({
      matched: true,
      integrationPropertyId: '501',
    });
  });

  it('matches on property_id when internal_id is missing (the code that was pushed)', async () => {
    const catalog = makeCatalog([{ id: 502, code: 'listing-77', scope_id: 1 }]);
    const result = await makeService().reconcileCreate(
      makeUserProperty({ internal_id: null, property_id: 'listing-77' }),
      catalog,
    );

    expect(result).toMatchObject({
      matched: true,
      integrationPropertyId: '502',
    });
  });

  it('still matches on the raw internal_id (previous behaviour)', async () => {
    const catalog = makeCatalog([{ id: 503, code: 'AB-1', scope_id: 1 }]);
    const result = await makeService().reconcileCreate(
      makeUserProperty({ internal_id: 'AB-1' }),
      catalog,
    );

    expect(result).toMatchObject({
      matched: true,
      integrationPropertyId: '503',
    });
  });

  it('does not match when no code is present in the catalog', async () => {
    const result = await makeService().reconcileCreate(
      makeUserProperty({ internal_id: 'NOPE-1' }),
      makeCatalog([{ id: 1, code: 'OTHER', scope_id: 1 }]),
    );

    expect(result).toEqual({ matched: false, shouldUpdate: false });
  });

  it('does not match when the user property has no usable code', async () => {
    const result = await makeService().reconcileCreate(
      makeUserProperty({ internal_id: null, property_id: null }),
      makeCatalog([{ id: 1, code: 'OTHER', scope_id: 1 }]),
    );

    expect(result).toEqual({ matched: false, shouldUpdate: false });
  });

  it('accepts a price that equals the pushed base price, not just the raw price', async () => {
    // `price` was mis-parsed as the sqm figure; the adapter pushes price_web instead.
    const catalog = makeCatalog([
      { id: 504, code: 'AB-2', scope_id: 1, price: 250000 },
    ]);
    const result = await makeService().reconcileCreate(
      makeUserProperty({
        internal_id: 'AB-2',
        price: 95 as never,
        price_web: 250000 as never,
        square_meters: 95 as never,
      }),
      catalog,
    );

    expect(result).toMatchObject({
      matched: true,
      integrationPropertyId: '504',
    });
  });

  it('still refuses a code match whose price genuinely conflicts', async () => {
    const catalog = makeCatalog([
      { id: 505, code: 'AB-3', scope_id: 1, price: 900000 },
    ]);
    const result = await makeService().reconcileCreate(
      makeUserProperty({
        internal_id: 'AB-3',
        price: 250000 as never,
        price_web: 250000 as never,
      }),
      catalog,
    );

    expect(result).toEqual({ matched: false, shouldUpdate: false });
  });

  it('still refuses a code match with a different scope', async () => {
    const catalog = makeCatalog([{ id: 506, code: 'AB-4', scope_id: 2 }]);
    const result = await makeService().reconcileCreate(
      makeUserProperty({ internal_id: 'AB-4', listing_type: 'SALE' as never }),
      catalog,
    );

    expect(result).toEqual({ matched: false, shouldUpdate: false });
  });
});
