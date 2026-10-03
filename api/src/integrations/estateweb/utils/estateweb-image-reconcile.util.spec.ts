import { planImageReconcile } from './estateweb-image-reconcile.util';

const normalize = (url: string) => url.split('?')[0].toLowerCase();

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
    const result = plan([[1, 'a'], [2, 'b']], ['a', 'b']);
    expect(result.toDelete).toEqual([]);
    expect(result.toUpload).toEqual([]);
    expect(result.orderWrong).toBe(false);
  });

  // Property 17674458: 4 kept photos, two re-uploaded twice, one raw original
  // left next to its cleaned copy.
  it('deletes duplicates and leftover originals, keeping the first copy', () => {
    const result = plan(
      [
        [1278771, 'gcs-0'],
        [1279816, 'gcs-1'],
        [1279820, 'gcs-2'],
        [1279819, 'gcs-3'],
        [1278638, 'gcs-0'],
        [1278639, 'raw-0'],
        [1279703, 'gcs-1'],
      ],
      ['gcs-0', 'gcs-1', 'gcs-2', 'gcs-3'],
    );
    expect(result.toDelete).toEqual([1278638, 1278639, 1279703]);
    expect(result.toUpload).toEqual([]);
    expect(result.orderWrong).toBe(false);
  });

  it('deletes photos beyond the cap and images with no recorded source', () => {
    const result = plan([[1, 'a'], [2, null], [3, 'b'], [4, 'z']], ['a', 'b']);
    expect(result.toDelete).toEqual([2, 4]);
    expect(result.orderWrong).toBe(false);
  });

  it('uploads desired photos missing from the CRM and flags order', () => {
    const result = plan([[1, 'b']], ['a', 'b']);
    expect(result.toUpload).toEqual(['a']);
    expect(result.toDelete).toEqual([]);
  });

  it('detects a wrong order among kept photos', () => {
    const result = plan([[1, 'b'], [2, 'a']], ['a', 'b']);
    expect(result.orderWrong).toBe(true);
    expect(result.toDelete).toEqual([]);
  });

  it('matches by identity, not exact url', () => {
    const result = plan([[1, 'a?v=1']], ['A?v=2']);
    expect(result.toDelete).toEqual([]);
    expect(result.toUpload).toEqual([]);
  });

  it('never re-uploads an excluded photo and removes it if present', () => {
    const result = plan([[1, 'a'], [2, 'b']], ['a', 'b'], { excluded: ['b'] });
    expect(result.desired).toEqual(['a']);
    expect(result.toDelete).toEqual([2]);
    expect(result.toUpload).toEqual([]);
  });

  it('skips uploads that keep failing', () => {
    const result = plan([[1, 'a']], ['a', 'b'], { blocked: ['b'] });
    expect(result.toUpload).toEqual([]);
  });
});
