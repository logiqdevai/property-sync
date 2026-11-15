import { chromium, type Browser, type Page } from 'playwright';
import type { CrawlItem } from '../interfaces/scraper-config.interface';
import {
  applyDetailResult,
  extractDetailPage,
  extractListingCards,
} from './page-extractors';

// The desktop crawler app receives these functions as source text (`fn.toString()`) and runs them
// in its own Chrome as `(${source})(${JSON.stringify(arg)})`. Evaluating them the same way here
// proves the compiled functions are self-contained (no helper or import referenced from outside).
const runAsSource = <T>(
  page: Page,
  fn: (arg: never) => unknown,
  arg: unknown,
): Promise<T> =>
  page.evaluate(`(${fn.toString()})(${JSON.stringify(arg)})`) as Promise<T>;

describe('page extractors (served to the desktop crawler as source)', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
  }, 60_000);

  // Listing urls resolve against the page url (like the server crawler), so load a real url.
  const serve = async (url: string, html: string) => {
    await page.route(url, (route) =>
      route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }),
    );
    await page.goto(url);
  };

  afterAll(async () => {
    await browser?.close();
  });

  it('extracts listing cards, resolving relative urls and lazy images', async () => {
    await serve(
      'https://agency.example/listings/',
      `
      <div class="card">
        <a class="link" href="/property/1">Villa</a>
        <span class="price"><del>€300.000</del> €250.000</span>
        <img src="data:image/gif;base64,R0lGOD" data-src="https://cdn.example/1.jpg">
      </div>
      <div class="card"><span class="price">€100</span></div>
      <div class="card">
        <a class="link" href="https://agency.example/property/2">Flat</a>
        <div style="background-image: url('https://cdn.example/2.jpg')"></div>
      </div>`,
    );

    const items = await runAsSource<CrawlItem[]>(page, extractListingCards, {
      listingSelector: '.card',
      fields: {
        title: '.link',
        url: { selector: '.link', type: 'href' },
        price: '.price del',
      },
    });

    expect(items).toHaveLength(2); // the card without a link is skipped
    expect(items[0].source_url).toBe('https://agency.example/property/1');
    expect(items[0].raw.title).toBe('Villa');
    expect(items[0].raw.price).toBe('€300.000 €250.000'); // struck price reads the parent
    expect(items[0].raw._all_images).toEqual(['https://cdn.example/1.jpg']);
    expect(items[1].raw._all_images).toEqual(['https://cdn.example/2.jpg']);
  });

  it('extracts a detail page and merges it like a scheduled crawl', async () => {
    await page.setContent(`
      <h1 class="t">Sea view villa</h1>
      <div class="gallery">
        <img src="https://cdn.example/a.jpg"><img src="https://cdn.example/logo.png">
      </div>
      <div class="desc">A lovely villa by the sea.</div>
      <script>var lat = 35.5138; var long = 24.0180;</script>`);

    const detail = await runAsSource<ReturnType<typeof extractDetailPage>>(
      page,
      extractDetailPage,
      {
        image_selector: '.gallery img',
        description_selector: '.desc',
        title_selector: '.t',
      },
    );

    expect(detail.images).toEqual(['https://cdn.example/a.jpg']); // logo dropped
    expect(detail.raw_detail_text).toContain('lovely villa');
    expect(detail.title).toBe('Sea view villa');
    expect(detail.latitude).toBeCloseTo(35.5138);

    const item: CrawlItem = {
      source_url: 'https://agency.example/property/1',
      raw: { title: 'Villa', _all_images: ['https://cdn.example/card.jpg'] },
    };
    applyDetailResult(item, detail, { image_selector: '.gallery img' });
    expect(item.raw.title).toBe('Sea view villa');
    expect(item.raw._all_images).toEqual([
      'https://cdn.example/a.jpg',
      'https://cdn.example/card.jpg',
    ]);
    expect(item.raw._lat_lng).toBe(`${detail.latitude},${detail.longitude}`);
  });

  it('marks a failed detail page without touching the card data', () => {
    const item: CrawlItem = {
      source_url: 'https://x.example/1',
      raw: { title: 'Card' },
    };
    applyDetailResult(item, {
      error: 'redirected away',
      excludeFromCrawl: true,
    });
    expect(item.raw).toEqual({
      title: 'Card',
      _detail_enrichment_error: 'redirected away',
      _crawl_exclude: true,
    });
  });
});
