export interface EstateWebApiPaths {
  login: string;
  app: string;
  init: string;
  properties: string;
  propertyById: (propertyId: number | string) => string;
  propertyNote: (propertyId: number | string) => string;
  propertyImage: (propertyId: number | string) => string;
  imageById: (imageId: number | string) => string;
  clients: string;
  clientById: (clientId: number | string) => string;
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
