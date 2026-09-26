import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WEBSHARE_API_PATHS,
  WEBSHARE_BASE_URL,
  WEBSHARE_REQUEST_TIMEOUT_MS,
} from '../constants/webshare.constants';
import { WebshareException } from '../exceptions/webshare.exception';

@Injectable()
export class WebshareConfig {
  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return !!this.configService.get<string>('WEBSHARE_API_KEY')?.trim();
  }

  getApiKey(): string {
    const key = this.configService.get<string>('WEBSHARE_API_KEY')?.trim();
    if (!key) {
      throw new WebshareException(
        'Webshare is not configured (WEBSHARE_API_KEY missing)',
        'WEBSHARE_NOT_CONFIGURED',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return key;
  }

  /** Optional `WEBSHARE_PROXY_COUNTRY_CODES=GR,CY` restriction for crawl proxies. */
  getProxyCountryCodes(): string[] | undefined {
    const raw = this.configService.get<string>('WEBSHARE_PROXY_COUNTRY_CODES');
    const codes = (raw ?? '')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    return codes.length > 0 ? codes : undefined;
  }

  getBaseUrl(): string {
    return WEBSHARE_BASE_URL;
  }

  getTimeoutMs(): number {
    return WEBSHARE_REQUEST_TIMEOUT_MS;
  }

  getPaths() {
    return WEBSHARE_API_PATHS;
  }

  buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): string {
    const url = new URL(`${WEBSHARE_BASE_URL}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }
}
