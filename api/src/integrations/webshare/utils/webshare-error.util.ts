import { HttpStatus } from '@nestjs/common';
import {
  WebshareErrorCode,
  WebshareException,
} from '../exceptions/webshare.exception';

const STATUS_MAP: Record<number, [WebshareErrorCode, HttpStatus]> = {
  400: ['WEBSHARE_BAD_REQUEST', HttpStatus.BAD_REQUEST],
  401: ['WEBSHARE_UNAUTHORIZED', HttpStatus.UNAUTHORIZED],
  403: ['WEBSHARE_FORBIDDEN', HttpStatus.FORBIDDEN],
  404: ['WEBSHARE_NOT_FOUND', HttpStatus.NOT_FOUND],
  429: ['WEBSHARE_RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS],
};

export function mapHttpStatusToException(
  status: number,
  method: string,
  path: string,
  body: string,
): WebshareException {
  const details = { method, path, status, body: body.slice(0, 500) };
  const message = `Webshare ${method} ${path} failed with ${status}`;

  const mapped = STATUS_MAP[status];
  if (mapped) {
    return new WebshareException(message, mapped[0], mapped[1], details);
  }
  if (status >= 500) {
    return new WebshareException(
      message,
      'WEBSHARE_SERVER_ERROR',
      HttpStatus.BAD_GATEWAY,
      details,
    );
  }
  return new WebshareException(
    message,
    'WEBSHARE_API_ERROR',
    HttpStatus.BAD_REQUEST,
    details,
  );
}

export function mapFetchError(
  error: unknown,
  ctx: { method: string; path: string },
): WebshareException {
  const name = error instanceof Error ? error.name : '';
  const isTimeout = name === 'TimeoutError' || name === 'AbortError';
  return new WebshareException(
    `Webshare ${ctx.method} ${ctx.path} ${isTimeout ? 'timed out' : 'network error'}`,
    isTimeout ? 'WEBSHARE_TIMEOUT' : 'WEBSHARE_NETWORK_ERROR',
    isTimeout ? HttpStatus.GATEWAY_TIMEOUT : HttpStatus.BAD_GATEWAY,
    {
      ...ctx,
      cause: error instanceof Error ? error.message : String(error),
    },
  );
}
