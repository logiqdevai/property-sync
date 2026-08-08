import { Injectable } from '@nestjs/common';
import { EstateWebConfigOptions } from '../interfaces/estateweb-config.interface';

export const DEFAULT_ESTATEWEB_CONFIG: EstateWebConfigOptions = {
  baseUrl: 'https://app.estateweb.gr',
  acceptLanguage: 'en-US,en;q=0.9,el;q=0.8',
  loginTimeoutMs: 45_000,
  sessionTtlMs: 6 * 60 * 60 * 1000,
  headless: true,
  sessionCookie: 'estate_session',
  configKey: 'estateweb',
  apiPaths: {
    login: '/login',
    app: '/app',
    init: '/api/init',
    properties: '/api/property',
    propertyById: (propertyId: number | string) =>
      `/api/property/${propertyId}`,
    propertyNote: (propertyId: number | string) =>
      `/api/property/${propertyId}/propertynote`,
    propertyNoteById: (noteId: number | string) =>
      `/api/propertynote/${noteId}`,
    propertyImage: (propertyId: number | string) =>
      `/api/property/${propertyId}/img`,
    imageById: (imageId: number | string) => `/api/img/${imageId}`,
    clients: '/api/client',
    clientById: (clientId: number | string) => `/api/client/${clientId}`,
  },
};

@Injectable()
export class EstateWebConfig {
  private readonly config: EstateWebConfigOptions = DEFAULT_ESTATEWEB_CONFIG;

  getConfig(): EstateWebConfigOptions {
    return this.config;
  }

  getDefaultBaseUrl(): string {
    return this.config.baseUrl;
  }

  getAcceptLanguage(): string {
    return this.config.acceptLanguage;
  }

  getLoginTimeoutMs(): number {
    return this.config.loginTimeoutMs;
  }

  getSessionTtlMs(): number {
    return this.config.sessionTtlMs;
  }

  isHeadless(): boolean {
    return this.config.headless;
  }

  normalizeBaseUrl(baseUrl?: string | null): string {
    const resolved = (baseUrl ?? this.config.baseUrl).replace(/\/+$/, '');
    return resolved || this.config.baseUrl;
  }
}
