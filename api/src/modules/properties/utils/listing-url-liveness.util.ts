export type ListingLiveness = 'gone' | 'live' | 'unknown';

const NOT_FOUND_TITLE = /404|not\s*found|δεν\s+βρέθηκε|δεν\s+υπάρχει/i;

/**
 * Asks the agency's own site whether a listing page still exists, so a crawl
 * that merely failed to *see* a listing (timeout, pagination hiccup) does not
 * unpublish it.
 *
 *  - 'gone':    404/410, or redirected to the homepage / a 404-looking page, or
 *               a 2xx page whose <title> says not found.
 *  - 'live':    2xx on the same listing (a redirect to another real page, e.g. a
 *               canonical slug change, also counts as live).
 *  - 'unknown': blocked/throttled/erroring/unreachable. The caller falls back to
 *               its previous behaviour, so a bot-protected site never makes
 *               removals *less* likely than before.
 */
export async function checkListingLiveness(
  url: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<ListingLiveness> {
  const { timeoutMs = 15_000, fetchImpl = fetch } = options;
  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml',
      },
    });

    if (response.status === 404 || response.status === 410) return 'gone';
    if (response.status < 200 || response.status >= 300) return 'unknown';

    const finalUrl = new URL(response.url || url);
    const requested = new URL(url);
    if (finalUrl.href !== requested.href) {
      const path = finalUrl.pathname.replace(/\/+$/, '');
      if (path === '' || /(^|\/)(404|not-?found)(\/|$)/i.test(path)) {
        return 'gone';
      }
      // Language-prefix-only homepages (/el, /el-GR) are also "the homepage".
      if (/^\/[a-z]{2}(-[A-Za-z]{2})?$/.test(path)) return 'gone';
    }

    const body = await response.text();
    const title = /<title[^>]*>([^<]*)/i.exec(body)?.[1] ?? '';
    if (NOT_FOUND_TITLE.test(title)) return 'gone';
    return 'live';
  } catch {
    return 'unknown';
  }
}
