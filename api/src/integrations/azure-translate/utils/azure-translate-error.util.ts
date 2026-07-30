import { HttpStatus } from '@nestjs/common';
import { AzureTranslateException } from '../exceptions/azure-translate.exception';

export function mapFetchError(
  error: unknown,
  context: { method: string; path: string },
): AzureTranslateException {
  if (error instanceof AzureTranslateException) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes('timeout') ||
    message.includes('Timeout') ||
    message.includes('aborted')
  ) {
    return new AzureTranslateException(
      `Azure Translator ${context.method} ${context.path} timed out`,
      'AZURE_TRANSLATE_TIMEOUT',
      HttpStatus.REQUEST_TIMEOUT,
      context,
    );
  }

  return new AzureTranslateException(
    `Azure Translator ${context.method} ${context.path} network error: ${message}`,
    'AZURE_TRANSLATE_NETWORK_ERROR',
    HttpStatus.BAD_GATEWAY,
    context,
  );
}

export function mapHttpStatusToException(
  status: number,
  method: string,
  path: string,
  errorBody: string,
): AzureTranslateException {
  const context = { method, path, status, body: truncateBody(errorBody) };

  if (status === 400) {
    return new AzureTranslateException(
      `Azure Translator bad request: ${method} ${path}`,
      'AZURE_TRANSLATE_BAD_REQUEST',
      HttpStatus.BAD_REQUEST,
      context,
    );
  }

  if (status === 401) {
    return new AzureTranslateException(
      'Azure Translator credentials are invalid',
      'AZURE_TRANSLATE_UNAUTHORIZED',
      HttpStatus.UNAUTHORIZED,
      context,
    );
  }

  if (status === 403) {
    return new AzureTranslateException(
      'Azure Translator request is forbidden',
      'AZURE_TRANSLATE_FORBIDDEN',
      HttpStatus.FORBIDDEN,
      context,
    );
  }

  if (status === 408) {
    return new AzureTranslateException(
      `Azure Translator resource not available yet: ${method} ${path}`,
      'AZURE_TRANSLATE_NOT_FOUND',
      HttpStatus.NOT_FOUND,
      context,
    );
  }

  if (status === 429) {
    return new AzureTranslateException(
      'Azure Translator rate limit exceeded',
      'AZURE_TRANSLATE_RATE_LIMITED',
      HttpStatus.TOO_MANY_REQUESTS,
      context,
    );
  }

  if (status >= 500) {
    return new AzureTranslateException(
      `Azure Translator server error (${status})`,
      'AZURE_TRANSLATE_SERVER_ERROR',
      HttpStatus.BAD_GATEWAY,
      context,
    );
  }

  return new AzureTranslateException(
    `Azure Translator API ${method} ${path} failed with ${status}: ${truncateBody(errorBody)}`,
    'AZURE_TRANSLATE_API_ERROR',
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
