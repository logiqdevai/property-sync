export interface ProxyParams {
  proxyType: 'http' | 'socks4' | 'socks5';
  proxyAddress: string;
  proxyPort: number;
  proxyLogin?: string;
  proxyPassword?: string;
}

export interface TurnstileParams {
  websiteURL: string;
  websiteKey: string;
  /** Cloudflare Challenge pages only: `action`, `cData`, `chlPageData` from turnstile.render. */
  action?: string;
  data?: string;
  pagedata?: string;
  proxy?: ProxyParams;
}

export interface RecaptchaV2Params {
  websiteURL: string;
  websiteKey: string;
  isInvisible?: boolean;
  recaptchaDataSValue?: string;
  userAgent?: string;
  cookies?: string;
  proxy?: ProxyParams;
}

/**
 * hCaptcha is not in 2captcha's published v2 docs, but `HCaptchaTaskProxyless`
 * is accepted and solves (verified live 2026-10-20: ~30s, $0.003). Imperva's
 * "Pardon Our Interruption" page wraps one.
 */
export interface HCaptchaParams {
  websiteURL: string;
  websiteKey: string;
  proxy?: ProxyParams;
}

export interface RecaptchaV3Params {
  websiteURL: string;
  websiteKey: string;
  minScore?: number;
  pageAction?: string;
  isEnterprise?: boolean;
}

export interface ImageCaptchaParams {
  /** Raw base64 (or a data: URI) of the captcha image. */
  body: string;
  phrase?: boolean;
  case?: boolean;
  numeric?: 0 | 1 | 2 | 3 | 4;
  math?: boolean;
  minLength?: number;
  maxLength?: number;
  comment?: string;
}

export interface CaptchaSolution {
  taskId: number;
  /** Token for Turnstile / reCAPTCHA; recognised text for image captchas. */
  token: string;
  /** Turnstile on a Challenge page: use this UA with the token. */
  userAgent?: string;
  cost?: string;
}

export interface TwoCaptchaResponse<S = Record<string, unknown>> {
  errorId: number;
  errorCode?: string;
  errorDescription?: string;
  taskId?: number;
  status?: 'processing' | 'ready';
  solution?: S;
  cost?: string;
  balance?: number;
}
