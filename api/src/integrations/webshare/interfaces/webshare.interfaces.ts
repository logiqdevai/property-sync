export type WebshareProxyMode = 'direct' | 'backbone' | 'rotating';

export type WebshareProxyProtocol = 'http' | 'socks5';

export interface WebsharePaginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface WebshareProxy {
  id: string;
  username: string;
  password: string;
  proxy_address: string | null;
  port: number;
  valid: boolean;
  last_verification: string | null;
  country_code: string | null;
  city_name: string | null;
  asn_name: string | null;
  asn_number: number | null;
  high_country_confidence: boolean;
  created_at: string;
}

export interface WebshareProxyConfig {
  state: string;
  bandwidth_limit: number | null;
  bandwidth_total: number | null;
  request_limit: number | null;
  proxy_limit: number;
  auto_replace_invalid_proxies: boolean;
  auto_replace_low_country_confidence_proxies: boolean;
  auto_replace_out_of_rotation_proxies: boolean;
  auto_replace_failed_proxies: boolean;
  [key: string]: unknown;
}

export interface WebshareProfile {
  id: number;
  email: string;
  last_login: string | null;
  [key: string]: unknown;
}

export interface WebshareSubscription {
  id: number;
  /** Plan id (resolve with `getPlan`). */
  plan: number;
  term: string;
  start_date: string;
  end_date: string;
  [key: string]: unknown;
}

export interface WebsharePlan {
  id: number;
  status: string;
  /** Monthly bandwidth allowance in GB. */
  bandwidth_limit: number | null;
  monthly_price: number;
  proxy_type: string;
  proxy_subtype: string;
  proxy_count: number;
  [key: string]: unknown;
}

export interface WebshareStatsRange {
  from?: Date;
  to?: Date;
}

export interface WebshareStats {
  bandwidth_total: number;
  bandwidth_average: number;
  requests_total: number;
  requests_successful: number;
  requests_failed: number;
  error_reasons: {
    reason: string;
    type: string;
    http_status: number;
    count: number;
  }[];
  countries_used: Record<string, number>;
  number_of_proxies_used: number;
  last_request_sent_at: string | null;
  [key: string]: unknown;
}

export interface WebshareIpAuthorization {
  id: number;
  ip_address: string;
  created_at: string;
  last_used_at: string | null;
}

export interface WebshareListProxiesParams {
  mode?: WebshareProxyMode;
  page?: number;
  pageSize?: number;
  countryCodes?: string[];
  valid?: boolean;
  ordering?: string;
}

export interface WebshareRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export interface WebshareProxyEndpoint {
  protocol: WebshareProxyProtocol;
  host: string;
  port: number;
  username: string;
  password: string;
  countryCode?: string | null;
}

/** Shape accepted by Playwright's `launch({ proxy })` / `newContext({ proxy })`. */
export interface WebsharePlaywrightProxy {
  server: string;
  username: string;
  password: string;
}
