import { UserProperty } from 'generated/prisma';
import { CmsSyncProcessor } from './cms-sync.processor';

describe('CmsSyncProcessor.executeSingleOperation: CREATE safety', () => {
  function setup(userPropertyOverrides: Partial<UserProperty>) {
    const userProperty = {
      id: 'up-1',
      user_id: 'user-1',
      title: 'Flat',
      internal_id: 'AP 419',
      property_id: 'p-1',
      integration_property_id: null,
      estateweb_type_id: 10,
      estateweb_location_id: 20,
      ...userPropertyOverrides,
    } as unknown as UserProperty;

    const prisma = {
      userProperty: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const adapter = {
      pushCreate: jest
        .fn()
        .mockResolvedValue({ integration_property_id: 'new-999' }),
      pushUpdate: jest.fn().mockResolvedValue(undefined),
    };
    const reconciliation = {
      reconcileCreate: jest
        .fn()
        .mockResolvedValue({ matched: false, shouldUpdate: false }),
    };
    const propertyService = {
      // Ownership is decided by identity fields (scope/address/price/sqm), not
      // by `code` -- see isEstateWebListingIdentityMismatch. scope_id: 1 (SALE)
      // matches the default scope resolveScopeId() gives this userProperty
      // (no listing_type/estateweb_scope_id override above).
      getProperty: jest.fn().mockResolvedValue({ code: 'AP419', scope_id: 1 }),
    };

    const processor = new CmsSyncProcessor(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      reconciliation as never,
      {} as never,
      propertyService as never,
      {} as never,
    );

    const run = (operation: 'CREATE' | 'UPDATE') =>
      (
        processor as unknown as {
          executeSingleOperation: (...args: unknown[]) => Promise<{
            success: boolean;
            operation: string;
            integration_property_id?: string;
          }>;
        }
      ).executeSingleOperation(
        adapter,
        'integration-1',
        {
          user_property_id: 'up-1',
          operation,
          duplicate_group_id: null,
          is_representative: true,
        },
        new Map([['up-1', userProperty]]),
        { byCode: new Map(), pushSiteIds: new Set() },
        null,
        false,
      );

    return { run, adapter, reconciliation, propertyService, prisma };
  }

  it('runs a CREATE as an UPDATE when the property is already linked to a CRM listing', async () => {
    const { run, adapter, reconciliation } = setup({
      integration_property_id: '4242',
    });

    const result = await run('CREATE');

    expect(result).toMatchObject({
      success: true,
      operation: 'UPDATE',
      integration_property_id: '4242',
    });
    expect(adapter.pushCreate).not.toHaveBeenCalled();
    expect(reconciliation.reconcileCreate).not.toHaveBeenCalled();
    expect(adapter.pushUpdate).toHaveBeenCalledTimes(1);
  });

  it('recognises the linked listing via identity fields, not a code comparison (no false "not ours" -> no duplicate create)', async () => {
    const { run, adapter, prisma } = setup({ integration_property_id: '4242' });

    await run('UPDATE');

    expect(adapter.pushCreate).not.toHaveBeenCalled();
    expect(adapter.pushUpdate).toHaveBeenCalledTimes(1);
    expect(prisma.userProperty.update).not.toHaveBeenCalled();
  });

  // Regression test for docs/CLIENT-ISSUES-2026-10-01.md #4: a scraping/
  // normalization fix that corrects internal_id for an already-linked property
  // (completely changing its computed `code`, e.g. "AP419" -> "4-2569") must
  // not make the ownership check treat the live listing as "not ours" and
  // create a duplicate -- only a genuine identity conflict (scope/address/
  // price/sqm) may do that.
  it('keeps an existing link even when internal_id changes completely (no duplicate create)', async () => {
    const { run, adapter, prisma } = setup({
      integration_property_id: '4242',
      internal_id: '4-2569',
    });

    await run('UPDATE');

    expect(adapter.pushCreate).not.toHaveBeenCalled();
    expect(adapter.pushUpdate).toHaveBeenCalledTimes(1);
    expect(prisma.userProperty.update).not.toHaveBeenCalled();
  });

  it('still creates when the property is not linked and reconciliation finds nothing', async () => {
    const { run, adapter } = setup({ integration_property_id: null });

    const result = await run('CREATE');

    expect(result).toMatchObject({
      success: true,
      operation: 'CREATE',
      integration_property_id: 'new-999',
    });
    expect(adapter.pushCreate).toHaveBeenCalledTimes(1);
    expect(adapter.pushUpdate).not.toHaveBeenCalled();
  });

  it('runs a queued UPDATE as a CREATE when the link was already cleared (retry after a failed re-create)', async () => {
    // A previous attempt found the listing was not ours, cleared the link, then the
    // create failed. The frozen batch still says UPDATE; it used to throw
    // "No integration property id for update" on every remaining attempt.
    const { run, adapter, reconciliation } = setup({
      integration_property_id: null,
    });

    const result = await run('UPDATE');

    expect(result).toMatchObject({
      success: true,
      operation: 'CREATE',
      integration_property_id: 'new-999',
    });
    expect(reconciliation.reconcileCreate).toHaveBeenCalledTimes(1);
    expect(adapter.pushCreate).toHaveBeenCalledTimes(1);
  });

  it('reconciles against existing listings before re-creating a listing that is not ours', async () => {
    const { run, adapter, reconciliation, propertyService, prisma } = setup({
      integration_property_id: '4242',
    });
    propertyService.getProperty.mockResolvedValue({ code: 'SOMEONE-ELSE' });
    reconciliation.reconcileCreate.mockResolvedValue({
      matched: true,
      shouldUpdate: false,
      integrationPropertyId: '777',
    });

    const result = await run('UPDATE');

    // Link cleared, then linked to the matching listing instead of a blind POST.
    expect(prisma.userProperty.update).toHaveBeenCalledWith({
      where: { id: 'up-1' },
      data: { integration_property_id: null },
    });
    expect(reconciliation.reconcileCreate).toHaveBeenCalledTimes(1);
    expect(adapter.pushCreate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      integration_property_id: '777',
    });
  });
});
