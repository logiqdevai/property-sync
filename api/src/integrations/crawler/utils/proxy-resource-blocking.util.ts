// Resource types never fetched through the proxy. The scraper only reads an
// <img>'s `src` attribute (already in the DOM) -- never the pixels -- and
// media/fonts add nothing to text/attribute extraction. Property image bytes
// are downloaded later with plain fetch() (direct, not proxied).
const BLOCKED_RESOURCE_TYPES: ReadonlySet<string> = new Set([
  'image',
  'media',
  'font',
]);

// Analytics / ads / social widgets / embedded video: pure bandwidth for a
// scraper. Bot-protection and captcha hosts (hcaptcha, recaptcha, cloudflare,
// incapsula/imperva, datadome, ...) are deliberately NOT listed -- blocking
// them would stop the challenge from ever clearing.
const BLOCKED_HOST_SUFFIXES = [
  'google-analytics.com',
  'googletagmanager.com',
  'googlesyndication.com',
  'googleadservices.com',
  'doubleclick.net',
  'facebook.net',
  'facebook.com',
  'hotjar.com',
  'clarity.ms',
  'tiktok.com',
  'ads-twitter.com',
  'linkedin.com',
  'youtube.com',
  'youtube-nocookie.com',
  'vimeo.com',
  'addthis.com',
  'sharethis.com',
  'tawk.to',
  'crisp.chat',
  'intercom.io',
  'hubspot.com',
];

export function shouldBlockProxyRequest(
  url: string,
  resourceType: string,
): boolean {
  if (BLOCKED_RESOURCE_TYPES.has(resourceType)) return true;

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }
  return BLOCKED_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}
