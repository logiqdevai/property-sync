import { checkListingLiveness } from './listing-url-liveness.util';

const respond = (
  status: number,
  finalUrl: string,
  body = '<title>Flat for rent</title>',
) =>
  (async () =>
    ({
      status,
      url: finalUrl,
      text: async () => body,
    }) as unknown as Response) as unknown as typeof fetch;

const URL_A = 'https://site.gr/property/123/';

describe('checkListingLiveness', () => {
  it('404 and 410 are gone', async () => {
    expect(
      await checkListingLiveness(URL_A, { fetchImpl: respond(404, URL_A) }),
    ).toBe('gone');
    expect(
      await checkListingLiveness(URL_A, { fetchImpl: respond(410, URL_A) }),
    ).toBe('gone');
  });

  it('redirect to the homepage or a /404 page is gone', async () => {
    expect(
      await checkListingLiveness(URL_A, {
        fetchImpl: respond(200, 'https://site.gr/'),
      }),
    ).toBe('gone');
    expect(
      await checkListingLiveness(URL_A, {
        fetchImpl: respond(200, 'https://site.gr/404'),
      }),
    ).toBe('gone');
    expect(
      await checkListingLiveness(URL_A, {
        fetchImpl: respond(200, 'https://site.gr/el-GR'),
      }),
    ).toBe('gone');
  });

  it('a 200 on the same URL is live', async () => {
    expect(
      await checkListingLiveness(URL_A, { fetchImpl: respond(200, URL_A) }),
    ).toBe('live');
  });

  it('a redirect to another real page (slug change) is live', async () => {
    expect(
      await checkListingLiveness(URL_A, {
        fetchImpl: respond(200, 'https://site.gr/property/123-new-slug/'),
      }),
    ).toBe('live');
  });

  it('a 200 page titled "not found" is gone', async () => {
    expect(
      await checkListingLiveness(URL_A, {
        fetchImpl: respond(200, URL_A, '<title>Page not found</title>'),
      }),
    ).toBe('gone');
  });

  it('blocked, throttled, erroring or unreachable is unknown', async () => {
    for (const status of [403, 405, 429, 500, 503]) {
      expect(
        await checkListingLiveness(URL_A, {
          fetchImpl: respond(status, URL_A),
        }),
      ).toBe('unknown');
    }
    const failing = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    expect(await checkListingLiveness(URL_A, { fetchImpl: failing })).toBe(
      'unknown',
    );
  });
});
