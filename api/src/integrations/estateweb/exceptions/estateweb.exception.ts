import { HttpException, HttpStatus } from '@nestjs/common';
import { EstateWebErrorCode } from '../constants/estateweb-error-codes';

export interface EstateWebExceptionBody {
  message: string;
  code: EstateWebErrorCode;
  details?: Record<string, unknown>;
}

export class EstateWebException extends HttpException {
  readonly code: EstateWebErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: EstateWebErrorCode,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, unknown>,
  ) {
    const body: EstateWebExceptionBody = { message, code, details };
    super(body, status);
    this.code = code;
    this.details = details;
  }
}
