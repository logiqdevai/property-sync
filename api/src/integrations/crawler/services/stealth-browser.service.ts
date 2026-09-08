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

@Injectable()
export class StealthBrowserService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StealthBrowserService.name);
  private browser: Browser | null = null;
  private contextsSinceLaunch = 0;

  constructor(
    private readonly platformConfigService: PlatformConfigService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureBrowser();
  }

  async onModuleDestroy(): Promise<void> {
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
    const browser = options?.useManagedBrowser
      ? await this.openManagedBrowser()
      : await this.ensureBrowser();

    if (!options?.useManagedBrowser) this.contextsSinceLaunch++;

    return this.newStealthPageOnBrowser(browser, contextOptions, options);
  }

  // Builds a context+page on an ALREADY-CONNECTED browser (local or managed).
  // Does not touch connection lifecycle -- the caller owns connecting and
  // eventually closing `browser` (via closeContext for a one-off page, or
  // directly for a reused/pooled connection).
  async newStealthPageOnBrowser(
    browser: Browser,
    contextOptions?: Partial<BrowserContextOptions>,
    options?: Pick<NewStealthPageOptions, 'useManagedBrowser' | 'blockImages'>,
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
    const context = options?.useManagedBrowser
      ? await browser.newContext(contextOptions)
      : await browser.newContext({
          ...STEALTH_CONTEXT_OPTIONS,
          ...contextOptions,
        });
    if (!options?.useManagedBrowser) {
      await applyStealthInitScript(context);
    }
    const page = await context.newPage();
    trackDocumentResponses(page);

    if (options?.blockImages) {
      await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (type === 'image' || type === 'media' || type === 'font') {
          return route.abort();
        }
        return route.continue();
      });
    }

    return { context, page };
  }

  async closeContext(
    context: BrowserContext,
    timeoutMs = 10_000,
    options?: { closeBrowser?: boolean },
  ): Promise<void> {
    const browser = context.browser();
    await Promise.race([
      context.close().catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
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

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      // Recycle only when fully idle -- closing the shared browser while another
      // concurrent job still holds a context open would kill that job's page too.
      // A long-lived process otherwise accumulates memory across hundreds of
      // context cycles (one per crawl page plus one per detail-page enrichment
      // item -- easily 500+ per run) with no natural restart point.
      const { chromium_max_contexts_before_restart } =
        await this.platformConfigService.getCrawlerConfig();
      const dueForRestart =
        this.contextsSinceLaunch >= chromium_max_contexts_before_restart &&
        this.browser.contexts().length === 0;

      if (!dueForRestart) {
        return this.browser;
      }

      this.logger.log(
        `Recycling Chromium after ${this.contextsSinceLaunch} contexts`,
      );
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    } else if (this.browser) {
      this.logger.warn('Chromium disconnected — relaunching');
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }

    this.browser = await chromium.launch({
      headless: true,
      args: [...STEALTH_LAUNCH_ARGS],
    });
    this.contextsSinceLaunch = 0;

    this.logger.log('Chromium launched for crawl worker');
    return this.browser;
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

    const browser = await chromium.connectOverCDP(endpoint);
    this.logger.log('Connected to managed (Bright Data) browser');
    return browser;
  }
}
