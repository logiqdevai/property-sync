import { HttpException, HttpStatus } from '@nestjs/common';
import { NotificationType } from 'generated/prisma';
import { EstateWebException } from '../exceptions/estateweb.exception';

export function formatEstateWebError(error: unknown): string {
  if (error instanceof EstateWebException) {
    const body = error.details?.body;
    if (typeof body === 'string' && body.trim().length > 0) {
      return `${error.message} | body=${body}`;
    }
    return error.message;
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

export function extractUpstreamStatus(error: unknown): number | undefined {
  if (!(error instanceof EstateWebException)) {
    return undefined;
  }
  const upstream = error.details?.upstreamStatus;
  return typeof upstream === 'number' ? upstream : undefined;
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
      { ...context },
    );
  }

  return new EstateWebException(
    `EstateWeb ${context.method} ${context.path} network error: ${message}`,
    NotificationType.ESTATEWEB_NETWORK_ERROR,
    HttpStatus.BAD_GATEWAY,
    { ...context },
  );
}

export function mapHttpStatusToException(
  status: number,
  method: string,
  path: string,
  errorBody: string,
): EstateWebException {
  const truncatedBody = truncateBody(errorBody);
  const details = buildUpstreamDetails(method, path, status, truncatedBody);
  const emptyBodySuffix = truncatedBody.trim() ? '' : ' (empty body)';

  if (status === 401 || status === 403) {
    return new EstateWebException(
      `EstateWeb auth rejected HTTP ${status} on ${method} ${path}${emptyBodySuffix}`,
      status === 401
        ? NotificationType.ESTATEWEB_SESSION_EXPIRED
        : NotificationType.ESTATEWEB_UNAUTHORIZED,
      status === 401 ? HttpStatus.UNAUTHORIZED : HttpStatus.FORBIDDEN,
      details,
    );
  }

  if (status === 404) {
    return new EstateWebException(
      `EstateWeb resource not found HTTP 404 on ${method} ${path}${emptyBodySuffix}`,
      NotificationType.ESTATEWEB_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      details,
    );
  }

  if (status === 408 || status === 504) {
    return new EstateWebException(
      `EstateWeb timed out HTTP ${status} on ${method} ${path}${emptyBodySuffix}`,
      NotificationType.ESTATEWEB_REQUEST_TIMEOUT,
      HttpStatus.REQUEST_TIMEOUT,
      details,
    );
  }

  if (status === 429) {
    return new EstateWebException(
      `EstateWeb rate limited HTTP 429 on ${method} ${path}${emptyBodySuffix}`,
      NotificationType.ESTATEWEB_RATE_LIMITED,
      HttpStatus.TOO_MANY_REQUESTS,
      details,
    );
  }

  if (status >= 500) {
    return new EstateWebException(
      `EstateWeb upstream HTTP ${status} on ${method} ${path}${emptyBodySuffix}`,
      NotificationType.ESTATEWEB_SERVER_ERROR,
      HttpStatus.BAD_GATEWAY,
      details,
    );
  }

  return new EstateWebException(
    `EstateWeb API rejected HTTP ${status} on ${method} ${path}${emptyBodySuffix}`,
    NotificationType.ESTATEWEB_API_ERROR,
    HttpStatus.BAD_REQUEST,
    details,
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

export function isNotFoundEstateWebError(error: unknown): boolean {
  return (
    error instanceof EstateWebException &&
    error.code === NotificationType.ESTATEWEB_NOT_FOUND
  );
}

function buildUpstreamDetails(
  method: string,
  path: string,
  upstreamStatus: number,
  body: string,
): Record<string, unknown> {
  const details: Record<string, unknown> = {
    method,
    path,
    upstreamStatus,
  };
  if (body.trim().length > 0) {
    details.body = body;
  }
  return details;
}

function truncateBody(body: string, maxLength = 500): string {
  if (body.length <= maxLength) {
    return body;
  }
  return `${body.slice(0, maxLength)}...`;
}
