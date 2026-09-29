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

  function setup() {
    const propertyService = {
      getProperty: jest.fn(),
      updateProperty: jest.fn().mockResolvedValue(undefined),
    };
    const adapter = new EstateWebCmsSyncAdapter(
      {} as never,
      propertyService as never,
      {
        resolveAdLanguages: jest.fn().mockResolvedValue([1, 4, 3, 6]),
      } as never,
      {} as never,
      {} as never,
    );
    const stubs = adapter as unknown as Record<string, unknown>;
    const buildPayload = jest
      .fn()
      .mockReturnValue({ sites: [], ads: ['built-ads'] });
    stubs.buildPayload = buildPayload;
    const resolveContentAds = jest.fn().mockResolvedValue({ languages: [] });
    stubs.resolveContentAds = resolveContentAds;
    const persist = jest.fn().mockResolvedValue(undefined);
    stubs.persistIntegrationPropertySites = persist;
    return { adapter, propertyService, buildPayload, resolveContentAds, persist };
  }

  // Uses the exact same payload-building path as pushUpdate's known-working
  // `sitesOverride: []` case -- NOT a round-trip GET + verify. A prior version
  // here round-tripped the full record and hard-failed on a re-GET that still
  // showed sites live; that "still live" check was firing on EstateWeb's
  // read-after-write lag (confirmed live), producing false failures for every
  // property. See the comment on pushRemove for the incident.
  it('builds the payload via buildPayload with sites: [] passed as-is (useSitesAsProvided)', async () => {
    const { adapter, propertyService, buildPayload, resolveContentAds } = setup();

    await adapter.pushRemove('integration-1', '56482', userProperty);

    expect(resolveContentAds).toHaveBeenCalledWith(userProperty, 'integration-1');
    expect(buildPayload).toHaveBeenCalledWith(
      [],
      [1, 4, 3, 6],
      userProperty,
      56482,
      true,
      { languages: [] },
    );
    expect(propertyService.updateProperty).toHaveBeenCalledWith(
      'integration-1',
      '56482',
      { sites: [], ads: ['built-ads'] },
    );
  });

  it('does not persist sites locally (lets it resurrect on next pushUpdate)', async () => {
    const { adapter, persist } = setup();

    await adapter.pushRemove('integration-1', '56482', userProperty);

    expect(persist).toHaveBeenCalledTimes(1);
    const params = persist.mock.calls[0][0];
    expect(params.sites).toBeUndefined();
    expect(params.ads).toEqual(['built-ads']);
  });

  it('does not verify against EstateWeb afterward -- no post-write getProperty call', async () => {
    const { adapter, propertyService } = setup();

    await adapter.pushRemove('integration-1', '56482', userProperty);

    expect(propertyService.getProperty).not.toHaveBeenCalled();
  });
});

describe('EstateWebCmsSyncAdapter.ensureImagesCached', () => {
  const cmsImage = (id: number, sourceUrl: string) => ({
    id,
    path: 'agent-1',
    filename: `img-${id}.jpg`,
    show_on_site: true,
    show_on_groups: true,
    show_on_foreign_agents: true,
    source_image: sourceUrl,
  });

  function setup(options: {
    cachedRow?: {
      images?: unknown;
      linked_via_reconciliation?: boolean;
      excluded_source_images?: unknown;
      image_upload_failures?: unknown;
    } | null;
    remoteImages?: unknown[];
    remoteImagesAfterUpload?: unknown[];
  }) {
    const upsertCalls: unknown[] = [];
    const prisma = {
      userIntegration: {
        findUnique: jest.fn().mockResolvedValue({
          user_id: 'user-1',
          user_integration_settings_id: 'settings-1',
        }),
      },
      integrationProperty: {
        findUnique: jest.fn().mockResolvedValue(
          options.cachedRow === undefined
            ? { images: [], linked_via_reconciliation: false }
            : options.cachedRow,
        ),
        upsert: jest.fn().mockImplementation(async (args) => {
          upsertCalls.push(args);
          return {};
        }),
      },
      userProperty: {
        findUnique: jest.fn().mockResolvedValue({ images: [] }),
      },
    };

    const propertyService = {
      getProperty: jest
        .fn()
        .mockResolvedValueOnce({ id: 4242, images: options.remoteImages ?? [] })
        .mockResolvedValue({
          id: 4242,
          images: options.remoteImagesAfterUpload ?? options.remoteImages ?? [],
        }),
      uploadPropertyImage: jest.fn().mockResolvedValue({ id: 999 }),
      deletePropertyImage: jest.fn().mockResolvedValue(undefined),
    };

    const adapter = new EstateWebCmsSyncAdapter(
      prisma as never,
      propertyService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const stubs = adapter as unknown as Record<string, unknown>;
    stubs.downloadImage = jest
      .fn()
      .mockResolvedValue(Buffer.from('fake-image-bytes'));

    return { adapter, prisma, propertyService, upsertCalls };
  }

  it('reconciled link: leaves an already-nonempty remote listing untouched', async () => {
    const { adapter, propertyService } = setup({
      cachedRow: {
        images: [cmsImage(1, 'https://source/url1.jpg')],
        linked_via_reconciliation: true,
      },
      remoteImages: [cmsImage(1, 'https://source/url1.jpg')],
    });

    await adapter.ensureImagesCached({
      userIntegrationId: 'integration-1',
      crmPropertyId: '4242',
      userPropertyId: 'up-1',
      sourceImages: ['https://source/url1.jpg', 'https://source/url2.jpg'],
    });

    // The remote listing already has a photo and was linked via reconciliation
    // (not created by us) -- never top it up from our scraped source.
    expect(propertyService.uploadPropertyImage).not.toHaveBeenCalled();
  });

  it('own listing: tops up a missing image without re-uploading the one already present', async () => {
    const { adapter, propertyService } = setup({
      cachedRow: {
        images: [cmsImage(1, 'https://source/url1.jpg')],
        linked_via_reconciliation: false,
      },
      remoteImages: [cmsImage(1, 'https://source/url1.jpg')],
      remoteImagesAfterUpload: [
        cmsImage(1, 'https://source/url1.jpg'),
        cmsImage(2, 'https://source/url2.jpg'),
      ],
    });

    await adapter.ensureImagesCached({
      userIntegrationId: 'integration-1',
      crmPropertyId: '4242',
      userPropertyId: 'up-1',
      sourceImages: ['https://source/url1.jpg', 'https://source/url2.jpg'],
    });

    expect(propertyService.uploadPropertyImage).toHaveBeenCalledTimes(1);
    const [, , , payload] = propertyService.uploadPropertyImage.mock.calls[0];
    // Appended after the one image already on the listing, not overwriting it.
    expect(payload.zindex).toBe(2);
  });

  it('never re-uploads a source image the user deliberately deleted from the CRM', async () => {
    const { adapter, propertyService } = setup({
      cachedRow: {
        images: [cmsImage(1, 'https://source/url1.jpg')],
        linked_via_reconciliation: false,
        excluded_source_images: ['https://source/url2.jpg'],
      },
      remoteImages: [cmsImage(1, 'https://source/url1.jpg')],
    });

    await adapter.ensureImagesCached({
      userIntegrationId: 'integration-1',
      crmPropertyId: '4242',
      userPropertyId: 'up-1',
      sourceImages: ['https://source/url1.jpg', 'https://source/url2.jpg'],
    });

    expect(propertyService.uploadPropertyImage).not.toHaveBeenCalled();
  });

  it('stops retrying a source image that has already failed the maximum number of times', async () => {
    const { adapter, propertyService } = setup({
      cachedRow: {
        images: [cmsImage(1, 'https://source/url1.jpg')],
        linked_via_reconciliation: false,
        image_upload_failures: {
          'https://source/url2.jpg': {
            attempts: 5,
            last_attempt_at: '2026-01-01T00:00:00.000Z',
          },
        },
      },
      remoteImages: [cmsImage(1, 'https://source/url1.jpg')],
    });

    await adapter.ensureImagesCached({
      userIntegrationId: 'integration-1',
      crmPropertyId: '4242',
      userPropertyId: 'up-1',
      sourceImages: ['https://source/url1.jpg', 'https://source/url2.jpg'],
    });

    expect(propertyService.uploadPropertyImage).not.toHaveBeenCalled();
  });

  it('does not re-upload a photo already cached under a different size/query variant of the same URL', async () => {
    // Regression: a photo cached from an older crawl as a thumbnail
    // (`_300x220`) must still be recognised as "already on the CRM" once a
    // newer crawl stores the same photo at full size (`_900x675`) or with a
    // different cache-busting query string -- otherwise it gets uploaded
    // again as a duplicate.
    const { adapter, propertyService } = setup({
      cachedRow: {
        images: [
          cmsImage(1, 'https://m2.spitogatos.gr/77905567_300x220.jpg?v=20130730'),
        ],
        linked_via_reconciliation: false,
      },
      remoteImages: [
        cmsImage(1, 'https://m2.spitogatos.gr/77905567_300x220.jpg?v=20130730'),
      ],
    });

    await adapter.ensureImagesCached({
      userIntegrationId: 'integration-1',
      crmPropertyId: '4242',
      userPropertyId: 'up-1',
      sourceImages: [
        'https://m2.spitogatos.gr/77905567_900x675.jpg?v=20130730',
      ],
    });

    expect(propertyService.uploadPropertyImage).not.toHaveBeenCalled();
  });
});

describe('EstateWebCmsSyncAdapter.deleteImages', () => {
  it('records the deleted image source urls so a future sync never re-adds them', async () => {
    const upsertCalls: unknown[] = [];
    const prisma = {
      userIntegration: {
        findUnique: jest.fn().mockResolvedValue({
          user_id: 'user-1',
          user_integration_settings_id: 'settings-1',
        }),
      },
      integrationProperty: {
        findUnique: jest.fn().mockResolvedValue({
          images: [
            {
              id: 1,
              path: 'agent-1',
              filename: 'img-1.jpg',
              source_image: 'https://source/url1.jpg',
            },
            {
              id: 2,
              path: 'agent-1',
              filename: 'img-2.jpg',
              source_image: 'https://source/url2.jpg',
            },
          ],
          excluded_source_images: null,
        }),
        upsert: jest.fn().mockImplementation(async (args) => {
          upsertCalls.push(args);
          return {};
        }),
      },
    };
    const propertyService = {
      deletePropertyImage: jest.fn().mockResolvedValue(undefined),
      getProperty: jest.fn().mockResolvedValue({ id: 4242, images: [] }),
    };

    const adapter = new EstateWebCmsSyncAdapter(
      prisma as never,
      propertyService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await adapter.deleteImages({
      userIntegrationId: 'integration-1',
      crmPropertyId: '4242',
      userPropertyId: 'up-1',
      imageIds: [2],
    });

    expect(propertyService.deletePropertyImage).toHaveBeenCalledWith(
      'integration-1',
      2,
    );
    const excludeUpsert = upsertCalls.find((call) => {
      const data = call as { update?: { excluded_source_images?: unknown } };
      return data.update?.excluded_source_images !== undefined;
    }) as { update: { excluded_source_images: string[] } };
    expect(excludeUpsert).toBeDefined();
    expect(excludeUpsert.update.excluded_source_images).toEqual([
      'https://source/url2.jpg',
    ]);
  });
});
