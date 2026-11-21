import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  chromium,
  Page,
} from 'playwright';
import { PlatformConfigService } from '@/modules/platform-config/platform-config.service';
import {
  STEALTH_CONTEXT_OPTIONS,
  STEALTH_LAUNCH_ARGS,
  applyStealthInitScript,
} from '../utils/stealth.utils';
import { trackDocumentResponses } from '../block-handling/block-handling.utils';
import { AsyncSemaphore } from '../utils/async-semaphore.util';
import { ProxyBrowserSession } from '../interfaces/proxy-browser-session.interface';
import { shouldBlockProxyRequest } from '../utils/proxy-resource-blocking.util';
import { redactError } from '@/shared/utils/redact-secrets.util';

export interface StealthPageSession {
  context: BrowserContext;
  page: Page;
}

export interface NewStealthPageOptions {
  // Route this page through the managed remote browser (BRIGHT_DATA_CDP_ENDPOINT)
  // instead of the shared local Chromium. Only worth it for agencies whose
  // bot-protection blocks our datacenter IP/fingerprint outright -- see
  // SourceAgency.use_managed_browser and docs/crawler-bot-detection-blocking.md.
  useManagedBrowser?: boolean;
  // Abort image/media/font requests. The scraper only ever reads an <img>'s `src`
  // attribute (a URL string already present in the unloaded DOM) -- it never
  // needs the actual pixel bytes, and images are consistently 90%+ of a page's
  // transfer weight (see docs/proxy-cost-analysis.md). Real image bytes are
  // fetched later, separately, via plain fetch() when actually needed (e.g.
  // WatermarkRemovalService), so this loses no data.
  blockImages?: boolean;
  // Route this page through the crawl's Webshare proxy (Scraper.use_proxy_browser)
  // in our OWN local Chromium -- a dedicated browser launched with the proxy, so
  // the shared no-proxy browser is never affected. Implies aggressive resource
  // blocking (images/media/fonts + trackers, see proxy-resource-blocking.util)
  // because the plan's bandwidth is tiny. Image bytes are never proxied: the
  // app downloads them later with plain fetch(), outside any browser.
  proxySession?: ProxyBrowserSession;
}

// Bright Data's documented Browser API session limits (docs.brightdata.com/
// scraping-automation/scraping-browser/error-codes), confirmed via their own
// error-code reference:
//   - network_inactivity_timeout: "Session terminated after 5 minutes of no
//     network activity."
//   - session_timeout: "Session reached the 60-minute limit."
//   - navigate_domains_limit: "Session limited to one domain" -- a session
//     must never navigate cross-origin; Bright Data's own FAQ confirms
//     "unlimited navigations within the same domain" is the intended reuse
//     pattern (open one session per domain/crawl, not one per page, and not
//     one shared forever across unrelated domains/crawls).
// Rotate proactively well inside the 60-minute cap so a caller reusing one
// managed Browser across many pages (see DetailEnrichmentService's worker
// pool) never gets killed by Bright Data mid-item.
export const MANAGED_SESSION_MAX_AGE_MS = 45 * 60_000;

// Shared local Chromium housekeeping (see startHousekeeping). Found in
// production (2026-11-21): after one 1,055-detail-page crawl the shared
// browser never recycled again -- recycling required browser.contexts() to be
// empty, so a single context whose close() never completed blocked it
// forever -- and the host's RAM, swap and CPU climbed for 3 days with no
// crawl running until the box swap-thrashed and every Redis/Postgres socket
// in the API timed out.
//   - Relaunch the browser once it has served a crawl and then sat idle
//     (no context leased) this long, so every crawl window starts fresh.
const LOCAL_BROWSER_IDLE_RECYCLE_MS = 10 * 60_000;
//   - Force-close any local context still leased after this long. A detail
//     page is hard-capped at a few minutes and a listing walk well under an
//     hour, so a context this old was leaked by its caller.
const LOCAL_CONTEXT_MAX_AGE_MS = 3 * 60 * 60_000;
const HOUSEKEEPING_INTERVAL_MS = 60_000;

@Injectable()
export class StealthBrowserService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StealthBrowserService.name);
  private browser: Browser | null = null;
  private contextsSinceLaunch = 0;
  // Contexts on the shared local browser that a caller still holds (opened,
  // closeContext not yet called), with their open time. Recycling is gated on
  // THIS, not browser.contexts(): a context whose close() hung is already
  // released by its caller and must not keep the browser alive forever.
  private readonly localLeases = new Map<BrowserContext, number>();
  // Callers between acquireLocalBrowser() and their context being leased.
  private pendingLocal = 0;
  private lastLocalActivityAt = Date.now();
  // Serializes launch/recycle so concurrent callers never launch two shared
  // browsers (the loser of that race used to leak a whole Chromium).
  private browserLock: Promise<unknown> = Promise.resolve();
  private housekeepingTimer: NodeJS.Timeout | null = null;

  // Bounds how many browser contexts/pages -- local Chromium AND managed
  // (Bright Data) alike -- can be open at once across every concurrently
  // running crawl/detail-enrichment job, platform-wide. Per-job concurrency
  // (crawl_worker_concurrency, detail_concurrency) only bounds each job in
  // isolation; nothing previously capped their SUM, so several agencies'
  // crawls landing in the same scheduler jitter window could stack enough
  // simultaneous pages to exhaust container memory -- confirmed in production
  // via a JS heap OOM during the nightly crawl batch. See
  // PlatformConfig.crawler_max_concurrent_browser_pages.
  private readonly pageSemaphore = new AsyncSemaphore();
  private readonly pageReleasers = new WeakMap<BrowserContext, () => void>();
  private readonly proxySessions = new WeakMap<
    BrowserContext,
    ProxyBrowserSession
  >();

  constructor(
    private readonly platformConfigService: PlatformConfigService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.withBrowserLock(async () => {
      if (!this.browser?.isConnected()) await this.launchLocalBrowser();
    });
    this.housekeepingTimer = setInterval(() => {
      void this.runHousekeeping().catch((error: unknown) =>
        this.logger.warn(`Chromium housekeeping failed: ${String(error)}`),
      );
    }, HOUSEKEEPING_INTERVAL_MS);
    this.housekeepingTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.housekeepingTimer) {
      clearInterval(this.housekeepingTimer);
      this.housekeepingTimer = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  // Convenience wrapper for one-off managed-browser usage (a single session
  // used for exactly one page, e.g. the listing-page walk): connects (or
  // reuses the shared local browser) and builds a context+page in one call.
  // Callers that need to reuse ONE managed session across MANY pages of the
  // same domain (e.g. per-item detail-page enrichment) should call
  // openManagedBrowser() once and newStealthPageOnBrowser() per page instead
  // -- see MANAGED_SESSION_MAX_AGE_MS and DetailEnrichmentService.
  async newStealthPage(
    contextOptions?: Partial<BrowserContextOptions>,
    options?: NewStealthPageOptions,
  ): Promise<StealthPageSession> {
    if (options?.useManagedBrowser || options?.proxySession) {
      const browser = options.useManagedBrowser
        ? await this.openManagedBrowser()
        : await this.openProxyBrowser(options.proxySession!);
      try {
        return await this.newStealthPageOnBrowser(
          browser,
          contextOptions,
          options,
        );
      } catch (error) {
        // This dedicated browser/connection exists only for this one page;
        // nobody else will ever close it if the page couldn't be built.
        await browser.close().catch(() => undefined);
        throw error;
      }
    }

    const browser = await this.acquireLocalBrowser();
    this.contextsSinceLaunch++;
    try {
      const session = await this.newStealthPageOnBrowser(
        browser,
        contextOptions,
        options,
      );
      this.localLeases.set(session.context, Date.now());
      return session;
    } finally {
      this.pendingLocal--;
      this.lastLocalActivityAt = Date.now();
    }
  }

  // Builds a context+page on an ALREADY-CONNECTED browser (local or managed).
  // Does not touch connection lifecycle -- the caller owns connecting and
  // eventually closing `browser` (via closeContext for a one-off page, or
  // directly for a reused/pooled connection).
  async newStealthPageOnBrowser(
    browser: Browser,
    contextOptions?: Partial<BrowserContextOptions>,
    options?: Pick<
      NewStealthPageOptions,
      'useManagedBrowser' | 'blockImages' | 'proxySession'
    >,
  ): Promise<StealthPageSession> {
    // None of our own stealth overrides apply to the managed browser -- Bright
    // Data's fleet already runs a real, current, non-headless-fingerprinted
    // browser as its core product, and every override we add on top is a
    // chance to introduce a fingerprint inconsistency their otherwise-clean
    // environment wouldn't have. Confirmed via a real production capture that
    // openhousechania.com's Cloudflare challenge never cleared through the
    // managed browser despite Bright Data reporting the CAPTCHA as solved on
    // their end -- two concrete mismatches were found:
    //   - STEALTH_UA hardcodes "Chrome/149"; Bright Data's real browser
    //     reports 152 (per our own DiagnosticsPackage.browser_version). The
    //     userAgent context option only overrides the header string, not
    //     Client Hints (Sec-CH-UA / navigator.userAgentData), which keep
    //     reporting the real 152 -- exactly the UA-vs-Client-Hints mismatch
    //     already identified and fixed for the LOCAL browser (see
    //     stealth.utils.ts's STEALTH_UA comment) but never applied here.
    //   - applyStealthInitScript's navigator.webdriver patch is a redundant,
    //     Function.prototype.toString-detectable monkey-patch on a browser
    //     that (per Bright Data's whole product pitch) shouldn't expose that
    //     tell natively in the first place -- the original bot-detection
    //     diagnosis (docs/crawler-bot-detection-blocking.md) flagged this
    //     exact risk before Bright Data was ever introduced.
    // extraHTTPHeaders is separately forbidden outright by their CDP
    // ("Overriding Accept-Language, Accept headers forbidden").
    const { max_concurrent_browser_pages } =
      await this.platformConfigService.getCrawlerConfig();
    const release = await this.pageSemaphore.acquire(
      max_concurrent_browser_pages,
    );

    let context: BrowserContext | undefined;
    try {
      const proxySession = options?.useManagedBrowser
        ? undefined
        : options?.proxySession;
      context = options?.useManagedBrowser
        ? await browser.newContext(contextOptions)
        : await browser.newContext({
            ...STEALTH_CONTEXT_OPTIONS,
            ...contextOptions,
            // Replay the crawl's cookie jar so a bot challenge cleared by an
            // earlier page isn't paid for (in proxy bandwidth) again.
            ...(proxySession && proxySession.cookies.length > 0
              ? {
                  storageState: {
                    cookies: proxySession.cookies,
                    origins: [],
                  },
                }
              : {}),
          });
      // Tracked immediately so a failure below is still cleaned up via
      // closeContext by any caller that catches and closes on error -- only
      // an outright newContext() failure (nothing to attach the releaser to)
      // falls through to the catch's own release() call.
      this.pageReleasers.set(context, release);
      if (proxySession) {
        this.proxySessions.set(context, proxySession);
        this.trackProxyTraffic(context, proxySession);
      }

      if (!options?.useManagedBrowser) {
        await applyStealthInitScript(context);
      }
      const page = await context.newPage();
      trackDocumentResponses(page);

      if (proxySession) {
        await page.route('**/*', (route) => {
          const request = route.request();
          // Budget exhausted: fail fast instead of draining the plan.
          if (
            proxySession.bytes >= proxySession.maxBytes ||
            shouldBlockProxyRequest(request.url(), request.resourceType())
          ) {
            return route.abort();
          }
          return route.continue();
        });
      } else if (options?.blockImages) {
        await page.route('**/*', (route) => {
          const type = route.request().resourceType();
          if (type === 'image' || type === 'media' || type === 'font') {
            return route.abort();
          }
          return route.continue();
        });
      }

      return { context, page };
    } catch (error) {
      if (context) {
        await context.close().catch(() => undefined);
      }
      release();
      throw error;
    }
  }

  async closeContext(
    context: BrowserContext,
    timeoutMs = 10_000,
    options?: { closeBrowser?: boolean },
  ): Promise<void> {
    const browser = context.browser();
    if (this.localLeases.delete(context)) {
      this.lastLocalActivityAt = Date.now();
    }
    // Persist this context's cookies (e.g. a cleared bot challenge) into the
    // crawl's shared jar BEFORE the context is torn down.
    const proxySession = this.proxySessions.get(context);
    if (proxySession) {
      proxySession.cookies = await context
        .cookies()
        .catch(() => proxySession.cookies);
    }
    let timer: NodeJS.Timeout | undefined;
    const closed = await Promise.race([
      context
        .close()
        .catch(() => undefined)
        .then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
    clearTimeout(timer);
    if (!closed) {
      this.logger.warn(
        `Browser context did not close within ${timeoutMs}ms; it is discarded on the next Chromium recycle`,
      );
    }
    this.pageReleasers.get(context)?.();
    // A managed-browser context owns its own dedicated remote connection (see
    // openManagedBrowser) rather than the shared local one -- close that
    // connection too by default, or the Bright Data session stays open until
    // it times out on their end instead of ending cleanly here. Pooled
    // callers reusing one Browser across many pages (see
    // DetailEnrichmentService's worker lanes) pass closeBrowser: false and
    // close the browser themselves only when rotating/finishing the lane.
    const closeBrowser = options?.closeBrowser ?? true;
    if (closeBrowser && browser && browser !== this.browser) {
      await browser.close().catch(() => undefined);
    }
  }

  private withBrowserLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.browserLock.then(fn, fn);
    this.browserLock = run.catch(() => undefined);
    return run;
  }

  private get hasLocalUsers(): boolean {
    return this.localLeases.size > 0 || this.pendingLocal > 0;
  }

  // Returns the shared local browser, (re)launching it if needed, and counts
  // the caller as pending until it leases its context (newStealthPage
  // decrements). Counting happens inside the lock so housekeeping can never
  // close the browser between this returning and the context being created.
  private async acquireLocalBrowser(): Promise<Browser> {
    return this.withBrowserLock(async () => {
      if (this.browser && !this.browser.isConnected()) {
        this.logger.warn('Chromium disconnected — relaunching');
        await this.closeLocalBrowser();
      } else if (this.browser && !this.hasLocalUsers) {
        // Recycle only when no caller holds a context -- closing the shared
        // browser under a running job would kill that job's page too. A
        // long-lived process otherwise accumulates memory across hundreds of
        // context cycles (one per crawl page plus one per detail-page
        // enrichment item -- easily 500+ per run).
        const { chromium_max_contexts_before_restart } =
          await this.platformConfigService.getCrawlerConfig();
        if (this.contextsSinceLaunch >= chromium_max_contexts_before_restart) {
          this.logger.log(
            `Recycling Chromium after ${this.contextsSinceLaunch} contexts`,
          );
          await this.closeLocalBrowser();
        }
      }

      if (!this.browser) await this.launchLocalBrowser();
      this.pendingLocal++;
      return this.browser!;
    });
  }

  private async launchLocalBrowser(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: [...STEALTH_LAUNCH_ARGS],
    });
    this.contextsSinceLaunch = 0;
    this.lastLocalActivityAt = Date.now();
    this.logger.log('Chromium launched for crawl worker');
  }

  // Closing the browser also kills any context whose own close() hung.
  private async closeLocalBrowser(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    if (!browser) return;
    const orphaned = browser.contexts().length;
    if (orphaned > 0) {
      this.logger.warn(
        `Discarding ${orphaned} unreleased browser context(s) with Chromium`,
      );
    }
    await browser.close().catch(() => undefined);
  }

  private async runHousekeeping(): Promise<void> {
    const now = Date.now();

    for (const [context, openedAt] of this.localLeases) {
      if (now - openedAt < LOCAL_CONTEXT_MAX_AGE_MS) continue;
      this.logger.error(
        `Force-closing a browser context leased ${Math.round((now - openedAt) / 60_000)} min ago (never closed by its caller)`,
      );
      await this.closeContext(context).catch(() => undefined);
    }

    await this.withBrowserLock(async () => {
      if (
        !this.browser ||
        this.hasLocalUsers ||
        this.contextsSinceLaunch === 0 ||
        Date.now() - this.lastLocalActivityAt < LOCAL_BROWSER_IDLE_RECYCLE_MS
      ) {
        return;
      }
      this.logger.log(
        `Recycling idle Chromium after ${this.contextsSinceLaunch} contexts`,
      );
      await this.closeLocalBrowser();
      // Relaunched lazily by the next acquireLocalBrowser().
    });
  }

  // Launches a dedicated local Chromium whose traffic all goes through the
  // session's Webshare proxy. Dedicated (not the shared browser) so the proxy
  // never leaks onto other crawls; the caller owns it and closes it -- via
  // closeContext's default (`browser !== this.browser`) or, for a pooled lane,
  // browser.close().
  async openProxyBrowser(session: ProxyBrowserSession): Promise<Browser> {
    const browser = await chromium.launch({
      headless: true,
      // HTTP/2 is disabled for proxied traffic only. Chromium keeps negotiating
      // h2 with the origin through the proxy's CONNECT tunnel, and a real
      // target (hellashomes.gr) reproducibly killed every navigation with
      // ERR_HTTP2_PROTOCOL_ERROR that way while the very same request over
      // HTTP/1.1 returned the full page -- through more than 20 different
      // residential exits, so it is the protocol, not the exit. Costs a little
      // request parallelism on one crawl; h2 stays on for direct crawls.
      args: [...STEALTH_LAUNCH_ARGS, '--disable-http2'],
      proxy: session.proxy,
    });
    this.logger.log('Launched Chromium through Webshare proxy');
    return browser;
  }

  // Counts what actually crossed the proxy for the cost log / budget cap.
  private trackProxyTraffic(
    context: BrowserContext,
    session: ProxyBrowserSession,
  ): void {
    context.on('requestfinished', (request) => {
      void request
        .sizes()
        .then((sizes) => {
          session.bytes +=
            sizes.requestHeadersSize +
            sizes.requestBodySize +
            sizes.responseHeadersSize +
            sizes.responseBodySize;
          session.requests += 1;
        })
        .catch(() => undefined);
    });
  }

  // Opens a fresh Bright Data Browser API connection. Per their FAQ, one
  // session supports "unlimited navigations within the same domain" -- so
  // this is meant to be opened ONCE and reused across every page of one
  // crawl run / one worker lane (see MANAGED_SESSION_MAX_AGE_MS for the
  // rotation ceiling), never cached app-wide across unrelated crawls (that
  // caused every idle gap anywhere to kill the shared session -- confirmed
  // via Bright Data's own /browser_sessions log showing network_inactivity_
  // timeout deaths) and never reconnected per-page (that caused a storm of
  // connectOverCDP calls that started timing out under load -- confirmed via
  // a run where every retry after the first failed on `client_timeout`-shaped
  // "Timeout 30000ms exceeded" connect errors).
  async openManagedBrowser(): Promise<Browser> {
    const endpoint = this.configService.get<string>('BRIGHT_DATA_CDP_ENDPOINT');
    if (!endpoint) {
      throw new Error(
        'BRIGHT_DATA_CDP_ENDPOINT is not set but a scraper requested the managed browser (use_managed_browser=true)',
      );
    }

    // Playwright echoes the endpoint (with its credentials) in the error, and this
    // error is persisted to crawl_runs/job_logs/notifications -- redact at the source.
    const browser = await chromium
      .connectOverCDP(endpoint)
      .catch((error: unknown) => {
        throw redactError(error);
      });
    this.logger.log('Connected to managed (Bright Data) browser');
    return browser;
  }
}
