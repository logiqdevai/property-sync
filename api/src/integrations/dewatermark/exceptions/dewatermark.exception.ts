import { HttpException, HttpStatus } from '@nestjs/common';

export type DewatermarkErrorCode =
  | 'DEWATERMARK_NOT_CONFIGURED'
  | 'DEWATERMARK_BAD_REQUEST'
  | 'DEWATERMARK_UNAUTHORIZED'
  | 'DEWATERMARK_FORBIDDEN'
  | 'DEWATERMARK_INSUFFICIENT_CREDITS'
  | 'DEWATERMARK_RATE_LIMITED'
  | 'DEWATERMARK_NOT_FOUND'
  | 'DEWATERMARK_SERVER_ERROR'
  | 'DEWATERMARK_NETWORK_ERROR'
  | 'DEWATERMARK_TIMEOUT'
  | 'DEWATERMARK_INVALID_RESPONSE'
  | 'DEWATERMARK_API_ERROR';

export interface DewatermarkExceptionBody {
  message: string;
  code: DewatermarkErrorCode;
  details?: Record<string, unknown>;
}

export class DewatermarkException extends HttpException {
  readonly code: DewatermarkErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: DewatermarkErrorCode,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, unknown>,
  ) {
    const body: DewatermarkExceptionBody = { message, code, details };
    super(body, status);
    this.code = code;
    this.details = details;
  }
}
