import { Prisma } from 'generated/prisma';
import { DEFAULT_ESTATEWEB_CONFIG } from '../config/estateweb.config';
import {
  EstateWebIntegrationConfig,
  EstateWebSession,
  EstateWebStoredSession,
} from '../interfaces/estateweb-session.interface';

export function readEstateWebConfig(
  config: unknown,
): EstateWebIntegrationConfig {
  if (!config || typeof config !== 'object') {
    return {};
  }

  const root = config as Record<string, unknown>;
  const estateweb = root[DEFAULT_ESTATEWEB_CONFIG.configKey];

  if (!estateweb || typeof estateweb !== 'object') {
    return {};
  }

  return estateweb as EstateWebIntegrationConfig;
}

export function mergeEstateWebConfig(
  config: unknown,
  patch: EstateWebIntegrationConfig,
): Prisma.InputJsonValue {
  const root =
    config && typeof config === 'object'
      ? { ...(config as Record<string, unknown>) }
      : {};

  const existing = readEstateWebConfig(root);
  const nextEstateWebConfig = { ...existing, ...patch };

  if (patch.session === undefined && 'session' in patch) {
    delete nextEstateWebConfig.session;
  }

  return {
    ...root,
    [DEFAULT_ESTATEWEB_CONFIG.configKey]: nextEstateWebConfig,
  } as unknown as Prisma.InputJsonValue;
}

export function storedSessionToSession(
  stored: EstateWebStoredSession,
): EstateWebSession {
  return {
    baseUrl: stored.baseUrl,
    estateSession: stored.estateSession,
    token: stored.token,
    csrf: stored.csrf,
    loggedInAt: stored.loggedInAt,
    url: stored.url,
  };
}

export function sessionToStoredSession(
  session: EstateWebSession,
  ttlMs: number = DEFAULT_ESTATEWEB_CONFIG.sessionTtlMs,
): EstateWebStoredSession {
  return {
    ...session,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  };
}

export function isStoredSessionExpired(
  stored: EstateWebStoredSession,
  ttlMs: number = DEFAULT_ESTATEWEB_CONFIG.sessionTtlMs,
): boolean {
  if (stored.expiresAt) {
    return Date.parse(stored.expiresAt) <= Date.now();
  }

  const loggedInAt = Date.parse(stored.loggedInAt);
  if (Number.isNaN(loggedInAt)) {
    return true;
  }

  return loggedInAt + ttlMs <= Date.now();
}
