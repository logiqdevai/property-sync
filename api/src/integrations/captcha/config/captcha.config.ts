import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CAPTCHA_BASE_URL,
  CAPTCHA_POLL_INTERVAL_MS,
  CAPTCHA_REQUEST_TIMEOUT_MS,
  CAPTCHA_SOLVE_TIMEOUT_MS,
} from '../constants/captcha.constants';
import { CaptchaException } from '../exceptions/captcha.exception';

@Injectable()
export class CaptchaConfig {
  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return !!this.configService.get<string>('CAPTCHA_API_KEY')?.trim();
  }

  getApiKey(): string {
    const key = this.configService.get<string>('CAPTCHA_API_KEY')?.trim();
    if (!key) {
      throw new CaptchaException(
        'Captcha solver is not configured (CAPTCHA_API_KEY missing)',
        'CAPTCHA_NOT_CONFIGURED',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return key;
  }

  getBaseUrl(): string {
    return CAPTCHA_BASE_URL;
  }

  getTimeoutMs(): number {
    return CAPTCHA_REQUEST_TIMEOUT_MS;
  }

  getPollIntervalMs(): number {
    return CAPTCHA_POLL_INTERVAL_MS;
  }

  getSolveTimeoutMs(): number {
    return CAPTCHA_SOLVE_TIMEOUT_MS;
  }
}
