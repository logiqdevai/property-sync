import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  chromium,
  Page,
} from 'playwright';
import { PlatformConfigService } from '@/modules/platform-config/platform-config.service';

const STEALTH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface StealthPageSession {
  context: BrowserContext;
  page: Page;
}

@Injectable()
export class StealthBrowserService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StealthBrowserService.name);
  private browser: Browser | null = null;
  private contextsSinceLaunch = 0;

  constructor(private readonly platformConfigService: PlatformConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureBrowser();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  async newStealthPage(
    contextOptions?: Partial<BrowserContextOptions>,
  ): Promise<StealthPageSession> {
    const browser = await this.ensureBrowser();
    this.contextsSinceLaunch++;
    const context = await browser.newContext({
      userAgent: STEALTH_UA,
      viewport: { width: 1280, height: 900 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
      ...contextOptions,
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });
    const page = await context.newPage();
    return { context, page };
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
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        // Docker's default /dev/shm is 64MB regardless of host RAM/CPU -- content-heavy
        // listing pages can exhaust that, leaving Chromium's renderer unresponsive and
        // context/browser close() calls hanging with no timeout. This routes shared
        // memory through /tmp instead.
        '--disable-dev-shm-usage',
      ],
    });
    this.contextsSinceLaunch = 0;

    this.logger.log('Chromium launched for crawl worker');
    return this.browser;
  }
}
