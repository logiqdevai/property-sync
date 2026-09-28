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

describe('EstateWebCmsSyncAdapter.pushRemove', () => {
  const userProperty = {
    id: 'up-1',
    user_id: 'user-1',
    title: 'Τίτλος',
    description: 'Περιγραφή',
    estateweb_type_id: 10,
    estateweb_location_id: 20,
  } as unknown as UserProperty;

  const englishAd = {
    lang_id: 2,
    title: 'English title',
    description: 'English description',
    text: 'English description',
  };
  const italianAd = {
    lang_id: 5,
    title: 'Titolo italiano',
    description: 'Descrizione italiana',
    text: 'Descrizione italiana',
  };

  function setup(options: {
    remoteAds?: unknown[];
    remoteFails?: boolean;
    storedAds?: unknown[] | null;
  }) {
    const prisma = {
      userIntegration: {
        findUnique: jest.fn().mockResolvedValue({
          user_id: 'user-1',
          user_integration_settings_id: 'settings-1',
        }),
      },
      integrationProperty: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            options.storedAds === null
              ? null
              : { ads: options.storedAds ?? [] },
          ),
      },
    };
    const propertyService = {
      getProperty: options.remoteFails
        ? jest.fn().mockRejectedValue(new Error('EstateWeb down'))
        : jest.fn().mockResolvedValue({ ads: options.remoteAds ?? [] }),
      updateProperty: jest.fn().mockResolvedValue(undefined),
    };
    const adapter = new EstateWebCmsSyncAdapter(
      prisma as never,
      propertyService as never,
      {
        // EN (2) and IT (5) are deliberately NOT ad languages, like the real setup.
        resolveAdLanguages: jest.fn().mockResolvedValue([1, 4, 3, 6]),
      } as never,
      {} as never,
      {} as never,
    );
    const stubs = adapter as unknown as Record<string, unknown>;
    const buildPayload = jest.fn().mockReturnValue({ sites: [], ads: [] });
    stubs.buildPayload = buildPayload;
    const persist = jest.fn().mockResolvedValue(undefined);
    stubs.persistIntegrationPropertySites = persist;
    return { adapter, propertyService, buildPayload, persist };
  }

  it('resends the ads already on the CRM listing instead of blanking EN/IT', async () => {
    const { adapter, buildPayload, propertyService } = setup({
      remoteAds: [englishAd, italianAd],
    });

    await adapter.pushRemove('integration-1', '56482', userProperty);

    const adMaps = buildPayload.mock.calls[0][5];
    expect(adMaps.titles).toEqual({ 2: 'English title', 5: 'Titolo italiano' });
    expect(adMaps.descriptions).toEqual({
      2: 'English description',
      5: 'Descrizione italiana',
    });
    // Unpublished: no sites.
    expect(buildPayload.mock.calls[0][0]).toEqual([]);
    expect(propertyService.updateProperty).toHaveBeenCalledTimes(1);
  });

  it('does not wipe the stored ads record when unpublishing', async () => {
    const { adapter, persist } = setup({ remoteAds: [englishAd] });

    await adapter.pushRemove('integration-1', '56482', userProperty);

    expect(persist).toHaveBeenCalledTimes(1);
    const params = persist.mock.calls[0][0];
    expect(params.ads).toBeUndefined();
    expect(params.sites).toBeUndefined();
  });

  it('falls back to the last-published ads when the CRM cannot be read', async () => {
    const { adapter, buildPayload } = setup({
      remoteFails: true,
      storedAds: [englishAd, italianAd],
    });

    await adapter.pushRemove('integration-1', '56482', userProperty);

    expect(buildPayload.mock.calls[0][5].titles).toEqual({
      2: 'English title',
      5: 'Titolo italiano',
    });
  });

  it('keeps the old behaviour only when no existing ads are known anywhere', async () => {
    const { adapter, buildPayload } = setup({ remoteAds: [], storedAds: null });

    await adapter.pushRemove('integration-1', '56482', userProperty);

    expect(buildPayload.mock.calls[0][5]).toBeUndefined();
  });
});
