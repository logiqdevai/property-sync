import {
  computeCuratedImages,
  computeResetImages,
} from './curated-images.util';

const normalize = (url: string) => url.split('?')[0].toLowerCase();
const u = (name: string) => `https://site/${name}.jpg`;
const source = Array.from({ length: 15 }, (_, i) => u(`s${i + 1}`));

const curated = (
  selection: string[],
  maxImageCount: number | null,
  curatedCap: number | null,
  excluded: string[] = [],
) =>
  computeCuratedImages({
    curated: selection,
    canonical: source,
    excluded,
    maxImageCount,
    curatedCap,
    normalize,
  });

describe('computeCuratedImages', () => {
  const picked = [
    u('s1'),
    u('s2'),
    u('s12'),
    u('s4'),
    u('s5'),
    u('s6'),
    u('s14'),
    u('s8'),
  ];

  // Client case 1: two photos swapped for normalized ones, still 8.
  it('keeps a hand-picked selection exactly, in the user order', () => {
    expect(curated(picked, 8, 8).images).toEqual(picked);
  });

  it('does not refill slots the user freed by deleting photos', () => {
    const six = picked.slice(0, 6);
    expect(curated(six, 8, 8, [u('s7'), u('s3')]).images).toEqual(six);
  });

  it('never keeps more than the cap', () => {
    const ten = [...picked, u('s13'), u('s15')];
    expect(curated(ten, 8, 8).images).toEqual(picked);
  });

  it('cap lowered 8 -> 5 keeps the first five of the user order', () => {
    expect(curated(picked, 5, 8)).toEqual({
      images: picked.slice(0, 5),
      curatedCap: 5,
    });
  });

  it('cap raised 8 -> 12 tops up with the next source photos not already picked', () => {
    const result = curated(picked, 12, 8);
    expect(result.images).toEqual([
      ...picked,
      u('s3'),
      u('s7'),
      u('s9'),
      u('s10'),
    ]);
    expect(result.curatedCap).toBe(12);
  });

  it('a raise never brings back a photo the user deleted', () => {
    const result = curated(picked, 12, 8, [u('s3'), u('s7')]);
    expect(result.images).toEqual([
      ...picked,
      u('s9'),
      u('s10'),
      u('s11'),
      u('s13'),
    ]);
  });

  it('lowered then raised again tops back up from the source', () => {
    const lowered = curated(picked, 5, 8);
    const raised = curated(lowered.images, 8, lowered.curatedCap);
    expect(raised.images).toEqual([
      ...picked.slice(0, 5),
      u('s3'),
      u('s6'),
      u('s7'),
    ]);
  });

  it('raise beyond what the source has adds what exists', () => {
    expect(curated(source.slice(0, 13), 20, 13).images).toEqual(source);
  });

  it('cap changed to keep all tops up with every remaining source photo', () => {
    expect(curated(picked, null, 8).images).toHaveLength(15);
  });

  it('keep all with no cap change does not grow', () => {
    expect(curated(picked, null, null).images).toEqual(picked);
  });

  it('cap 0 empties the selection', () => {
    expect(curated(picked, 0, 8)).toEqual({ images: [], curatedCap: 0 });
  });

  it('drops deleted photos and duplicate copies from the selection', () => {
    const messy = [u('s1'), `${u('s1')}?v=2`, u('s2'), u('s3')];
    expect(curated(messy, 8, 8, [u('s3')]).images).toEqual([u('s1'), u('s2')]);
  });

  it('never tops up with a source image that has no host', () => {
    const result = computeCuratedImages({
      curated: [u('a')],
      canonical: ['/relative/img.jpg', u('b')],
      excluded: [],
      maxImageCount: 3,
      curatedCap: 1,
      normalize,
    });
    expect(result.images).toEqual([u('a'), u('b')]);
  });
});

describe('computeResetImages', () => {
  const gcs = (name: string, hash?: string) =>
    `https://storage/property-images/${name}${hash ? `-src-${hash}` : ''}.jpg`;
  const reset = (existing: string[], canonical: string[], cap: number | null) =>
    computeResetImages({
      existing,
      canonical,
      maxImageCount: cap,
      isProcessed: (url) => url.includes('/property-images/'),
      embeddedHashOf: (url) =>
        (url.match(/-src-([a-z0-9]+)\.jpg$/) || [])[1] ?? null,
      hashOfSource: (url) => `h${url.match(/s(\d+)\.jpg$/)?.[1]}`,
    });

  it('goes back to the first N source photos', () => {
    expect(reset([u('s9'), u('s2')], source, 3)).toEqual([
      u('s1'),
      u('s2'),
      u('s3'),
    ]);
  });

  it('reuses a cleaned copy for its exact photo even after a reorder', () => {
    const clean2 = gcs('clean2', 'h2');
    expect(reset([clean2, u('s1')], source, 3)).toEqual([
      u('s1'),
      clean2,
      u('s3'),
    ]);
  });

  it('keeps an older cleaned copy without a hash in the slot it held', () => {
    const old0 = gcs('old0');
    expect(reset([old0, u('s5')], source, 3)).toEqual([old0, u('s2'), u('s3')]);
  });

  it('cap 0 is empty', () => {
    expect(reset([u('s1')], source, 0)).toEqual([]);
  });
});
