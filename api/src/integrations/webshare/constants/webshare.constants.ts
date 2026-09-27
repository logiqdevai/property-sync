export const WEBSHARE_BASE_URL = 'https://proxy.webshare.io/api/v2';
export const WEBSHARE_REQUEST_TIMEOUT_MS = 30_000;
export const WEBSHARE_DEFAULT_PAGE_SIZE = 100;
/** Residential plans list proxies with mode=backbone (mode=direct returns 400). */
export const WEBSHARE_DEFAULT_PROXY_MODE = 'backbone' as const;
/** Host used by backbone (residential) proxies, whose list entries have no proxy_address. */
export const WEBSHARE_BACKBONE_HOST = 'p.webshare.io';

/**
 * Gateway ports for backbone (residential) proxies. The per-entry `port` from
 * /proxy/list/ (10000 + the entry's index) is NOT a port the gateway listens
 * on -- the entry's *username* (`<user>-<COUNTRY>-<index>`) is what selects the
 * exit node, and every entry is reached through these two shared ports.
 *
 * Verified live 2026-09-27: the same username returns the same exit IP on 80,
 * 10000 and 10001 alike (the port is ignored), while connecting to an entry's
 * own listed port fails outright above ~28000 -- which is most of a 200k-entry
 * pool, and was why proxy crawls died with ERR_PROXY_CONNECTION_FAILED.
 */
export const WEBSHARE_BACKBONE_PORTS = {
  http: 80,
  socks5: 1080,
} as const;

/** Webshare reports plan `bandwidth_limit` in GB and usage in bytes. */
export const WEBSHARE_BYTES_PER_GB = 1024 ** 3;

export const WEBSHARE_API_PATHS = {
  profile: '/profile/',
  subscription: '/subscription/',
  subscriptionPlan: '/subscription/plan/',
  proxyConfig: '/proxy/config/',
  proxyList: '/proxy/list/',
  proxyListRefresh: '/proxy/list/refresh/',
  stats: '/stats/',
  statsAggregate: '/stats/aggregate/',
  ipAuthorization: '/proxy/ipauthorization/',
  whatsMyIp: '/proxy/ipauthorization/whatsmyip/',
} as const;
