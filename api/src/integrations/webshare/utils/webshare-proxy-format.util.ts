import { WEBSHARE_BACKBONE_HOST } from '../constants/webshare.constants';
import {
  WebsharePlaywrightProxy,
  WebshareProxy,
  WebshareProxyEndpoint,
  WebshareProxyProtocol,
} from '../interfaces/webshare.interfaces';

export function toProxyEndpoint(
  proxy: WebshareProxy,
  protocol: WebshareProxyProtocol = 'http',
): WebshareProxyEndpoint {
  return {
    protocol,
    host: proxy.proxy_address ?? WEBSHARE_BACKBONE_HOST,
    port: proxy.port,
    username: proxy.username,
    password: proxy.password,
    countryCode: proxy.country_code,
  };
}

/** `protocol://user:pass@host:port` with credentials URL-encoded. */
export function toProxyUrl(endpoint: WebshareProxyEndpoint): string {
  const user = encodeURIComponent(endpoint.username);
  const pass = encodeURIComponent(endpoint.password);
  return `${endpoint.protocol}://${user}:${pass}@${endpoint.host}:${endpoint.port}`;
}

export function toPlaywrightProxy(
  endpoint: WebshareProxyEndpoint,
): WebsharePlaywrightProxy {
  return {
    server: `${endpoint.protocol}://${endpoint.host}:${endpoint.port}`,
    username: endpoint.username,
    password: endpoint.password,
  };
}
