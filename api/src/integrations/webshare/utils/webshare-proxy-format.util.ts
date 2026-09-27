import {
  WEBSHARE_BACKBONE_HOST,
  WEBSHARE_BACKBONE_PORTS,
} from '../constants/webshare.constants';
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
  // A backbone (residential) entry has no proxy_address: it is reached through
  // the shared gateway, where the username selects the exit and the entry's own
  // listed `port` is unroutable (see WEBSHARE_BACKBONE_PORTS). Datacenter
  // entries do have a real address:port of their own -- keep those as listed.
  const isBackbone = !proxy.proxy_address;
  return {
    protocol,
    host: proxy.proxy_address ?? WEBSHARE_BACKBONE_HOST,
    port: isBackbone ? WEBSHARE_BACKBONE_PORTS[protocol] : proxy.port,
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
