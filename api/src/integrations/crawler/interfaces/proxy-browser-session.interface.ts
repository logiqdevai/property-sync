import type { Cookie } from 'playwright';
import type { WebsharePlaywrightProxy } from '@/integrations/webshare/interfaces/webshare.interfaces';

// State shared by every browser/context/page of ONE crawl that runs through a
// Webshare proxy (Scraper.use_proxy_browser). The whole crawl deliberately uses
// the SAME proxy (same exit IP) and carries the cookie jar from context to
// context: a bot-protection challenge (e.g. Imperva's "Pardon Our
// Interruption") costs 0.25-1 MB of script on a cold context, so re-solving it
// for every page would burn the plan's small monthly bandwidth in a few pages.
export interface ProxyBrowserSession {
  proxy: WebsharePlaywrightProxy;
  // Cookie jar, saved from each context as it closes and replayed into the
  // next one (see StealthBrowserService).
  cookies: Cookie[];
  // Bytes actually transferred through the proxy by this crawl (request +
  // response, headers + bodies). A slight undercount of what Webshare bills
  // (TLS/CONNECT overhead), good enough for the cost log.
  bytes: number;
  requests: number;
  // Hard ceiling for this crawl (bytes). Once reached every further request is
  // aborted so a runaway crawl can't drain the plan. Infinity = no known limit.
  maxBytes: number;
}

export function createProxyBrowserSession(
  proxy: WebsharePlaywrightProxy,
  maxBytes = Infinity,
): ProxyBrowserSession {
  return { proxy, cookies: [], bytes: 0, requests: 0, maxBytes };
}
