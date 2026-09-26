export const WEBSHARE_BASE_URL = 'https://proxy.webshare.io/api/v2';
export const WEBSHARE_REQUEST_TIMEOUT_MS = 30_000;
export const WEBSHARE_DEFAULT_PAGE_SIZE = 100;
/** Residential plans list proxies with mode=backbone (mode=direct returns 400). */
export const WEBSHARE_DEFAULT_PROXY_MODE = 'backbone' as const;
/** Host used by backbone (residential) proxies, whose list entries have no proxy_address. */
export const WEBSHARE_BACKBONE_HOST = 'p.webshare.io';

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
