import { BrowserContext, BrowserContextOptions } from 'playwright';

// Major version must track the bundled Playwright/Chromium build (see `npx playwright --version`
// and BrowserVersion in Playwright docs) — Playwright's `userAgent` context option only overrides
// this header string, not Client Hints (Sec-CH-UA / navigator.userAgentData), which always report
// the browser's real version. A stale major version here creates a UA-vs-Client-Hints mismatch that
// some sites' bot detection flags as a spoofed/automated request and hard-blocks (was pinned to
// Chrome/124 while the bundled browser was Chromium 149 — every request got a blanket 403).
export const STEALTH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

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
  },
};

export async function applyStealthInitScript(
  context: BrowserContext,
): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });
}
