import { HttpException, HttpStatus } from '@nestjs/common';

export type WebshareErrorCode =
  | 'WEBSHARE_NOT_CONFIGURED'
  | 'WEBSHARE_BAD_REQUEST'
  | 'WEBSHARE_UNAUTHORIZED'
  | 'WEBSHARE_FORBIDDEN'
  | 'WEBSHARE_NOT_FOUND'
  | 'WEBSHARE_RATE_LIMITED'
  | 'WEBSHARE_SERVER_ERROR'
  | 'WEBSHARE_NETWORK_ERROR'
  | 'WEBSHARE_TIMEOUT'
  | 'WEBSHARE_INVALID_RESPONSE'
  | 'WEBSHARE_NO_PROXIES'
  | 'WEBSHARE_API_ERROR';

export interface WebshareExceptionBody {
  message: string;
  code: WebshareErrorCode;
  details?: Record<string, unknown>;
}

export class WebshareException extends HttpException {
  readonly code: WebshareErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: WebshareErrorCode,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, unknown>,
  ) {
    const body: WebshareExceptionBody = { message, code, details };
    super(body, status);
    this.code = code;
    this.details = details;
  }
}
