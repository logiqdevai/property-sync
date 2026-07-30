import { HttpException, HttpStatus } from '@nestjs/common';

export type AzureTranslateErrorCode =
  | 'AZURE_TRANSLATE_NOT_CONFIGURED'
  | 'AZURE_TRANSLATE_BAD_REQUEST'
  | 'AZURE_TRANSLATE_UNAUTHORIZED'
  | 'AZURE_TRANSLATE_FORBIDDEN'
  | 'AZURE_TRANSLATE_NOT_FOUND'
  | 'AZURE_TRANSLATE_RATE_LIMITED'
  | 'AZURE_TRANSLATE_SERVER_ERROR'
  | 'AZURE_TRANSLATE_NETWORK_ERROR'
  | 'AZURE_TRANSLATE_TIMEOUT'
  | 'AZURE_TRANSLATE_INVALID_RESPONSE'
  | 'AZURE_TRANSLATE_API_ERROR';

export interface AzureTranslateExceptionBody {
  message: string;
  code: AzureTranslateErrorCode;
  details?: Record<string, unknown>;
}

export class AzureTranslateException extends HttpException {
  readonly code: AzureTranslateErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: AzureTranslateErrorCode,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, unknown>,
  ) {
    const body: AzureTranslateExceptionBody = { message, code, details };
    super(body, status);
    this.code = code;
    this.details = details;
  }
}
