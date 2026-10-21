import { ConfigService } from '@nestjs/config';
import { CaptchaConfig } from '../config/captcha.config';
import { CaptchaException } from '../exceptions/captcha.exception';
import { CaptchaClientService } from './captcha-client.service';
import { CaptchaSolverService } from './captcha-solver.service';

function build() {
  const config = new CaptchaConfig(
    new ConfigService({ CAPTCHA_API_KEY: 'test-key' }),
  );
  jest.spyOn(config, 'getPollIntervalMs').mockReturnValue(1);
  return new CaptchaSolverService(new CaptchaClientService(config), config);
}

function mockFetch(...bodies: object[]) {
  const fn = jest.fn();
  for (const b of bodies) {
    fn.mockResolvedValueOnce({
      status: 200,
      text: async () => JSON.stringify(b),
    });
  }
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const sent = (fn: jest.Mock, i: number) => JSON.parse(fn.mock.calls[i][1].body);

describe('CaptchaSolverService', () => {
  it('submits a proxyless Turnstile task and returns token + userAgent', async () => {
    const fetchMock = mockFetch(
      { errorId: 0, taskId: 7 },
      { errorId: 0, status: 'processing' },
      {
        errorId: 0,
        status: 'ready',
        cost: '0.003',
        solution: { token: 'tok', userAgent: 'UA' },
      },
    );

    const res = await build().solveTurnstile({
      websiteURL: 'https://x.test',
      websiteKey: 'k',
    });

    expect(res).toEqual({ taskId: 7, token: 'tok', userAgent: 'UA', cost: '0.003' });
    const create = sent(fetchMock, 0);
    expect(create.clientKey).toBe('test-key');
    expect(create.task).toEqual({
      type: 'TurnstileTaskProxyless',
      websiteURL: 'https://x.test',
      websiteKey: 'k',
    });
    expect(sent(fetchMock, 2)).toEqual({ clientKey: 'test-key', taskId: 7 });
  });

  it('reads gRecaptchaResponse for reCAPTCHA v2', async () => {
    mockFetch(
      { errorId: 0, taskId: 1 },
      { errorId: 0, status: 'ready', solution: { gRecaptchaResponse: 'g' } },
    );
    const res = await build().solveRecaptchaV2({
      websiteURL: 'https://x.test',
      websiteKey: 'k',
    });
    expect(res.token).toBe('g');
  });

  it('resubmits once on ERROR_CAPTCHA_UNSOLVABLE', async () => {
    const fetchMock = mockFetch(
      { errorId: 0, taskId: 1 },
      { errorId: 12, errorCode: 'ERROR_CAPTCHA_UNSOLVABLE' },
      { errorId: 0, taskId: 2 },
      { errorId: 0, status: 'ready', solution: { token: 'ok' } },
    );
    const res = await build().solveTurnstile({
      websiteURL: 'https://x.test',
      websiteKey: 'k',
    });
    expect(res.taskId).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not retry fatal errors like ERROR_ZERO_BALANCE', async () => {
    const fetchMock = mockFetch({
      errorId: 10,
      errorCode: 'ERROR_ZERO_BALANCE',
      errorDescription: 'no funds',
    });
    await expect(
      build().solveTurnstile({ websiteURL: 'https://x.test', websiteKey: 'k' }),
    ).rejects.toMatchObject({ code: 'ERROR_ZERO_BALANCE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws CAPTCHA_NOT_CONFIGURED without an api key', async () => {
    const config = new CaptchaConfig(new ConfigService({}));
    const solver = new CaptchaSolverService(
      new CaptchaClientService(config),
      config,
    );
    await expect(solver.getBalance()).rejects.toBeInstanceOf(CaptchaException);
  });
});
