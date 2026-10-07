import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PlatformConfigService } from '@/modules/platform-config/platform-config.service';
import {
  AZURE_TRANSLATE_CHAR_WINDOW_MS,
  AZURE_TRANSLATE_MAX_ATTEMPTS,
  AZURE_TRANSLATE_MAX_CHARS_PER_MINUTE,
  AZURE_TRANSLATE_RETRY_BASE_DELAY_MS,
  AZURE_TRANSLATE_RETRY_MAX_DELAY_MS,
} from '../constants/azure-translate.constants';
import { AzureTranslateConfig } from '../config/azure-translate.config';
import { AzureTranslateException } from '../exceptions/azure-translate.exception';
import {
  mapFetchError,
  mapHttpStatusToException,
} from '../utils/azure-translate-error.util';

export interface AzureTranslateRequestOptions {
  path: string;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  apiKey: string;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

@Injectable()
export class AzureTranslateClientService {
  private readonly logger = new Logger(AzureTranslateClientService.name);
  private nextRequestAt = 0;
  // Set when Azure answers 429: every caller in this process pauses until then, instead of each
  // one retrying on its own clock and keeping the Translator over its limit.
  private cooldownUntil = 0;
  // Characters sent in the last minute; Azure's limit is on characters, not request count.
  private sentChars: Array<{ at: number; chars: number }> = [];

  constructor(
    private readonly azureTranslateConfig: AzureTranslateConfig,
    private readonly platformConfig: PlatformConfigService,
  ) {}

  async request<T = unknown>(
    options: AzureTranslateRequestOptions,
  ): Promise<T> {
    const method = 'POST';
    const { path } = options;

    const apiKey = options.apiKey?.trim();
    if (!apiKey) {
      throw new AzureTranslateException(
        'Azure Translator API key is required',
        'AZURE_TRANSLATE_NOT_CONFIGURED',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const url = this.azureTranslateConfig.buildUrl(path, options.query);
    const region = this.azureTranslateConfig.getRegion();

    const headers: Record<string, string> = {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/json; charset=UTF-8',
    };

    if (region) {
      headers['Ocp-Apim-Subscription-Region'] = region;
    }

    const chars = this.countChars(options.body);

    for (let attempt = 1; ; attempt++) {
      await this.waitForCharBudget(chars);
      await this.waitForRequestSlot();

      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: JSON.stringify(options.body),
        });
      } catch (error) {
        throw mapFetchError(error, { method, path });
      }

      if (response.ok) {
        try {
          return (await response.json()) as T;
        } catch {
          throw new AzureTranslateException(
            `Azure Translator ${method} ${path} returned invalid JSON`,
            'AZURE_TRANSLATE_INVALID_RESPONSE',
            HttpStatus.BAD_GATEWAY,
            { method, path },
          );
        }
      }

      if (response.status === 429 && attempt < AZURE_TRANSLATE_MAX_ATTEMPTS) {
        const delayMs = this.retryDelayMs(response, attempt);
        this.logger.warn(
          `Azure Translator 429 on ${method} ${path} (attempt ${attempt}/${AZURE_TRANSLATE_MAX_ATTEMPTS}); retrying in ${delayMs}ms`,
        );
        this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + delayMs);
        continue;
      }

      const errorBody = await response.text().catch(() => '');
      throw mapHttpStatusToException(response.status, method, path, errorBody);
    }
  }

  /**
   * Reserves the next request slot synchronously, so concurrent callers in this process
   * queue up at the configured rate instead of all firing at once. The rate comes from
   * platform_config (cached there), so a change applies without a restart.
   */
  private async waitForRequestSlot(): Promise<void> {
    const maxRequestsPerSecond =
      await this.platformConfig.getAzureTranslateMaxRequestsPerSecond();
    const minRequestIntervalMs = 1000 / maxRequestsPerSecond;

    const now = Date.now();
    const slotAt = Math.max(now, this.nextRequestAt, this.cooldownUntil);
    this.nextRequestAt = slotAt + minRequestIntervalMs;

    const waitMs = slotAt - now;
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }

  private countChars(body: unknown): number {
    if (!Array.isArray(body)) return 0;
    return body.reduce(
      (sum, item) =>
        sum + (typeof item?.Text === 'string' ? item.Text.length : 0),
      0,
    );
  }

  /**
   * Holds the request until it fits in the rolling per-minute character budget. A single
   * request larger than the whole budget goes through once the window is empty.
   */
  private async waitForCharBudget(chars: number): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.sentChars = this.sentChars.filter(
        (entry) => now - entry.at < AZURE_TRANSLATE_CHAR_WINDOW_MS,
      );
      const used = this.sentChars.reduce((sum, e) => sum + e.chars, 0);
      if (
        this.sentChars.length === 0 ||
        used + chars <= AZURE_TRANSLATE_MAX_CHARS_PER_MINUTE
      ) {
        this.sentChars.push({ at: now, chars });
        return;
      }
      const waitMs =
        this.sentChars[0].at + AZURE_TRANSLATE_CHAR_WINDOW_MS - now + 50;
      await sleep(Math.max(waitMs, 50));
    }
  }

  private retryDelayMs(response: Response, attempt: number): number {
    const retryAfter = response.headers.get('Retry-After');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      const fromHeaderMs = Number.isFinite(seconds)
        ? seconds * 1000
        : Date.parse(retryAfter) - Date.now();
      if (Number.isFinite(fromHeaderMs) && fromHeaderMs >= 0) {
        return Math.min(fromHeaderMs, AZURE_TRANSLATE_RETRY_MAX_DELAY_MS);
      }
    }

    return Math.min(
      AZURE_TRANSLATE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
      AZURE_TRANSLATE_RETRY_MAX_DELAY_MS,
    );
  }
}
