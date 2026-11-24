import { CrawlerService } from './crawler.service';
import {
  CrawlResult,
  ScraperConfig,
} from '../interfaces/scraper-config.interface';

const ok = (urls: string[]): CrawlResult => ({
  items: urls.map((u) => ({ source_url: u, raw: {} })),
  steps: [],
  success: true,
});

function build(results: Record<string, CrawlResult>) {
  const calls: string[] = [];
  const diagnostics = {
    run: (_ctx: unknown, fn: (page: unknown) => Promise<CrawlResult>) =>
      fn({}),
  };
  const service = new CrawlerService(
    diagnostics as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  (service as unknown as Record<string, unknown>).scrapeListingPages = (
    _page: unknown,
    cfg: ScraperConfig,
  ) => {
    calls.push(cfg.start_url);
    return Promise.resolve(results[cfg.start_url]);
  };
  return { service, calls };
}

const base: ScraperConfig = {
  start_url: 'https://x.test/a',
  listing_selector: '.card',
};

describe('CrawlerService.runCrawl extra_start_urls', () => {
  it('walks every start url and merges items without duplicates', async () => {
    const { service, calls } = build({
      'https://x.test/a': ok(['1', '2']),
      'https://x.test/b': ok(['3', '2']),
      'https://x.test/c': ok(['4']),
    });
    const res = await service.runCrawl(
      {
        ...base,
        extra_start_urls: ['https://x.test/b', 'https://x.test/c'],
      },
      {} as never,
    );
    expect(calls).toEqual([
      'https://x.test/a',
      'https://x.test/b',
      'https://x.test/c',
    ]);
    expect(res.success).toBe(true);
    expect(res.items.map((i) => i.source_url)).toEqual(['1', '2', '3', '4']);
  });

  it('fails the whole run when an extra sweep fails', async () => {
    const { service } = build({
      'https://x.test/a': ok(['1']),
      'https://x.test/b': {
        items: [],
        steps: [],
        success: false,
        errorSummary: 'boom',
      },
    });
    const res = await service.runCrawl(
      { ...base, extra_start_urls: ['https://x.test/b'] },
      {} as never,
    );
    expect(res.success).toBe(false);
    expect(res.errorSummary).toContain('https://x.test/b');
  });

  it('skips extra sweeps when the primary sweep fails', async () => {
    const { service, calls } = build({
      'https://x.test/a': { items: [], steps: [], success: false },
    });
    const res = await service.runCrawl(
      { ...base, extra_start_urls: ['https://x.test/b'] },
      {} as never,
    );
    expect(res.success).toBe(false);
    expect(calls).toEqual(['https://x.test/a']);
  });

  it('behaves as before without extra_start_urls', async () => {
    const { service, calls } = build({ 'https://x.test/a': ok(['1']) });
    const res = await service.runCrawl(base, {} as never);
    expect(res.items).toHaveLength(1);
    expect(calls).toEqual(['https://x.test/a']);
  });
});
