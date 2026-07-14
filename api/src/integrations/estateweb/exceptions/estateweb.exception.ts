import { HttpException, HttpStatus } from '@nestjs/common';
import { NotificationType } from 'generated/prisma';

export interface EstateWebExceptionBody {
  message: string;
  code: NotificationType;
  details?: Record<string, unknown>;
}

export class EstateWebException extends HttpException {
  readonly code: NotificationType;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: NotificationType,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, unknown>,
  ) {
    const body: EstateWebExceptionBody = { message, code, details };
    super(body, status);
    this.code = code;
    this.details = details;
  }
}
