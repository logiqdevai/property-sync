import { HttpException, HttpStatus } from '@nestjs/common';

export type CaptchaErrorCode =
  | 'CAPTCHA_NOT_CONFIGURED'
  | 'CAPTCHA_NETWORK_ERROR'
  | 'CAPTCHA_TIMEOUT'
  | 'CAPTCHA_INVALID_RESPONSE'
  | 'CAPTCHA_SOLVE_TIMEOUT'
  // Passed through from 2captcha's `errorCode` (ERROR_ZERO_BALANCE, ...).
  | `ERROR_${string}`;

export interface CaptchaExceptionBody {
  message: string;
  code: CaptchaErrorCode;
  details?: Record<string, unknown>;
}

export class CaptchaException extends HttpException {
  readonly code: CaptchaErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: CaptchaErrorCode,
    status: HttpStatus = HttpStatus.BAD_GATEWAY,
    details?: Record<string, unknown>,
  ) {
    const body: CaptchaExceptionBody = { message, code, details };
    super(body, status);
    this.code = code;
    this.details = details;
  }
}
