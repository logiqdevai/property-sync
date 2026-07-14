export interface EstateWebCredentials {
  email: string;
  password: string;
  baseUrl: string;
}

export interface EstateWebLoginOptions {
  headless?: boolean;
  timeoutMs?: number;
  userIntegrationId?: string;
  notifyOnFailure?: boolean;
}

export interface EstateWebLoginResult extends EstateWebCredentials {
  url: string;
  csrf: string | null;
  token: string | null;
  estateSession: string;
}
