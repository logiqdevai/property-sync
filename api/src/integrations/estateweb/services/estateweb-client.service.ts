import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import FormData = require('form-data');
import { NotificationType } from 'generated/prisma';
import { EstateWebConfig } from '../config/estateweb.config';
import { EstateWebException } from '../exceptions/estateweb.exception';
import { EstateWebClientRequestOptions } from '../interfaces/estateweb-property.interface';
import { EstateWebSession } from '../interfaces/estateweb-session.interface';
import {
  isUnauthorizedEstateWebError,
  mapFetchError,
  mapHttpStatusToException,
} from '../utils/estateweb-error.util';
import { assertCreatePropertyResponse } from '../utils/estateweb-property-validation.util';
import { EstateWebNotificationService } from './estateweb-notification.service';
import { EstateWebSessionService } from './estateweb-session.service';

@Injectable()
export class EstateWebClientService {
  private readonly logger = new Logger(EstateWebClientService.name);

  constructor(
    private readonly estateWebConfig: EstateWebConfig,
    private readonly estateWebSessionService: EstateWebSessionService,
    private readonly estateWebNotificationService: EstateWebNotificationService,
  ) {}

  async request<T = unknown>(
    userIntegrationId: string,
    options: EstateWebClientRequestOptions,
  ): Promise<T> {
    const retryOnUnauthorized = options.retryOnUnauthorized ?? true;
    const method = options.method ?? 'GET';

    try {
      const session =
        await this.estateWebSessionService.getSession(userIntegrationId);

      this.assertSessionReady(session, options);

      try {
        return await this.executeRequest<T>(session, options);
      } catch (error) {
        if (!retryOnUnauthorized || !isUnauthorizedEstateWebError(error)) {
          throw error;
        }

        this.logger.warn(
          `EstateWeb request unauthorized for integration ${userIntegrationId}, refreshing session`,
        );
        await this.estateWebSessionService.invalidateSession(userIntegrationId);
        const refreshedSession =
          await this.estateWebSessionService.getSession(userIntegrationId);
        this.assertSessionReady(refreshedSession, options);
        return this.executeRequest<T>(refreshedSession, {
          ...options,
          retryOnUnauthorized: false,
        });
      }
    } catch (error) {
      this.estateWebNotificationService.captureError(
        this.buildErrorContext(userIntegrationId, options, method, error),
        error,
      );
      throw error;
    }
  }

  buildAuthHeaders(session: EstateWebSession): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Language': this.estateWebConfig.getAcceptLanguage(),
      Cookie: `${this.estateWebConfig.getConfig().sessionCookie}=${session.estateSession}`,
    };

    if (session.token) {
      headers.Authorization = `Bearer ${session.token}`;
    }

    return headers;
  }

  private async executeRequest<T>(
    session: EstateWebSession,
    options: EstateWebClientRequestOptions,
  ): Promise<T> {
    const baseUrl = this.estateWebConfig.normalizeBaseUrl(session.baseUrl);
    const method = options.method ?? 'GET';
    const url = this.buildUrl(baseUrl, options.path, options.query);
    const headers = this.buildAuthHeaders(session);

    let body: BodyInit | undefined;
    if (options.formData) {
      const formBuffer = options.formData.getBuffer();
      Object.assign(headers, options.formData.getHeaders());
      headers['Content-Length'] = String(formBuffer.length);
      body = new Uint8Array(formBuffer);
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
      });
    } catch (error) {
      throw mapFetchError(error, { method, path: options.path });
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw mapHttpStatusToException(
        response.status,
        method,
        options.path,
        errorBody,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      if (!text.trim()) {
        throw new EstateWebException(
          `EstateWeb ${method} ${options.path} returned an empty response`,
          NotificationType.ESTATEWEB_INVALID_RESPONSE,
          HttpStatus.BAD_GATEWAY,
          { method, path: options.path },
        );
      }
      return text as T;
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new EstateWebException(
        `EstateWeb ${method} ${options.path} returned invalid JSON`,
        NotificationType.ESTATEWEB_INVALID_JSON,
        HttpStatus.BAD_GATEWAY,
        { method, path: options.path },
      );
    }

    if (options.validateCreateResponse) {
      assertCreatePropertyResponse(parsed);
    }

    return parsed as T;
  }

  private assertSessionReady(
    session: EstateWebSession,
    options: EstateWebClientRequestOptions,
  ): void {
    if (!session.estateSession) {
      throw new EstateWebException(
        'EstateWeb session cookie is missing',
        NotificationType.ESTATEWEB_SESSION_EXPIRED,
        HttpStatus.UNAUTHORIZED,
        { operation: options.operation, path: options.path },
      );
    }

    if (!session.token) {
      throw new EstateWebException(
        'EstateWeb bearer token is missing from session',
        NotificationType.ESTATEWEB_MISSING_TOKEN,
        HttpStatus.UNAUTHORIZED,
        { operation: options.operation, path: options.path },
      );
    }
  }

  private buildErrorContext(
    userIntegrationId: string,
    options: EstateWebClientRequestOptions,
    method: string,
    error: unknown,
  ) {
    const upstreamStatus =
      error instanceof EstateWebException &&
      typeof error.details?.upstreamStatus === 'number'
        ? error.details.upstreamStatus
        : undefined;

    return {
      userIntegrationId,
      operation: options.operation ?? 'api-request',
      path: options.path,
      method,
      propertyId: options.propertyId,
      upstreamStatus,
      notificationType:
        error instanceof EstateWebException ? error.code : undefined,
    };
  }

  private buildUrl(
    baseUrl: string,
    path: string,
    query?: Record<string, string | number | undefined>,
  ): string {
    const url = new URL(path, `${baseUrl}/`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  createMultipartPayload(payload: unknown): FormData {
    const form = new FormData();
    form.append('payload', JSON.stringify(payload));
    return form;
  }

  createMultipartImageUpload(
    payload: unknown,
    image: Buffer,
    filename: string,
    mimeType: string = 'image/jpeg',
  ): FormData {
    const form = this.createMultipartPayload(payload);
    form.append('image', image, {
      filename,
      contentType: mimeType,
    });
    return form;
  }
}
