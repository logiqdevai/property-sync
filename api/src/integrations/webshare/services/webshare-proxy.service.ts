import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { WebshareConfig } from '../config/webshare.config';
import {
  WEBSHARE_DEFAULT_PAGE_SIZE,
  WEBSHARE_DEFAULT_PROXY_MODE,
} from '../constants/webshare.constants';
import { WebshareException } from '../exceptions/webshare.exception';
import {
  WebshareIpAuthorization,
  WebshareListProxiesParams,
  WebsharePaginated,
  WebsharePlan,
  WebsharePlaywrightProxy,
  WebshareProfile,
  WebshareProxy,
  WebshareProxyConfig,
  WebshareProxyProtocol,
  WebshareStats,
  WebshareStatsRange,
  WebshareSubscription,
} from '../interfaces/webshare.interfaces';
import {
  toPlaywrightProxy,
  toProxyEndpoint,
  toProxyUrl,
} from '../utils/webshare-proxy-format.util';
import { WebshareClientService } from './webshare-client.service';

// How many different exits to try before giving up on a proxy crawl. ~30% of
// entries the API reports as `valid` are dead (see pickWorkingProxy), so six
// attempts put the odds of finding none at well under 0.1%.
const WEBSHARE_PROBE_MAX_ATTEMPTS = 6;
const WEBSHARE_PROBE_TIMEOUT_MS = 15_000;

// Statuses that mean the GATEWAY could not serve us, not that the target
// answered: 407 = the username does not resolve to an exit, 502/503/504 = the
// exit node is unreachable. Anything else (including a 403/404/405 to our HEAD)
// proves the tunnel works and is the target's own answer.
const WEBSHARE_GATEWAY_FAILURE_STATUSES: ReadonlySet<number> = new Set([
  407, 502, 503, 504,
]);

@Injectable()
export class WebshareProxyService {
  private readonly logger = new Logger(WebshareProxyService.name);

  constructor(
    private readonly client: WebshareClientService,
    private readonly config: WebshareConfig,
  ) {}

  isConfigured(): boolean {
    return this.config.isConfigured();
  }

  getProfile(): Promise<WebshareProfile> {
    return this.client.request({ path: this.config.getPaths().profile });
  }

  getSubscription(): Promise<WebshareSubscription> {
    return this.client.request({ path: this.config.getPaths().subscription });
  }

  getPlan(planId: number): Promise<WebsharePlan> {
    return this.client.request({
      path: `${this.config.getPaths().subscriptionPlan}${planId}/`,
    });
  }

  getProxyConfig(): Promise<WebshareProxyConfig> {
    return this.client.request({ path: this.config.getPaths().proxyConfig });
  }

  /** Hourly usage buckets. */
  getStats(): Promise<WebshareStats[]> {
    return this.client.request({ path: this.config.getPaths().stats });
  }

  /** Usage totals for the current period (`bandwidth_total` is in bytes). */
  getStatsAggregate(range: WebshareStatsRange = {}): Promise<WebshareStats> {
    return this.client.request({
      path: this.config.getPaths().statsAggregate,
      query: {
        timestamp__gte: range.from?.toISOString(),
        timestamp__lte: range.to?.toISOString(),
      },
    });
  }

  listProxiesPage(
    params: WebshareListProxiesParams = {},
  ): Promise<WebsharePaginated<WebshareProxy>> {
    return this.client.request({
      path: this.config.getPaths().proxyList,
      query: {
        mode: params.mode ?? WEBSHARE_DEFAULT_PROXY_MODE,
        page: params.page ?? 1,
        page_size: params.pageSize ?? WEBSHARE_DEFAULT_PAGE_SIZE,
        country_code__in: params.countryCodes?.length
          ? params.countryCodes.join(',')
          : undefined,
        valid: params.valid,
        ordering: params.ordering,
      },
    });
  }

  /**
   * Proxies across pages, capped at `maxPages` -- a residential plan lists
   * ~200,000 entries, so "all" must never mean literally all (each page is a
   * throttled API call). Use `pickRandomProxy` to just get one.
   */
  async listAllProxies(
    params: Omit<WebshareListProxiesParams, 'page'> = {},
    maxPages = 20,
  ): Promise<WebshareProxy[]> {
    const all: WebshareProxy[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const res = await this.listProxiesPage({ ...params, page });
      all.push(...res.results);
      if (!res.next || res.results.length === 0) break;
    }
    return all;
  }

  listValidProxies(
    params: Omit<WebshareListProxiesParams, 'page' | 'valid'> = {},
    maxPages = 20,
  ): Promise<WebshareProxy[]> {
    return this.listAllProxies({ ...params, valid: true }, maxPages);
  }

  /**
   * Random valid proxy, optionally restricted to countries (default:
   * WEBSHARE_PROXY_COUNTRY_CODES). Two cheap calls regardless of pool size:
   * read the match count with page_size=1, then fetch one random entry.
   */
  async pickRandomProxy(countryCodes?: string[]): Promise<WebshareProxy> {
    const codes = countryCodes ?? this.config.getProxyCountryCodes();
    const base = { countryCodes: codes, valid: true, pageSize: 1 };

    const head = await this.listProxiesPage({ ...base, page: 1 });
    if (head.count === 0) {
      throw new WebshareException(
        'No valid Webshare proxies available',
        'WEBSHARE_NO_PROXIES',
        HttpStatus.SERVICE_UNAVAILABLE,
        { countryCodes: codes },
      );
    }

    const page = 1 + Math.floor(Math.random() * head.count);
    if (page === 1) return head.results[0];
    const picked = await this.listProxiesPage({ ...base, page });
    return picked.results[0] ?? head.results[0];
  }

  /**
   * A proxy that is reachable *right now*, for a crawl that cannot recover from
   * a dead one (the whole run navigates through this single exit).
   *
   * `valid: true` from the API is stale: probed live 2026-09-27 over 30 random
   * entries, only 21 could actually carry traffic -- the rest had the gateway
   * answer 502 or reset the connection, which surfaces mid-crawl as an opaque
   * Playwright navigation error. So each candidate is probed with one cheap
   * HEAD through the proxy and re-rolled until one answers.
   */
  async pickWorkingProxy(
    probeUrl: string,
    countryCodes?: string[],
  ): Promise<WebshareProxy> {
    if (!this.isProbeableUrl(probeUrl)) {
      this.logger.warn(
        `Cannot probe proxies against "${probeUrl}" -- picking one unverified`,
      );
      return this.pickRandomProxy(countryCodes);
    }

    const failures: string[] = [];
    for (let attempt = 0; attempt < WEBSHARE_PROBE_MAX_ATTEMPTS; attempt++) {
      const proxy = await this.pickRandomProxy(countryCodes);
      const failure = await this.probeProxy(proxy, probeUrl);
      if (!failure) return proxy;
      failures.push(`${proxy.id}: ${failure}`);
    }

    throw new WebshareException(
      `No reachable Webshare proxy after ${WEBSHARE_PROBE_MAX_ATTEMPTS} attempts (${failures.join('; ')})`,
      'WEBSHARE_NO_REACHABLE_PROXY',
      HttpStatus.SERVICE_UNAVAILABLE,
      { probeUrl, failures },
    );
  }

  /** `null` when the proxy carried the request, else a short reason it did not. */
  private async probeProxy(
    proxy: WebshareProxy,
    probeUrl: string,
  ): Promise<string | null> {
    const endpoint = toProxyEndpoint(proxy, 'http');
    try {
      const response = await axios.request({
        url: probeUrl,
        method: 'HEAD',
        timeout: WEBSHARE_PROBE_TIMEOUT_MS,
        maxRedirects: 2,
        validateStatus: () => true,
        proxy: {
          protocol: endpoint.protocol,
          host: endpoint.host,
          port: endpoint.port,
          auth: {
            username: endpoint.username,
            password: endpoint.password,
          },
        },
      });
      return WEBSHARE_GATEWAY_FAILURE_STATUSES.has(response.status)
        ? `gateway returned ${response.status}`
        : null;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return error.code ?? error.message;
      }
      return error instanceof Error ? error.message : String(error);
    }
  }

  private isProbeableUrl(url: string): boolean {
    try {
      const { protocol } = new URL(url);
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }

  toProxyUrl(
    proxy: WebshareProxy,
    protocol: WebshareProxyProtocol = 'http',
  ): string {
    return toProxyUrl(toProxyEndpoint(proxy, protocol));
  }

  toPlaywrightProxy(
    proxy: WebshareProxy,
    protocol: WebshareProxyProtocol = 'http',
  ): WebsharePlaywrightProxy {
    return toPlaywrightProxy(toProxyEndpoint(proxy, protocol));
  }

  /** Ask Webshare to refresh (replace) the proxy list. */
  refreshProxyList(): Promise<void> {
    return this.client.request({
      method: 'POST',
      path: this.config.getPaths().proxyListRefresh,
    });
  }

  listIpAuthorizations(): Promise<WebsharePaginated<WebshareIpAuthorization>> {
    return this.client.request({
      path: this.config.getPaths().ipAuthorization,
    });
  }

  addIpAuthorization(ipAddress: string): Promise<WebshareIpAuthorization> {
    return this.client.request({
      method: 'POST',
      path: this.config.getPaths().ipAuthorization,
      body: { ip_address: ipAddress },
    });
  }

  removeIpAuthorization(id: number): Promise<void> {
    return this.client.request({
      method: 'DELETE',
      path: `${this.config.getPaths().ipAuthorization}${id}/`,
    });
  }

  async getWhatsMyIp(): Promise<string> {
    const res = await this.client.request<{ ip_address: string }>({
      path: this.config.getPaths().whatsMyIp,
    });
    return res.ip_address;
  }
}
