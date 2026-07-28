import { HttpException, HttpStatus } from '@nestjs/common';

export type GoogleTranslateErrorCode =
  | 'GOOGLE_TRANSLATE_NOT_CONFIGURED'
  | 'GOOGLE_TRANSLATE_BAD_REQUEST'
  | 'GOOGLE_TRANSLATE_UNAUTHORIZED'
  | 'GOOGLE_TRANSLATE_FORBIDDEN'
  | 'GOOGLE_TRANSLATE_RATE_LIMITED'
  | 'GOOGLE_TRANSLATE_NOT_FOUND'
  | 'GOOGLE_TRANSLATE_SERVER_ERROR'
  | 'GOOGLE_TRANSLATE_NETWORK_ERROR'
  | 'GOOGLE_TRANSLATE_TIMEOUT'
  | 'GOOGLE_TRANSLATE_INVALID_RESPONSE'
  | 'GOOGLE_TRANSLATE_API_ERROR';

export interface GoogleTranslateExceptionBody {
  message: string;
  code: GoogleTranslateErrorCode;
  details?: Record<string, unknown>;
}

export class GoogleTranslateException extends HttpException {
  readonly code: GoogleTranslateErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: GoogleTranslateErrorCode,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, unknown>,
  ) {
    const body: GoogleTranslateExceptionBody = { message, code, details };
    super(body, status);
    this.code = code;
    this.details = details;
  }
}
