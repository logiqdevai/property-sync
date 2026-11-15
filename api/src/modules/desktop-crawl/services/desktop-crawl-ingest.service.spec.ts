import { DesktopCrawlIngestService } from './desktop-crawl-ingest.service';
import type { DesktopCrawlUploadItem } from '../interfaces/desktop-crawl.interfaces';
import type {
  CrawlItem,
  ScraperConfig,
} from '@/integrations/crawler/interfaces/scraper-config.interface';

// buildCrawlItems turns the desktop app's raw upload into the CrawlItems a scheduled crawl would
// have produced; the database side is the same code as scripts/mcp-crawl-ingest.ts.
const build = (
  items: DesktopCrawlUploadItem[],
  config: Partial<ScraperConfig>,
) =>
  (
    new DesktopCrawlIngestService({} as never, {} as never) as unknown as {
      buildCrawlItems(
        i: DesktopCrawlUploadItem[],
        c: ScraperConfig,
      ): CrawlItem[];
    }
  ).buildCrawlItems(items, config as ScraperConfig);

const detail = (over: Record<string, unknown> = {}) => ({
  images: ['https://cdn.x/a.jpg'],
  raw_detail_text: 'A lovely house',
  detail_specs: {},
  detail_features: [],
  external_id: null,
  title: 'Full title',
  price: '€100.000',
  location: null,
  latitude: null,
  longitude: null,
  ...over,
});

describe('DesktopCrawlIngestService.buildCrawlItems', () => {
  const config = { detail_page: { image_selector: '.gallery img' } };

  it('merges a good detail page like a scheduled crawl', () => {
    const [item] = build(
      [
        {
          source_url: 'https://agency.x/p/1',
          raw: { title: 'Card', _all_images: ['https://cdn.x/card.jpg'] },
          detail: detail(),
          detail_final_url: 'https://agency.x/p/1',
          detail_body_text_length: 900,
        },
      ],
      config,
    );
    expect(item.raw.title).toBe('Full title');
    expect(item.raw._all_images).toEqual([
      'https://cdn.x/a.jpg',
      'https://cdn.x/card.jpg',
    ]);
    expect(item.raw._detail_text).toBe('A lovely house');
    expect(item.raw._detail_enrichment_error).toBeUndefined();
  });

  it('excludes a listing whose page redirected away, keeps a failed one alive', () => {
    const [redirected, failed] = build(
      [
        {
          source_url: 'https://agency.x/property/5',
          raw: { title: 'Gone' },
          detail: detail({ title: null }),
          detail_final_url: 'https://agency.x/listings?page=1',
        },
        {
          source_url: 'https://agency.x/p/6',
          raw: { title: 'Card 6' },
          detail_error: 'net::ERR_TIMED_OUT',
        },
      ],
      config,
    );
    expect(redirected.raw._crawl_exclude).toBe(true);
    expect(failed.raw._detail_enrichment_error).toBe('net::ERR_TIMED_OUT');
    expect(failed.raw._crawl_exclude).toBeUndefined();
    expect(failed.raw.title).toBe('Card 6');
  });

  it('rejects a truncated page and drops duplicate urls', () => {
    const items = build(
      [
        {
          source_url: 'https://agency.x/p/7',
          raw: { title: 'Card 7' },
          detail: detail({ images: [], raw_detail_text: null }),
          detail_final_url: 'https://agency.x/p/7',
          detail_body_text_length: 20,
        },
        { source_url: 'https://agency.x/p/7', raw: { title: 'dup' } },
      ],
      {
        detail_page: {
          image_selector: '.gallery img',
          description_selector: '.d',
        },
      },
    );
    expect(items).toHaveLength(1);
    expect(items[0].raw._detail_enrichment_error).toMatch(
      /incomplete detail page/,
    );
  });
});
