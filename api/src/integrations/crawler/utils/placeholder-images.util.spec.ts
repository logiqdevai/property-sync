import {
  findSharedPlaceholderKeys,
  imageFileNameKey,
  isSharedPlaceholderImage,
  stripSharedPlaceholdersFromItems,
} from './placeholder-images.util';

const logo = (folder: string) =>
  `https://i0.wp.com/site.gr/wp-content/uploads/${folder}/teliko60.jpg?resize=488%2C281&ssl=1`;

describe('placeholder-images.util', () => {
  it('flags the same file re-uploaded into different date folders', () => {
    const keys = findSharedPlaceholderKeys([
      [logo('2019/09')],
      [logo('2022/07')],
      [logo('2025/12')],
      ['https://site.gr/wp-content/uploads/2024/01/villa-front.jpg'],
    ]);
    expect(isSharedPlaceholderImage(logo('2030/01'), keys)).toBe(true);
    expect(
      isSharedPlaceholderImage(
        'https://site.gr/wp-content/uploads/2024/01/villa-front.jpg',
        keys,
      ),
    ).toBe(false);
  });

  it('does not treat generic camera/CMS file names as shared', () => {
    const lists = ['a', 'b', 'c', 'd'].map((id) => [
      `https://site.gr/listings/${id}/1.jpg`,
      `https://site.gr/listings/${id}/IMG_0042.jpg`,
      `https://site.gr/listings/${id}/image.jpg`,
    ]);
    expect(findSharedPlaceholderKeys(lists).size).toBe(0);
    expect(imageFileNameKey('https://x.gr/a/DSC01234.jpg')).toBeNull();
  });

  it('respects the threshold and collapses repeats inside one listing', () => {
    const dup = [logo('2019/09'), logo('2019/09')];
    expect(findSharedPlaceholderKeys([dup, [logo('2022/07')]]).size).toBe(0);
    expect(
      findSharedPlaceholderKeys([dup, [logo('2022/07')], [logo('2025/12')]])
        .size,
    ).toBeGreaterThan(0);
  });

  it('ignores a photo reused inside multi-photo galleries', () => {
    const building = 'https://site.gr/uploads/building-exterior.jpg';
    const lists = [1, 2, 3, 4].map((n) => [
      building,
      `https://site.gr/uploads/unit-${n}-living.jpg`,
    ]);
    expect(findSharedPlaceholderKeys(lists).size).toBe(0);
  });

  it('strips from image and _all_images in place', () => {
    const items = ['2019/09', '2022/07', '2025/12'].map((f) => ({
      raw: { image: logo(f), _all_images: [logo(f)] } as Record<
        string,
        unknown
      >,
    }));
    const result = stripSharedPlaceholdersFromItems(items);
    expect(result.affectedItems).toBe(3);
    expect(items[0].raw.image).toBeNull();
    expect(items[0].raw._all_images).toEqual([]);
  });
});
