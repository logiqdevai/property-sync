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
      // CRM stores the *sanitized* code for the raw internal_id "AP 419".
      getProperty: jest.fn().mockResolvedValue({ code: 'AP419' }),
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

  it('recognises the linked listing via its sanitized code (no false "not ours" -> no duplicate create)', async () => {
    // internal_id "AP 419" vs CRM code "AP419": a raw comparison used to fail here,
    // clear the link and create a second listing.
    const { run, adapter, prisma } = setup({ integration_property_id: '4242' });

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
});
