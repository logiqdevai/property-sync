import { HttpStatus } from '@nestjs/common';
import {
  GoogleTranslateErrorCode,
  GoogleTranslateException,
} from '../exceptions/google-translate.exception';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorCode(error: unknown): string | number | undefined {
  return (error as { code?: string | number } | null)?.code;
}

export function mapGoogleTranslateError(
  error: unknown,
  context?: Record<string, unknown>,
): GoogleTranslateException {
  if (error instanceof GoogleTranslateException) {
    return error;
  }

  const message = getErrorMessage(error);
  const code = getErrorCode(error);
  const details = { ...context, upstream_code: code };

  if (
    /timeout|deadline exceeded|ETIMEDOUT/i.test(message) ||
    code === 'ETIMEDOUT'
  ) {
    return new GoogleTranslateException(
      `Google Translate timed out: ${message}`,
      'GOOGLE_TRANSLATE_TIMEOUT',
      HttpStatus.REQUEST_TIMEOUT,
      details,
    );
  }

  if (
    /ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network|fetch failed|socket/i.test(
      message,
    ) ||
    (typeof code === 'string' &&
      ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(code))
  ) {
    return new GoogleTranslateException(
      `Google Translate network error: ${message}`,
      'GOOGLE_TRANSLATE_NETWORK_ERROR',
      HttpStatus.BAD_GATEWAY,
      details,
    );
  }

  const statusMapped = mapStatusCode(code, message, details);
  if (statusMapped) {
    return statusMapped;
  }

  return new GoogleTranslateException(
    `Google Translate API error: ${message}`,
    'GOOGLE_TRANSLATE_API_ERROR',
    HttpStatus.BAD_GATEWAY,
    details,
  );
}

function mapStatusCode(
  code: string | number | undefined,
  message: string,
  details: Record<string, unknown>,
): GoogleTranslateException | null {
  const status = typeof code === 'number' ? code : Number(code);
  if (!Number.isFinite(status)) {
    return null;
  }

  const mapping: Record<
    number,
    { errorCode: GoogleTranslateErrorCode; httpStatus: HttpStatus; label: string }
  > = {
    400: {
      errorCode: 'GOOGLE_TRANSLATE_BAD_REQUEST',
      httpStatus: HttpStatus.BAD_REQUEST,
      label: 'bad request',
    },
    401: {
      errorCode: 'GOOGLE_TRANSLATE_UNAUTHORIZED',
      httpStatus: HttpStatus.UNAUTHORIZED,
      label: 'unauthorized',
    },
    403: {
      errorCode: 'GOOGLE_TRANSLATE_FORBIDDEN',
      httpStatus: HttpStatus.FORBIDDEN,
      label: 'forbidden',
    },
    404: {
      errorCode: 'GOOGLE_TRANSLATE_NOT_FOUND',
      httpStatus: HttpStatus.NOT_FOUND,
      label: 'not found',
    },
    429: {
      errorCode: 'GOOGLE_TRANSLATE_RATE_LIMITED',
      httpStatus: HttpStatus.TOO_MANY_REQUESTS,
      label: 'rate limited',
    },
    500: {
      errorCode: 'GOOGLE_TRANSLATE_SERVER_ERROR',
      httpStatus: HttpStatus.BAD_GATEWAY,
      label: 'server error',
    },
    502: {
      errorCode: 'GOOGLE_TRANSLATE_SERVER_ERROR',
      httpStatus: HttpStatus.BAD_GATEWAY,
      label: 'server error',
    },
    503: {
      errorCode: 'GOOGLE_TRANSLATE_SERVER_ERROR',
      httpStatus: HttpStatus.BAD_GATEWAY,
      label: 'server error',
    },
    504: {
      errorCode: 'GOOGLE_TRANSLATE_TIMEOUT',
      httpStatus: HttpStatus.GATEWAY_TIMEOUT,
      label: 'gateway timeout',
    },
  };

  const mapped = mapping[status];
  if (!mapped) {
    return null;
  }

  return new GoogleTranslateException(
    `Google Translate ${mapped.label}: ${message}`,
    mapped.errorCode,
    mapped.httpStatus,
    details,
  );
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    return [items];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
