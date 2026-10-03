import { BadRequestException } from '@nestjs/common';
import { IntegrationType } from 'generated/prisma';
import { UserPropertiesService } from './user-properties.service';

// Exercises the hand-edited ("curated") photo paths of UserPropertiesService
// with Prisma and the CRM adapter mocked: every manual photo action must leave
// UserProperty.images matching what the user did, because the next CRM push
// makes the CRM gallery equal to that list.

const u = (name: string) => `https://site/${name}.jpg`;
const crm = (id: number, name: string) => ({ id, source_image: u(name) });

function buildService(state: {
  images: string[];
  crmImages: Array<{ id: number; source_image: string }>;
  canonical?: string[];
  cap?: number | null;
  excluded?: string[];
}) {
  const calls: string[] = [];
  const saved: string[][] = [];
  const adapter = {
    deleteImages: jest.fn(async () => {
      calls.push('crm-delete');
    }),
    reorderImages: jest.fn(async () => {
      calls.push('crm-reorder');
    }),
  };
  const prisma = {
    userProperty: {
      findFirst: jest.fn(async () => ({
        id: 'up-1',
        user_id: 'user-1',
        canonical_property_id: 'p-1',
        integration_property_id: '4242',
        images: state.images,
        canonical_property: { images: state.canonical ?? [] },
      })),
      findUnique: jest.fn(async () => ({ images: state.images })),
    },
    integrationProperty: {
      findMany: jest.fn(async () => [{ images: state.crmImages }]),
    },
    jobLog: { create: jest.fn(async () => ({ id: 'job-1' })) },
  };
  const imagesCuration = {
    saveCuratedImages: jest.fn(async (_id: string, images: string[]) => {
      calls.push('save-list');
      saved.push(images);
    }),
    resolveImageCap: jest.fn(async () => (state.cap === undefined ? 8 : state.cap)),
    loadExcludedSourceImages: jest.fn(async () => state.excluded ?? []),
    unexcludeSourceImages: jest.fn(async () => {
      calls.push('unexclude');
    }),
  };

  const service = Object.create(UserPropertiesService.prototype) as UserPropertiesService;
  Object.assign(service, {
    prisma,
    imagesCuration,
    cmsSyncAdapterFactory: { getAdapter: () => adapter },
    copyNormalizedImagesQueue: { add: jest.fn() },
    dewatermarkOrchestrator: { findActiveForUser: jest.fn(async () => ({ id: 'dw' })) },
  });
  const internals = service as unknown as Record<string, unknown>;
  internals.resolveCmsIntegrationForProperty = jest.fn(async () => ({
    userIntegrationId: 'integration-1',
    integrationType: IntegrationType.ESTATEWEB,
  }));
  internals.pushIntegrationImages = jest.fn(async () => {
    calls.push('crm-upload');
  });
  return { service, internals, adapter, imagesCuration, calls, saved };
}

const property = {
  id: 'up-1',
  user_id: 'user-1',
  canonical_property_id: 'p-1',
  integration_property_id: '4242',
};

describe('Delete CMS images', () => {
  it('removes the deleted photo from our own list and pins the selection', async () => {
    const { internals, saved, calls } = buildService({
      images: [u('a'), u('b'), u('c')],
      crmImages: [crm(1, 'a'), crm(2, 'b'), crm(3, 'c')],
    });

    await (internals.runDeleteIntegrationImages as Function).call(internals, property, [2]);

    expect(calls).toEqual(['crm-delete', 'save-list']);
    expect(saved[0]).toEqual([u('a'), u('c')]);
  });

  it('deleting only a duplicate copy keeps the photo in our list', async () => {
    const { internals, imagesCuration } = buildService({
      images: [u('a'), u('b')],
      crmImages: [crm(1, 'a'), crm(2, 'b'), crm(3, 'b')],
    });

    await (internals.runDeleteIntegrationImages as Function).call(internals, property, [3]);

    expect(imagesCuration.saveCuratedImages).not.toHaveBeenCalled();
  });
});

describe('Reorder CMS images', () => {
  it('our own list follows the new CRM order', async () => {
    const { internals, saved } = buildService({
      images: [u('a'), u('b'), u('c')],
      crmImages: [crm(1, 'a'), crm(2, 'b'), crm(3, 'c')],
    });

    await (internals.runReorderIntegrationImages as Function).call(internals, property, [3, 1, 2]);

    expect(saved[0]).toEqual([u('c'), u('a'), u('b')]);
  });

  it('does nothing extra when the order did not change', async () => {
    const { internals, imagesCuration } = buildService({
      images: [u('a'), u('b')],
      crmImages: [crm(1, 'a'), crm(2, 'b')],
    });

    await (internals.runReorderIntegrationImages as Function).call(internals, property, [1, 2]);

    expect(imagesCuration.saveCuratedImages).not.toHaveBeenCalled();
  });
});

describe('Copy to tracked from the normalized gallery', () => {
  const canonical = Array.from({ length: 12 }, (_, i) => u(`s${i}`));

  it('refuses to go over the "images to keep" limit before spending anything', async () => {
    const { service } = buildService({
      images: canonical.slice(0, 8),
      crmImages: [],
      canonical,
      cap: 8,
    });

    await expect(
      service.enqueueCopyNormalizedImages('user-1', 'up-1', [9, 10], true),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.enqueueCopyNormalizedImages('user-1', 'up-1', [9, 10], true),
    ).rejects.toThrow('Delete 2 photos from the CRM images first');
  });

  it('allows a swap once photos were deleted (still within the limit)', async () => {
    const { service } = buildService({
      images: canonical.slice(0, 6),
      crmImages: [],
      canonical,
      cap: 8,
    });

    await expect(
      service.enqueueCopyNormalizedImages('user-1', 'up-1', [9, 10], false),
    ).resolves.toMatchObject({ job_log_id: 'job-1' });
  });

  it('a photo deleted earlier no longer counts against the limit', async () => {
    const { service } = buildService({
      images: canonical.slice(0, 8),
      crmImages: [],
      canonical,
      cap: 8,
      excluded: [canonical[6], canonical[7]],
    });

    await expect(
      service.enqueueCopyNormalizedImages('user-1', 'up-1', [9, 10], false),
    ).resolves.toMatchObject({ job_log_id: 'job-1' });
  });

  it('saves our list before uploading, so a push in between cannot delete the new photos', async () => {
    const { service, calls, saved } = buildService({
      images: [u('a'), u('b')],
      crmImages: [],
    });

    await service.finalizeCopyNormalizedImages({
      userPropertyId: 'up-1',
      finalImageUrls: [u('n1')],
    });

    expect(calls).toEqual(['unexclude', 'save-list', 'crm-upload']);
    expect(saved[0]).toEqual([u('a'), u('b'), u('n1')]);
  });
});

describe('Crawl update of a property (syncForProperty)', () => {
  const source = Array.from({ length: 15 }, (_, i) => u(`s${i + 1}`));
  const picked = [u('s1'), u('s12'), u('s3'), u('s14'), u('s5'), u('s6'), u('s7'), u('s8')];

  function crawl(existing: Record<string, unknown>, cap: number | null) {
    const updates: Array<{ data: Record<string, unknown> }> = [];
    const pipeline = jest.fn(async () => false);
    const service = Object.create(UserPropertiesService.prototype) as UserPropertiesService;
    Object.assign(service, {
      prisma: {
        property: {
          findUnique: jest.fn(async () => ({ id: 'p-1', title: 'Villa', images: source })),
        },
        userTrackedAgency: {
          findMany: jest.fn(async () => [
            {
              id: 't-1',
              user_id: 'user-1',
              enabled: true,
              track_updated_listings: true,
              max_image_count: cap,
              text_truncate_pieces: [],
              remove_watermark: true,
              watermark_manual_selection: false,
              watermark_image_count: 8,
              cms_update_on_hash_only: true,
            },
          ]),
        },
        userProperty: {
          findUnique: jest.fn(async () => ({
            id: 'up-1',
            user_id: 'user-1',
            title: 'Villa',
            status: 'ACTIVE',
            ...existing,
          })),
          update: jest.fn(async (args) => {
            updates.push(args);
            return {};
          }),
        },
      },
      imagesCuration: { loadExcludedSourceImages: jest.fn(async () => []) },
      watermarkRemovalService: { applyTrackerWatermarkPipeline: pipeline },
    });
    const internals = service as unknown as Record<string, unknown>;
    internals.loadEstateWebSettingsByUserIds = jest.fn(async () => new Map());
    internals.enqueueResolveEstateWebLocation = jest.fn(async () => undefined);
    return { service, updates, pipeline };
  }

  const run = (service: UserPropertiesService) =>
    service.syncForProperty('p-1', {
      sourceAgencyId: 'agency-1',
      changeType: 'updated',
      contentHashChanged: false,
    });

  it('keeps a hand-picked selection instead of resetting it to the first 8 source photos', async () => {
    const { service, updates, pipeline } = crawl(
      { images: picked, images_curated_at: new Date(), images_curated_cap: 8 },
      8,
    );
    await run(service);
    for (const update of updates) expect(update.data.images).toEqual(picked);
    expect(pipeline).not.toHaveBeenCalled();
  });

  it('limit lowered 8 -> 5 trims the selection, without any watermark spend', async () => {
    const { service, updates, pipeline } = crawl(
      { images: picked, images_curated_at: new Date(), images_curated_cap: 8 },
      5,
    );
    await run(service);
    expect(updates).toHaveLength(1);
    expect(updates[0].data.images).toEqual(picked.slice(0, 5));
    expect(updates[0].data.images_curated_cap).toBe(5);
    expect(pipeline).not.toHaveBeenCalled();
  });

  it('limit raised 8 -> 10 tops the selection up from the source', async () => {
    const { service, updates } = crawl(
      { images: picked, images_curated_at: new Date(), images_curated_cap: 8 },
      10,
    );
    await run(service);
    expect(updates[0].data.images).toEqual([...picked, u('s2'), u('s4')]);
    expect(updates[0].data.images_curated_cap).toBe(10);
  });

  it('a property that was never edited by hand still follows the source', async () => {
    const { service, updates } = crawl(
      { images: picked, images_curated_at: null, images_curated_cap: null },
      8,
    );
    await run(service);
    expect(updates[0].data.images).toEqual(source.slice(0, 8));
    expect(updates[0].data.images_curated_cap).toBeUndefined();
  });
});
