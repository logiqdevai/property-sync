import { HttpStatus, Injectable } from '@nestjs/common';
import { CaptchaConfig } from '../config/captcha.config';
import { CaptchaException } from '../exceptions/captcha.exception';
import { TwoCaptchaResponse } from '../interfaces/captcha.interfaces';

/** Thin JSON client for the 2captcha v2 API (https://2captcha.com/api-docs). */
@Injectable()
export class CaptchaClientService {
  constructor(private readonly config: CaptchaConfig) {}

  async call<S = Record<string, unknown>>(
    path: string,
    body: Record<string, unknown> = {},
  ): Promise<TwoCaptchaResponse<S>> {
    let response: Response;
    try {
      response = await fetch(`${this.config.getBaseUrl()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: this.config.getApiKey(), ...body }),
        signal: AbortSignal.timeout(this.config.getTimeoutMs()),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      const isTimeout = name === 'TimeoutError' || name === 'AbortError';
      throw new CaptchaException(
        `2captcha ${path} ${isTimeout ? 'timed out' : 'network error'}`,
        isTimeout ? 'CAPTCHA_TIMEOUT' : 'CAPTCHA_NETWORK_ERROR',
        isTimeout ? HttpStatus.GATEWAY_TIMEOUT : HttpStatus.BAD_GATEWAY,
        { path, cause: error instanceof Error ? error.message : String(error) },
      );
    }

    const text = await response.text().catch(() => '');
    let json: TwoCaptchaResponse<S>;
    try {
      json = JSON.parse(text) as TwoCaptchaResponse<S>;
    } catch {
      throw new CaptchaException(
        `2captcha ${path} returned non-JSON response (HTTP ${response.status})`,
        'CAPTCHA_INVALID_RESPONSE',
        HttpStatus.BAD_GATEWAY,
        { path, status: response.status, body: text.slice(0, 500) },
      );
    }

    // API errors come in the body (errorId != 0), usually with HTTP 200.
    if (json.errorId) {
      throw new CaptchaException(
        `2captcha ${path} failed: ${json.errorCode ?? json.errorId} ${json.errorDescription ?? ''}`.trim(),
        (json.errorCode as `ERROR_${string}`) ?? 'CAPTCHA_INVALID_RESPONSE',
        HttpStatus.BAD_GATEWAY,
        { path, errorId: json.errorId, description: json.errorDescription },
      );
    }
    return json;
  }
}
