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

@Injectable()
export class StealthBrowserService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StealthBrowserService.name);
  private browser: Browser | null = null;
  private contextsSinceLaunch = 0;
  private managedBrowser: Browser | null = null;

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
    if (this.managedBrowser) {
      await this.managedBrowser.close().catch(() => undefined);
      this.managedBrowser = null;
    }
  }

  async newStealthPage(
    contextOptions?: Partial<BrowserContextOptions>,
    options?: NewStealthPageOptions,
  ): Promise<StealthPageSession> {
    const browser = options?.useManagedBrowser
      ? await this.ensureManagedBrowser()
      : await this.ensureBrowser();

    if (!options?.useManagedBrowser) this.contextsSinceLaunch++;

    const context = await browser.newContext({
      ...STEALTH_CONTEXT_OPTIONS,
      ...contextOptions,
    });
    await applyStealthInitScript(context);
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
  ): Promise<void> {
    await Promise.race([
      context.close().catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
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

  // Bright Data's Scraping Browser is a remote CDP endpoint -- there's no local
  // process to launch, and no launch args to pass (their fleet manages its own
  // fingerprinting/proxying). One connection is reused across contexts the same
  // way the local browser is; a dropped connection reconnects lazily on next use.
  private async ensureManagedBrowser(): Promise<Browser> {
    if (this.managedBrowser?.isConnected()) {
      return this.managedBrowser;
    }
    if (this.managedBrowser) {
      await this.managedBrowser.close().catch(() => undefined);
      this.managedBrowser = null;
    }

    const endpoint = this.configService.get<string>(
      'BRIGHT_DATA_CDP_ENDPOINT',
    );
    if (!endpoint) {
      throw new Error(
        'BRIGHT_DATA_CDP_ENDPOINT is not set but a scraper requested the managed browser (use_managed_browser=true)',
      );
    }

    this.managedBrowser = await chromium.connectOverCDP(endpoint);
    this.logger.log('Connected to managed (Bright Data) browser');
    return this.managedBrowser;
  }
}
