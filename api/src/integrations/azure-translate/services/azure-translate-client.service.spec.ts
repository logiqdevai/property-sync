import { PlatformConfigService } from '@/modules/platform-config/platform-config.service';
import { AzureTranslateConfig } from '../config/azure-translate.config';
import { AZURE_TRANSLATE_MAX_ATTEMPTS } from '../constants/azure-translate.constants';
import { AzureTranslateClientService } from './azure-translate-client.service';

const translatedBody = [{ translations: [{ text: 'hallo', to: 'de' }] }];

const platformConfigWith = (maxRequestsPerSecond: number) =>
  ({
    getAzureTranslateMaxRequestsPerSecond: jest
      .fn()
      .mockResolvedValue(maxRequestsPerSecond),
  }) as unknown as PlatformConfigService;

const rateLimited = (retryAfter = '0') =>
  new Response('{}', {
    status: 429,
    headers: { 'Retry-After': retryAfter },
  });

const ok = () =>
  new Response(JSON.stringify(translatedBody), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('AzureTranslateClientService', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let client: AzureTranslateClientService;

  const send = () =>
    client.request({
      path: '/translate',
      query: { to: 'de' },
      body: [{ Text: 'hello' }],
      apiKey: 'test-key',
    });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new AzureTranslateClientService(
      new AzureTranslateConfig(),
      platformConfigWith(5),
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('retries a 429 and returns the translation once Azure accepts the request', async () => {
    fetchMock.mockResolvedValueOnce(rateLimited()).mockResolvedValueOnce(ok());

    await expect(send()).resolves.toEqual(translatedBody);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up with AZURE_TRANSLATE_RATE_LIMITED after the last attempt', async () => {
    fetchMock.mockImplementation(async () => rateLimited());

    await expect(send()).rejects.toMatchObject({
      code: 'AZURE_TRANSLATE_RATE_LIMITED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(AZURE_TRANSLATE_MAX_ATTEMPTS);
  });

  it('spaces concurrent requests so they do not all hit Azure at once', async () => {
    const startedAt: number[] = [];
    fetchMock.mockImplementation(async () => {
      startedAt.push(Date.now());
      return ok();
    });

    await Promise.all([send(), send(), send()]);

    expect(startedAt).toHaveLength(3);
    // 5 requests/second means at least ~200ms between consecutive requests.
    for (let i = 1; i < startedAt.length; i++) {
      expect(startedAt[i] - startedAt[i - 1]).toBeGreaterThanOrEqual(180);
    }
  });

  it('uses the rate stored in platform_config', async () => {
    client = new AzureTranslateClientService(
      new AzureTranslateConfig(),
      platformConfigWith(2),
    );
    const startedAt: number[] = [];
    fetchMock.mockImplementation(async () => {
      startedAt.push(Date.now());
      return ok();
    });

    await Promise.all([send(), send()]);

    // 2 requests/second means at least ~500ms between the two requests.
    expect(startedAt[1] - startedAt[0]).toBeGreaterThanOrEqual(480);
  });
});
