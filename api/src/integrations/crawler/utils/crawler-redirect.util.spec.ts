import {
  isDetailPageRedirectAway,
  normalizeUrlPath,
} from './crawler.utils';

describe('isDetailPageRedirectAway', () => {
  it('ignores trailing-slash-only differences', () => {
    expect(
      isDetailPageRedirectAway(
        'https://www.euroland-crete.com/property/foo-ah152/',
        'https://www.euroland-crete.com/property/foo-ah152',
      ),
    ).toBe(false);
  });

  it('flags /property/ redirects to project marketing pages', () => {
    expect(
      isDetailPageRedirectAway(
        'https://www.euroland-crete.com/property/sea-view-project-for-sale-ah152/',
        'https://www.euroland-crete.com/buy-modern-apartments-in-chania/',
      ),
    ).toBe(true);
    expect(
      isDetailPageRedirectAway(
        'https://www.euroland-crete.com/property/luxurious-sea-view-apartments-in-chania-city-center-ah161/',
        'https://www.euroland-crete.com/halepa-heights-luxury-apartments-chania/',
      ),
    ).toBe(true);
  });

  it('keeps same-section slug changes under /property/', () => {
    expect(
      isDetailPageRedirectAway(
        'https://www.euroland-crete.com/property/old-slug/',
        'https://www.euroland-crete.com/property/new-slug/',
      ),
    ).toBe(false);
  });

  it('flags cross-origin redirects', () => {
    expect(
      isDetailPageRedirectAway(
        'https://www.euroland-crete.com/property/foo/',
        'https://other.example/property/foo/',
      ),
    ).toBe(true);
  });
});

describe('normalizeUrlPath', () => {
  it('strips trailing slashes', () => {
    expect(normalizeUrlPath('/property/foo/')).toBe('/property/foo');
    expect(normalizeUrlPath('/')).toBe('/');
  });
});
