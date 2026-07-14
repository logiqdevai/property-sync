export interface EstateWebApiPaths {
  login: string;
  app: string;
  properties: string;
  propertyById: (propertyId: number | string) => string;
  propertyImage: (propertyId: number | string) => string;
}

export interface EstateWebConfigOptions {
  baseUrl: string;
  acceptLanguage: string;
  loginTimeoutMs: number;
  sessionTtlMs: number;
  headless: boolean;
  sessionCookie: string;
  configKey: string;
  apiPaths: EstateWebApiPaths;
}
