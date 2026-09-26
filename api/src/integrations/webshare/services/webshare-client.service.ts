import { HttpStatus, Injectable } from '@nestjs/common';
import { WebshareConfig } from '../config/webshare.config';
import { WebshareException } from '../exceptions/webshare.exception';
import { WebshareRequestOptions } from '../interfaces/webshare.interfaces';
import {
  mapFetchError,
  mapHttpStatusToException,
} from '../utils/webshare-error.util';

const THROTTLE_MAX_RETRIES = 2;
const THROTTLE_MAX_WAIT_S = 60;

@Injectable()
export class WebshareClientService {
  constructor(private readonly webshareConfig: WebshareConfig) {}

  async request<T = unknown>(options: WebshareRequestOptions): Promise<T> {
    const method = options.method ?? 'GET';
    const { path } = options;
    const url = this.webshareConfig.buildUrl(path, options.query);

    const headers: Record<string, string> = {
      Authorization: `Token ${this.webshareConfig.getApiKey()}`,
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    for (let attempt = 0; ; attempt++) {
      try {
        response = await fetch(url, {
          method,
          headers,
          body:
            options.body !== undefined
              ? JSON.stringify(options.body)
              : undefined,
          signal: AbortSignal.timeout(this.webshareConfig.getTimeoutMs()),
        });
      } catch (error) {
        throw mapFetchError(error, { method, path });
      }

      // Webshare throttles ("Expected available in N seconds"): wait it out
      // once or twice instead of failing the caller.
      if (response.status !== 429 || attempt >= THROTTLE_MAX_RETRIES) break;
      const body = await response.text().catch(() => '');
      const waitSeconds = Number(/in (\d+) second/.exec(body)?.[1] ?? 5);
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(waitSeconds + 1, THROTTLE_MAX_WAIT_S) * 1000,
        ),
      );
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw mapHttpStatusToException(response.status, method, path, errorBody);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text().catch(() => '');
    if (!text.trim()) {
      return undefined as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new WebshareException(
        `Webshare ${method} ${path} returned non-JSON response`,
        'WEBSHARE_INVALID_RESPONSE',
        HttpStatus.BAD_GATEWAY,
        { method, path, body: text.slice(0, 500) },
      );
    }
  }
}
