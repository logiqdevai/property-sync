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
      ...STEALTH_CONTEXT_OPTIONS,
      ...contextOptions,
    });
    await applyStealthInitScript(context);
    const page = await context.newPage();
    trackDocumentResponses(page);
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
}
