import { BadRequestException } from '@nestjs/common';
import { CrawlRunsService } from './crawl-runs.service';

const buildService = (config: Record<string, unknown> | null) => {
  const create = jest.fn().mockImplementation(({ data }) => ({
    id: 'run-1',
    ...data,
  }));
  const prisma = {
    crawlRun: {
      findFirst: jest.fn().mockResolvedValue(null),
      create,
    },
    scraper: {
      findUnique: jest.fn().mockResolvedValue({
        active_version: config ? { config } : null,
      }),
    },
  };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const service = new CrawlRunsService(prisma as never, queue as never);
  return { service, create, queue };
};

const urlParamConfig = {
  start_url: 'https://www.example.gr/el/search',
  listing_selector: '.item',
  pagination: { type: 'url_param', url_param: 'page' },
};

describe('CrawlRunsService.enqueue resume options', () => {
  it('stores nothing extra when no resume options are given', async () => {
    const { service, create } = buildService(urlParamConfig);
    await service.enqueue('agency', 'scraper');
    expect(create.mock.calls[0][0].data.metadata).toBeUndefined();
  });

  it('resolves start_page into a start_url and flags the run partial', async () => {
    const { service, create } = buildService(urlParamConfig);
    await service.enqueue('agency', 'scraper', undefined, undefined, {
      startPage: 27,
    });
    expect(create.mock.calls[0][0].data.metadata).toEqual({
      start_url: 'https://www.example.gr/el/search?page=27',
      partial_crawl: true,
    });
  });

  it('accepts a start_url on the same site (www-insensitive)', async () => {
    const { service, create } = buildService(urlParamConfig);
    await service.enqueue('agency', 'scraper', undefined, undefined, {
      startUrl: 'https://example.gr/el/search?page=9&type=sale',
    });
    expect(create.mock.calls[0][0].data.metadata).toMatchObject({
      start_url: 'https://example.gr/el/search?page=9&type=sale',
      partial_crawl: true,
    });
  });

  it('rejects a start_url on another site', async () => {
    const { service } = buildService(urlParamConfig);
    await expect(
      service.enqueue('agency', 'scraper', undefined, undefined, {
        startUrl: 'https://evil.example.com/el/search?page=9',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects start_page for non url_param pagination', async () => {
    const { service } = buildService({
      ...urlParamConfig,
      pagination: { type: 'next_button', selector: '.next' },
    });
    await expect(
      service.enqueue('agency', 'scraper', undefined, undefined, {
        startPage: 3,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects start_url together with start_page', async () => {
    const { service } = buildService(urlParamConfig);
    await expect(
      service.enqueue('agency', 'scraper', undefined, undefined, {
        startUrl: 'https://example.gr/el/search?page=2',
        startPage: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reuse_detail_hours alone does not make the run partial', async () => {
    const { service, create } = buildService(urlParamConfig);
    await service.enqueue('agency', 'scraper', undefined, undefined, {
      reuseDetailHours: 24,
    });
    expect(create.mock.calls[0][0].data.metadata).toEqual({
      reuse_detail_hours: 24,
    });
  });

  it('keeps skip_spike_check alongside resume metadata', async () => {
    const { service, create } = buildService(urlParamConfig);
    await service.enqueue('agency', 'scraper', undefined, true, {
      reuseDetailHours: 12,
    });
    expect(create.mock.calls[0][0].data.metadata).toEqual({
      skip_spike_check: true,
      reuse_detail_hours: 12,
    });
  });
});
