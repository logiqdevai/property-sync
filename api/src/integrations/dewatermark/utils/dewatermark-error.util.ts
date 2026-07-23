import { HttpStatus } from '@nestjs/common';
import {
  DewatermarkException,
} from '../exceptions/dewatermark.exception';

export function mapFetchError(
  error: unknown,
  context: { method: string; path: string },
): DewatermarkException {
  if (error instanceof DewatermarkException) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes('timeout') ||
    message.includes('Timeout') ||
    message.includes('aborted')
  ) {
    return new DewatermarkException(
      `Dewatermark ${context.method} ${context.path} timed out`,
      'DEWATERMARK_TIMEOUT',
      HttpStatus.REQUEST_TIMEOUT,
      context,
    );
  }

  return new DewatermarkException(
    `Dewatermark ${context.method} ${context.path} network error: ${message}`,
    'DEWATERMARK_NETWORK_ERROR',
    HttpStatus.BAD_GATEWAY,
    context,
  );
}

export function mapHttpStatusToException(
  status: number,
  method: string,
  path: string,
  errorBody: string,
): DewatermarkException {
  const context = { method, path, status, body: truncateBody(errorBody) };

  if (status === 400) {
    return new DewatermarkException(
      `Dewatermark bad request: ${method} ${path}`,
      'DEWATERMARK_BAD_REQUEST',
      HttpStatus.BAD_REQUEST,
      context,
    );
  }

  if (status === 401) {
    return new DewatermarkException(
      'Dewatermark API key is invalid',
      'DEWATERMARK_UNAUTHORIZED',
      HttpStatus.UNAUTHORIZED,
      context,
    );
  }

  if (status === 403) {
    return new DewatermarkException(
      'Dewatermark access forbidden or no credit available',
      'DEWATERMARK_FORBIDDEN',
      HttpStatus.FORBIDDEN,
      context,
    );
  }

  if (status === 404) {
    return new DewatermarkException(
      `Dewatermark resource not found: ${method} ${path}`,
      'DEWATERMARK_NOT_FOUND',
      HttpStatus.NOT_FOUND,
      context,
    );
  }

  if (status === 408 || status === 504) {
    return new DewatermarkException(
      `Dewatermark request timed out (${status})`,
      'DEWATERMARK_TIMEOUT',
      HttpStatus.REQUEST_TIMEOUT,
      context,
    );
  }

  if (status === 429) {
    return new DewatermarkException(
      'Dewatermark insufficient credit balance or rate limited',
      'DEWATERMARK_INSUFFICIENT_CREDITS',
      HttpStatus.TOO_MANY_REQUESTS,
      context,
    );
  }

  if (status >= 500) {
    return new DewatermarkException(
      `Dewatermark server error (${status})`,
      'DEWATERMARK_SERVER_ERROR',
      HttpStatus.BAD_GATEWAY,
      context,
    );
  }

  return new DewatermarkException(
    `Dewatermark API ${method} ${path} failed with ${status}: ${truncateBody(errorBody)}`,
    'DEWATERMARK_API_ERROR',
    HttpStatus.BAD_GATEWAY,
    context,
  );
}

export function truncateBody(body: string, maxLength = 500): string {
  if (body.length <= maxLength) {
    return body;
  }
  return `${body.slice(0, maxLength)}...`;
}
