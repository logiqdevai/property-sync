import {
  applyStoredDetail,
  DetailEnrichmentService,
  getDetailEnrichedAt,
  isIncompleteDetailExtraction,
} from './detail-enrichment.service';
import { CrawlItem } from '../interfaces/scraper-config.interface';

describe('isIncompleteDetailExtraction', () => {
  const cretahouses = {
    image_selector: '.owl-carousel.single-property img',
    description_selector: 'h3.property-heading + p',
  };

  const nothing = { images: [], raw_detail_text: null };

  // cretahouses.gr returned a head-only document behind a 200: no body, no
  // gallery, no description. It must count as a failed fetch.
  it('flags a truncated page with no body, gallery or description', () => {
    expect(isIncompleteDetailExtraction(nothing, cretahouses, 0)).toBe(true);
  });

  // A real full page for a listing with no photos (housemarket plots) must
  // still count as read, so its price/title keep updating.
  it('accepts a full page that simply has no photos', () => {
    expect(isIncompleteDetailExtraction(nothing, cretahouses, 5000)).toBe(false);
  });

  it('accepts a page with gallery images', () => {
    expect(
      isIncompleteDetailExtraction({ images: ['a.jpg'], raw_detail_text: null }, cretahouses, 0),
    ).toBe(false);
  });

  it('accepts a page with a description but no gallery', () => {
    expect(
      isIncompleteDetailExtraction({ images: [], raw_detail_text: 'Villa' }, cretahouses, 0),
    ).toBe(false);
  });

  it('never flags scrapers without a configured gallery selector', () => {
    expect(isIncompleteDetailExtraction(nothing, {}, 0)).toBe(false);
    expect(isIncompleteDetailExtraction(nothing, null, 0)).toBe(false);
  });
});

describe('getDetailEnrichedAt', () => {
  it('parses the stored ISO timestamp', () => {
    const iso = '2026-09-28T06:00:00.000Z';
    expect(getDetailEnrichedAt({ _detail_enriched_at: iso })).toBe(
      Date.parse(iso),
    );
  });

  it('returns null when missing, malformed or not a string', () => {
    expect(getDetailEnrichedAt(undefined)).toBeNull();
    expect(getDetailEnrichedAt({})).toBeNull();
    expect(getDetailEnrichedAt({ _detail_enriched_at: 'nope' })).toBeNull();
    expect(getDetailEnrichedAt({ _detail_enriched_at: 123 })).toBeNull();
  });
});

describe('applyStoredDetail', () => {
  const stored = {
    title: 'Detail title',
    price: '250.000 €',
    location: 'Detail location',
    _all_images: ['a.jpg', 'b.jpg'],
    _detail_text: 'Full description',
    _detail_specs: { sqm: '97' },
    _detail_features: ['Parking'],
    _detail_enriched_at: '2026-09-28T06:00:00.000Z',
  };

  it('copies detail-derived keys and keeps fresh card fields', () => {
    const item: CrawlItem = {
      source_url: 'https://x.test/1',
      raw: {
        title: 'Card title',
        price: '240.000 €',
        _all_images: ['thumb.jpg'],
      },
    };
    applyStoredDetail(item, stored, {});
    expect(item.raw._all_images).toEqual(['a.jpg', 'b.jpg']);
    expect(item.raw._detail_text).toBe('Full description');
    expect(item.raw._detail_enriched_at).toBe(stored._detail_enriched_at);
    expect(item.raw.title).toBe('Card title');
    expect(item.raw.price).toBe('240.000 €');
  });

  it('carries title/price/location only when the detail config overrides them', () => {
    const item: CrawlItem = {
      source_url: 'https://x.test/1',
      raw: {
        title: 'Card title',
        price: '240.000 €',
        location: 'Card location',
      },
    };
    applyStoredDetail(item, stored, {
      title_selector: '.t',
      location_selector: '.l',
    });
    expect(item.raw.title).toBe('Detail title');
    expect(item.raw.location).toBe('Detail location');
    expect(item.raw.price).toBe('240.000 €');
  });
});

describe('DetailEnrichmentService.enrichDetailPages deadline handling', () => {
  it('marks items it never reached and reports them', async () => {
    const service = new DetailEnrichmentService(
      {} as never,
      {
        getCrawlerConfig: jest.fn().mockResolvedValue({
          detail_concurrency: 1,
          detail_delay_ms: 0,
          page_timeout_ms: 1000,
        }),
      } as never,
      {} as never,
    );
    const items: CrawlItem[] = [1, 2, 3].map((n) => ({
      source_url: `https://x.test/${n}`,
      raw: {},
    }));

    // Deadline already passed: no lane may start a single page.
    const summary = await service.enrichDetailPages(items, null, undefined, {
      deadlineAt: Date.now() - 1,
    });

    expect(summary).toEqual({ total: 3, attempted: 0, notAttempted: 3 });
    for (const item of items) {
      expect(item.raw._detail_not_attempted).toBe(true);
    }
  });

  it('returns an empty summary for no items', async () => {
    const service = new DetailEnrichmentService(
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.enrichDetailPages([])).resolves.toEqual({
      total: 0,
      attempted: 0,
      notAttempted: 0,
    });
  });
});
