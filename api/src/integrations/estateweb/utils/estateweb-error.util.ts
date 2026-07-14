import { HttpException, HttpStatus } from '@nestjs/common';
import { NotificationType } from 'generated/prisma';
import { EstateWebException } from '../exceptions/estateweb.exception';

export function formatEstateWebError(error: unknown): string {
  if (error instanceof EstateWebException) {
    const parts = [error.message, `type=${error.code}`];
    if (error.details && Object.keys(error.details).length > 0) {
      parts.push(`details=${JSON.stringify(error.details)}`);
    }
    return parts.join(' | ');
  }

  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string') {
      return response;
    }
    if (response && typeof response === 'object' && 'message' in response) {
      const message = (response as { message?: string | string[] }).message;
      if (Array.isArray(message)) {
        return message.join(', ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function extractEstateWebNotificationType(
  error: unknown,
): NotificationType | undefined {
  if (error instanceof EstateWebException) {
    return error.code;
  }
  return undefined;
}

export function mapFetchError(
  error: unknown,
  context: { method: string; path: string },
): EstateWebException {
  if (error instanceof EstateWebException) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('timeout') || message.includes('Timeout')) {
    return new EstateWebException(
      `EstateWeb ${context.method} ${context.path} timed out`,
      NotificationType.ESTATEWEB_REQUEST_TIMEOUT,
      HttpStatus.REQUEST_TIMEOUT,
      context,
    );
  }

  return new EstateWebException(
    `EstateWeb ${context.method} ${context.path} network error: ${message}`,
    NotificationType.ESTATEWEB_NETWORK_ERROR,
    HttpStatus.BAD_GATEWAY,
    context,
  );
}

export function mapHttpStatusToException(
  status: number,
  method: string,
  path: string,
  errorBody: string,
): EstateWebException {
  const context = { method, path, status };

  if (status === 401 || status === 403) {
    return new EstateWebException(
      `EstateWeb session is not authorized (${status})`,
      status === 401
        ? NotificationType.ESTATEWEB_SESSION_EXPIRED
        : NotificationType.ESTATEWEB_UNAUTHORIZED,
      status === 401 ? HttpStatus.UNAUTHORIZED : HttpStatus.FORBIDDEN,
      { ...context, body: truncateBody(errorBody) },
    );
  }

  if (status === 404) {
    return new EstateWebException(
      `EstateWeb resource not found: ${method} ${path}`,
      NotificationType.ESTATEWEB_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      { ...context, body: truncateBody(errorBody) },
    );
  }

  if (status === 408 || status === 504) {
    return new EstateWebException(
      `EstateWeb request timed out (${status})`,
      NotificationType.ESTATEWEB_REQUEST_TIMEOUT,
      HttpStatus.REQUEST_TIMEOUT,
      { ...context, body: truncateBody(errorBody) },
    );
  }

  if (status === 429) {
    return new EstateWebException(
      'EstateWeb rate limit exceeded',
      NotificationType.ESTATEWEB_RATE_LIMITED,
      HttpStatus.TOO_MANY_REQUESTS,
      { ...context, body: truncateBody(errorBody) },
    );
  }

  if (status >= 500) {
    return new EstateWebException(
      `EstateWeb server error (${status})`,
      NotificationType.ESTATEWEB_SERVER_ERROR,
      HttpStatus.BAD_GATEWAY,
      { ...context, body: truncateBody(errorBody) },
    );
  }

  return new EstateWebException(
    `EstateWeb API ${method} ${path} failed with ${status}: ${truncateBody(errorBody)}`,
    NotificationType.ESTATEWEB_API_ERROR,
    HttpStatus.BAD_REQUEST,
    { ...context, body: truncateBody(errorBody) },
  );
}

export function isUnauthorizedEstateWebError(error: unknown): boolean {
  if (error instanceof EstateWebException) {
    return (
      error.code === NotificationType.ESTATEWEB_UNAUTHORIZED ||
      error.code === NotificationType.ESTATEWEB_SESSION_EXPIRED
    );
  }

  return false;
}

function truncateBody(body: string, maxLength = 500): string {
  if (body.length <= maxLength) {
    return body;
  }
  return `${body.slice(0, maxLength)}...`;
}
