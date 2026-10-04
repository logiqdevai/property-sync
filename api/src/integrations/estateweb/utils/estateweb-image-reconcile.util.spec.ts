import {
  countDistinctPhotos,
  isSourceGalleryShrunk,
  peakDistinctPhotos,
  planImageReconcile,
} from './estateweb-image-reconcile.util';
import { normalizeSourceImageIdentity } from '@/modules/user-properties/utils/duplicate-watermark-detection.util';

const normalize = (url: string) => url.split('?')[0].toLowerCase();
const u = (name: string) => `https://site/${name}`;

const plan = (
  crm: Array<[number, string | null]>,
  desired: string[],
  extra: { excluded?: string[]; blocked?: string[] } = {},
) =>
  planImageReconcile({
    crmImageIds: crm.map(([id]) => id),
    sourceById: new Map(
      crm.filter(([, src]) => src != null) as Array<[number, string]>,
    ),
    desiredImages: desired,
    excludedImages: extra.excluded ?? [],
    isUploadBlocked: (url) => (extra.blocked ?? []).includes(url),
    normalize,
  });

describe('planImageReconcile', () => {
  it('leaves an exact gallery alone', () => {
    const result = plan(
      [
        [1, u('a')],
        [2, u('b')],
      ],
      [u('a'), u('b')],
    );
    expect(result.toDelete).toEqual([]);
    expect(result.toUpload).toEqual([]);
    expect(result.orderWrong).toBe(false);
  });

  // Property 17674458: 4 kept photos, two re-uploaded twice, one raw original
  // left next to its cleaned copy.
  it('deletes duplicates and leftover originals, keeping the first copy', () => {
    const result = plan(
      [
        [1278771, u('gcs-0')],
        [1279816, u('gcs-1')],
        [1279820, u('gcs-2')],
        [1279819, u('gcs-3')],
        [1278638, u('gcs-0')],
        [1278639, u('raw-0')],
        [1279703, u('gcs-1')],
      ],
      [u('gcs-0'), u('gcs-1'), u('gcs-2'), u('gcs-3')],
    );
    expect(result.toDelete).toEqual([1278638, 1278639, 1279703]);
    expect(result.toUpload).toEqual([]);
    expect(result.orderWrong).toBe(false);
  });

  it('deletes photos beyond the cap and images with no recorded source', () => {
    const result = plan(
      [
        [1, u('a')],
        [2, null],
        [3, u('b')],
        [4, u('z')],
      ],
      [u('a'), u('b')],
    );
    expect(result.toDelete).toEqual([2, 4]);
    expect(result.orderWrong).toBe(false);
  });

  it('uploads desired photos missing from the CRM and flags order', () => {
    const result = plan([[1, u('b')]], [u('a'), u('b')]);
    expect(result.toUpload).toEqual([u('a')]);
    expect(result.toDelete).toEqual([]);
  });

  it('detects a wrong order among kept photos', () => {
    const result = plan(
      [
        [1, u('b')],
        [2, u('a')],
      ],
      [u('a'), u('b')],
    );
    expect(result.orderWrong).toBe(true);
    expect(result.toDelete).toEqual([]);
  });

  it('matches by identity, not exact url', () => {
    const result = plan([[1, u('a?v=1')]], [u('A?v=2')]);
    expect(result.toDelete).toEqual([]);
    expect(result.toUpload).toEqual([]);
  });

  it('never re-uploads an excluded photo and removes it if present', () => {
    const result = plan(
      [
        [1, u('a')],
        [2, u('b')],
      ],
      [u('a'), u('b')],
      { excluded: [u('b')] },
    );
    expect(result.desired).toEqual([u('a')]);
    expect(result.toDelete).toEqual([2]);
    expect(result.toUpload).toEqual([]);
  });

  it('skips uploads that keep failing', () => {
    const result = plan([[1, u('a')]], [u('a'), u('b')], { blocked: [u('b')] });
    expect(result.toUpload).toEqual([]);
  });
});

describe('planImageReconcile url validity', () => {
  it('ignores a scraped image without a host (creta-invest relative path)', () => {
    const result = plan([[1, u('a')]], [u('a'), '/appFol/img_2.jpg']);
    expect(result.desired).toEqual([u('a')]);
    expect(result.toUpload).toEqual([]);
  });
});

describe('shrunk source gallery, counted in distinct photos', () => {
  const sp = (id: string, size: string) =>
    `https://m2.spitogatos.gr/${id}_${size}.jpg?v=20130730`;
  const photos = Array.from({ length: 25 }, (_, i) => String(329752873 + i));
  const logo = 'https://im2.spitogatos.gr/270569992.jpg';

  it('does not count a thumbnail of a photo as another photo', () => {
    expect(
      countDistinctPhotos(
        [sp('1', '900x675'), sp('1', '150x110'), sp('2', '900x675')],
        normalizeSourceImageIdentity,
      ),
    ).toBe(2);
  });

  it('ignores non-arrays and non-string entries', () => {
    expect(countDistinctPhotos(null, normalizeSourceImageIdentity)).toBe(0);
    expect(
      countDistinctPhotos([null, 3, ' '], normalizeSourceImageIdentity),
    ).toBe(0);
    expect(
      peakDistinctPhotos([], normalizeSourceImageIdentity),
    ).toBeUndefined();
    expect(
      peakDistinctPhotos([null], normalizeSourceImageIdentity),
    ).toBeUndefined();
  });

  it('a past crawl that also read thumbnails + logo is not a shrink (samson-homes)', () => {
    const past = [
      logo,
      ...photos.map((p) => sp(p, '900x675')),
      ...photos.map((p) => sp(p, '150x110')),
    ];
    expect(past).toHaveLength(51);
    const peak = peakDistinctPhotos([past], normalizeSourceImageIdentity);
    expect(peak).toBe(26);
    const current = countDistinctPhotos(
      photos.map((p) => sp(p, '900x675')),
      normalizeSourceImageIdentity,
    );
    expect(isSourceGalleryShrunk(current, peak, null)).toBe(false);
    // counted in raw URLs it used to be flagged
    expect(isSourceGalleryShrunk(25, 51, null)).toBe(true);
  });

  it('a gallery that really lost its photos is still caught (cretahouses 11 -> 3)', () => {
    const past = Array.from(
      { length: 11 },
      (_, i) => `https://cretahouses.gr/p/${i}.jpg`,
    );
    const peak = peakDistinctPhotos(
      [past.slice(0, 5), past],
      normalizeSourceImageIdentity,
    );
    expect(peak).toBe(11);
    expect(isSourceGalleryShrunk(3, peak, 8)).toBe(true);
  });
});
