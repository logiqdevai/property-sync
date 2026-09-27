import { BrowserContext, BrowserContextOptions } from 'playwright';

// Major version must track the bundled Playwright/Chromium build (see `npx playwright --version`
// and BrowserVersion in Playwright docs) — Playwright's `userAgent` context option only overrides
// this header string, not Client Hints (Sec-CH-UA / navigator.userAgentData), which always report
// the browser's real version. A stale major version here creates a UA-vs-Client-Hints mismatch that
// some sites' bot detection flags as a spoofed/automated request and hard-blocks (was pinned to
// Chrome/124 while the bundled browser was Chromium 149 — every request got a blanket 403).
export const STEALTH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

const STEALTH_UA_MAJOR = /Chrome\/(\d+)/.exec(STEALTH_UA)?.[1] ?? '149';

// The brand Chromium reports for itself when headless. Both the Sec-CH-UA
// header and navigator.userAgentData carry it, and it survives every
// `userAgent` override — so a site that looks at Client Hints rather than the
// UA string sees "headless browser" no matter how clean STEALTH_UA is.
const HEADLESS_BRAND = 'HeadlessChrome';
const REAL_CHROME_BRAND = 'Google Chrome';

export const STEALTH_LAUNCH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
] as const;

export const STEALTH_CONTEXT_OPTIONS: BrowserContextOptions = {
  userAgent: STEALTH_UA,
  viewport: { width: 1280, height: 900 },
  extraHTTPHeaders: {
    'Accept-Language': 'en-US,en;q=0.9',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    // Sent on every secure request alongside the UA above, and left at
    // `"HeadlessChrome";v="149", ...` by Playwright's userAgent option. Pinned
    // here to the same browser STEALTH_UA claims to be, so the header pair is
    // self-consistent for anything checking it server-side.
    'Sec-CH-UA': `"${REAL_CHROME_BRAND}";v="${STEALTH_UA_MAJOR}", "Chromium";v="${STEALTH_UA_MAJOR}", "Not)A;Brand";v="24"`,
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"Windows"',
  },
};

export async function applyStealthInitScript(
  context: BrowserContext,
): Promise<void> {
  await context.addInitScript(
    ({ headlessBrand, realBrand }) => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // navigator.userAgentData is the JS-side half of the same leak the
      // Sec-CH-UA header carries (see STEALTH_CONTEXT_OPTIONS): its brand list
      // still names HeadlessChrome even with userAgent fully overridden.
      // Confirmed live on a real target (hellashomes.gr): its
      // /__browser-challenge interstitial scores the request, and the ONLY
      // signal it ever caught was `getHighEntropyValues(['fullVersionList'])`
      // returning a HeadlessChrome brand — UA string, navigator.webdriver and
      // its CDP probe were all already clean. A flagged score does not fail
      // loudly; the site accepts the challenge token, then serves an empty
      // response for every real page, which surfaces only as an opaque
      // ERR_EMPTY_RESPONSE / ERR_HTTP2_PROTOCOL_ERROR navigation failure.
      //
      // Only the brand NAME is rewritten — versions stay exactly as the real
      // browser reports them, so nothing here can reintroduce the
      // version-mismatch problem STEALTH_UA's own comment describes.
      type Brand = { brand: string; version: string };
      type UaData = {
        brands: Brand[];
        mobile: boolean;
        platform: string;
        getHighEntropyValues(hints: string[]): Promise<Record<string, unknown>>;
        toJSON(): unknown;
      };

      const nav = navigator as Navigator & { userAgentData?: UaData };
      const uaData = nav.userAgentData;
      if (!uaData) return;

      const renameBrand = (brand: string) =>
        brand.includes(headlessBrand) ? realBrand : brand;
      const fixBrands = (brands: unknown): unknown =>
        Array.isArray(brands)
          ? (brands as Brand[]).map((entry) => ({
              ...entry,
              brand: renameBrand(entry.brand),
            }))
          : brands;

      const patchedBrands = fixBrands(uaData.brands) as Brand[];

      const patched: UaData = {
        brands: patchedBrands,
        mobile: uaData.mobile,
        platform: uaData.platform,
        getHighEntropyValues: async (hints: string[]) => {
          const values = await uaData.getHighEntropyValues.call(uaData, hints);
          const result: Record<string, unknown> = { ...values };
          if ('brands' in result) result.brands = fixBrands(result.brands);
          if ('fullVersionList' in result) {
            result.fullVersionList = fixBrands(result.fullVersionList);
          }
          return result;
        },
        toJSON: () => ({
          brands: patchedBrands,
          mobile: uaData.mobile,
          platform: uaData.platform,
        }),
      };

      Object.defineProperty(navigator, 'userAgentData', {
        get: () => patched,
        configurable: true,
      });
    },
    { headlessBrand: HEADLESS_BRAND, realBrand: REAL_CHROME_BRAND },
  );
}
