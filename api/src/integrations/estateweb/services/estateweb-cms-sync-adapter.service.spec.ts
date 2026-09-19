import { UserProperty } from 'generated/prisma';
import { EstateWebCmsSyncAdapter } from './estateweb-cms-sync-adapter.service';

describe('EstateWebCmsSyncAdapter.pushCreate', () => {
  const userProperty = {
    id: 'up-1',
    user_id: 'user-1',
    estateweb_type_id: 10,
    estateweb_location_id: 20,
    images: [],
  } as unknown as UserProperty;

  function setup(options: { noteFails?: boolean; linkFails?: boolean } = {}) {
    const calls: string[] = [];

    const prisma = {
      userProperty: {
        updateMany: jest.fn(async () => {
          calls.push('link');
          if (options.linkFails) throw new Error('db down');
          return { count: 1 };
        }),
      },
    };
    const propertyService = {
      createProperty: jest.fn(async () => {
        calls.push('create');
        return { id: 4242 };
      }),
      createPropertyNote: jest.fn(async () => {
        calls.push('note');
        if (options.noteFails) throw new Error('note rejected');
        return {};
      }),
    };

    const adapter = new EstateWebCmsSyncAdapter(
      prisma as never,
      propertyService as never,
      {
        resolveAdLanguages: jest.fn().mockResolvedValue([]),
      } as never,
      {} as never,
      {} as never,
    );

    // Everything around the CRM call is out of scope here.
    const stubs = adapter as unknown as Record<string, unknown>;
    stubs.resolvePushSitesForSync = jest.fn().mockResolvedValue([]);
    stubs.resolveContentAds = jest
      .fn()
      .mockResolvedValue({ languages: [], titles: {}, descriptions: {} });
    stubs.applySalesPriceStartIfNeeded = jest.fn().mockResolvedValue(undefined);
    stubs.buildPayload = jest
      .fn()
      .mockReturnValue({ sites: [], ads: [], fields: [] });
    stubs.persistIntegrationPropertySites = jest
      .fn()
      .mockImplementation(async () => {
        calls.push('sites');
      });
    stubs.uploadImages = jest.fn().mockImplementation(async () => {
      calls.push('images');
    });

    return { adapter, prisma, propertyService, calls };
  }

  it('persists the CRM link right after create, before the note and other follow-ups', async () => {
    const { adapter, prisma, calls } = setup();

    const result = await adapter.pushCreate('integration-1', userProperty, {
      propertyNote: 'Smith',
    });

    expect(result).toEqual({ integration_property_id: '4242' });
    expect(calls).toEqual(['create', 'link', 'note', 'sites', 'images']);
    expect(prisma.userProperty.updateMany).toHaveBeenCalledWith({
      where: { id: 'up-1', user_id: 'user-1' },
      data: { integration_property_id: '4242' },
    });
  });

  it('does not fail the create when the CRM note fails', async () => {
    const { adapter, calls } = setup({ noteFails: true });

    await expect(
      adapter.pushCreate('integration-1', userProperty, {
        propertyNote: 'Smith',
      }),
    ).resolves.toEqual({ integration_property_id: '4242' });

    // Follow-up steps still run after the failed note.
    expect(calls).toEqual(['create', 'link', 'note', 'sites', 'images']);
  });

  it('does not fail the create when the early link write fails', async () => {
    const { adapter } = setup({ linkFails: true });

    await expect(
      adapter.pushCreate('integration-1', userProperty),
    ).resolves.toEqual({ integration_property_id: '4242' });
  });

  it('still fails (without linking) when the CRM create itself fails', async () => {
    const { adapter, propertyService, calls } = setup();
    propertyService.createProperty.mockRejectedValueOnce(new Error('boom'));

    await expect(
      adapter.pushCreate('integration-1', userProperty),
    ).rejects.toThrow('boom');
    expect(calls).toEqual([]);
  });
});
