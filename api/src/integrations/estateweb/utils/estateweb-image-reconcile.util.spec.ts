import { planImageReconcile } from './estateweb-image-reconcile.util';

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
