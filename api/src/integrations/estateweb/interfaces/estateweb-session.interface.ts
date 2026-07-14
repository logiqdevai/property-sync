export interface EstateWebSession {
  baseUrl: string;
  estateSession: string;
  token: string | null;
  csrf: string | null;
  loggedInAt: string;
  url?: string;
}

export interface EstateWebStoredSession extends EstateWebSession {
  expiresAt?: string;
}

export interface EstateWebIntegrationConfig {
  session?: EstateWebStoredSession;
}

export interface CachedEstateWebSession {
  session: EstateWebSession;
  expiresAt: number;
}
