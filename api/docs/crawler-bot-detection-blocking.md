# Crawler getting blocked by bot-management (Cloudflare etc.)

## Problem

Several scrapers fail consistently in production while the exact same request
succeeds from a normal dev machine. Confirmed on `openhousechania.com`
(Cloudflare) and suspected on `hellashomes.gr` and `elgrecogeopap.gr`
(2026-09-01 incidents) — production is 0/N successful, a residential dev
machine is N/N successful on identical URLs.

Pulled the actual `DiagnosticsPackage` (screenshot + HTML + console log) for
one failed `openhousechania` run. It shows Cloudflare's "Performing security
verification" interstitial (`cType: 'non-interactive'` — normally
auto-clears in a few seconds for a real browser). It never cleared: the same
fingerprinting probe re-ran every ~5s for the full wait window, and the
console repeatedly logged:

```
warning: No available adapters.
warning: [.WebGL-...] GPU stall due to ReadPixels
error: Failed to load resource: the server responded with a status of 403
```

## Root causes

1. **No real GPU in the crawler's container** — a WebGPU adapter request
   resolves to `null` and WebGL falls back to software rendering. Real user
   devices almost always report a GPU; this is a well-known automation tell
   that Cloudflare's bot-management scores on.
2. **Datacenter egress IP** — the crawler runs on Railway (`us-west2`, GCP)
   with no proxy or static-IP add-on (checked `get-service-config`: no
   `PROXY`/`FIXIE`/`QUOTAGUARD`-style env vars). Hosting/datacenter ASN
   ranges are scored far more aggressively than residential IPs by
   Cloudflare and similar WAFs.
3. The same console log shows the challenge script checking
   `Function.prototype.toString` on built-ins (detects monkey-patched
   functions) — i.e. it's also checking for the kind of stealth patches the
   crawler already applies (`stealth.utils.ts`), so a naive additional patch
   risks being detected too if not done carefully.

Retries/backoff (already added to the crawler) don't help here — this isn't
a transient network blip, it's an active, repeatable fingerprint match.

## Fix options

### 1. Managed unblocking/scraping API (recommended for reliability)
Swap the direct Playwright request for a hosted API that handles proxying,
fingerprinting, and CAPTCHA/challenge-solving for you. Highest reliability,
lowest engineering effort, ongoing cost per request.
- **Bright Data Web Unlocker / Scraping Browser**
- **Zyte API** (formerly Scrapy Cloud/Smart Proxy Manager)
- **ScraperAPI**
- **ScrapingBee**

### 2. Residential/rotating proxy + keep current Playwright setup
Route egress through a residential or mobile IP pool. Fixes the IP-reputation
half of the problem; still need to address the GPU/WebGL fingerprint
separately (see #3). Cheaper than a full unblocker API but more integration
work (wire `proxy:` into Playwright's browser launch, handle rotation/session
stickiness for pagination).
- **Bright Data** (residential/mobile proxies)
- **Oxylabs**
- **IPRoyal**
- **Smartproxy**

### 3. Maintained stealth toolchain (cheapest, least reliable alone)
Replace the hand-rolled `stealth.utils.ts` patches with a maintained library
built specifically to survive fingerprinting probes (native-code
`toString` spoofing, WebGL/WebGPU spoofing, timing consistency, etc.).
Usually still needs a decent IP (#2) to be effective — fingerprint fixes
alone rarely beat Cloudflare's IP reputation scoring.
- **patchright** (patched Playwright, drop-in replacement, actively
  maintained for anti-detection)
- **rebrowser-patches** (patches Playwright/Puppeteer's CDP leaks)
- `playwright-extra` + a stealth plugin (less actively maintained port of
  `puppeteer-extra-plugin-stealth`)

### 4. Do nothing for now
Leave affected scrapers `BROKEN`, handle failures manually/on a schedule.
No cost, no reliability — status quo as of 2026-09-01.

## Recommendation

If this keeps recurring across more agencies, #1 (managed unblocking API) is
the least effort for the reliability gained — it replaces both root causes
(IP + fingerprint) in one paid integration instead of stacking two partial
fixes (#2 + #3). Worth prototyping against `openhousechania.com` specifically
since it's the confirmed, reproducible test case.

## Update 2026-09-07: went with #1 (Bright Data), confirmed constraints

Implemented via `Scraper.use_managed_browser` + `StealthBrowserService` /
`docs/proxy-cost-analysis.md`. Getting this reliable took several rounds of
real production failures. Confirmed facts about Bright Data's Browser API,
sourced from `docs.brightdata.com` (FAQ, error-codes, code-examples pages)
and their own `/browser_sessions` account API — **not** from the
`brightdata/skills` GitHub repo, which contradicts the official docs on
session reuse (claims "one navigation per session" and a 30-minute cap; the
official docs' own code examples reuse one connection across multiple
`page.goto()` calls to different URLs, and error-codes gives 60 minutes) —
trust docs.brightdata.com over that repo if they conflict again:

- **One session = one domain, reusable across many pages of it.** Bright
  Data's own "Browser Cache" example reuses one `browser` across a loop of
  `page.goto()` calls to different URLs. Navigating to a different **domain**
  mid-session hits `navigate_domains_limit` ("Session limited to one
  domain") — open a new session per domain/crawl, not per page, and not one
  shared forever across unrelated domains (that was our first bug: one
  connection cached app-wide for the process's whole lifetime).
- **5-minute inactivity kill**: `network_inactivity_timeout` — "Session
  terminated after 5 minutes of no network activity." A page stuck doing pure
  DOM work (e.g. `page.evaluate()`, which has no built-in Playwright timeout)
  with no new HTTP requests can silently burn this budget.
- **60-minute hard cap**: `session_timeout` — "Session reached the 60-minute
  limit," regardless of activity. Any connection reused across many pages
  (our detail-page worker pool) must proactively rotate well inside this
  (`MANAGED_SESSION_MAX_AGE_MS`, currently 45 min) or Bright Data kills it
  out from under you mid-batch.
- **30s connection handshake timeout** (`client_timeout`): a brand new
  `connectOverCDP()` that can't establish within 30s fails outright. We hit
  this in a cascade after the inactivity/hang bugs above left orphaned
  sessions eating the account's concurrency budget — fixing the leaks (below)
  resolved it without needing to raise this timeout.
- **`page.goto()` needs a ≥2-minute timeout, not the default 30s.** Bright
  Data's own docs/examples set this explicitly: "Default timeouts (30s) are
  too short — complex anti-bot procedures take time," and "anything below 60
  seconds risks premature timeouts on difficult sites." We were using the
  platform's normal 30s default for managed-browser crawls too; now
  `MANAGED_BROWSER_MIN_PAGE_TIMEOUT_MS` (120s) floors it for managed crawls
  only.
- **Custom headers change billing.** Overriding `Accept-Language`/`Accept` is
  rejected outright unless "Custom headers and cookies" is enabled on the
  zone — and enabling that shifts billing from success-only to charging for
  100% of requests. We strip those two headers for managed crawls instead of
  touching the zone setting.
- **`page.route()` resource blocking is officially supported** for Playwright
  specifically — our image-blocking optimization (see
  `docs/proxy-cost-analysis.md`) uses their own documented pattern verbatim.

Net result: one dead connection (from a hung item, an off-domain redirect
tripping `navigate_domains_limit`, or just old age) now only costs the one
item it was processing — `isManagedSessionDeadError` in `crawler.utils.ts`
detects the shape of these errors and the detail-page worker pool
(`DetailEnrichmentService.enrichDetailPages`) rotates to a fresh connection
immediately rather than retrying a connection that will fail identically
forever.
