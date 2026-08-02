import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { API_SCREENSHOT_JPEG_QUALITY } from '../constants/generation.constants';
import { GenerationAction } from '../interfaces/computer-use.interface';
import {
  STEALTH_CONTEXT_OPTIONS,
  STEALTH_LAUNCH_ARGS,
  applyStealthInitScript,
} from '@/integrations/crawler/utils/stealth.utils';
import {
  trackDocumentResponses,
  waitForBotChallengeClearance,
} from '@/integrations/crawler/block-handling/block-handling.utils';
import { BlockHandlingConfig } from '@/integrations/crawler/block-handling/block-handling.interface';

export class PlaywrightDriverService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private blockHandlingConfig: BlockHandlingConfig | undefined;

  async launch(
    url: string,
    blockHandlingConfig?: BlockHandlingConfig,
  ): Promise<void> {
    this.blockHandlingConfig = blockHandlingConfig;
    this.browser = await chromium.launch({
      headless: true,
      args: [...STEALTH_LAUNCH_ARGS],
    });
    this.context = await this.browser.newContext({
      ...STEALTH_CONTEXT_OPTIONS,
      viewport: { width: 1280, height: 800 },
    });
    await applyStealthInitScript(this.context);
    this.page = await this.context.newPage();
    trackDocumentResponses(this.page);
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await waitForBotChallengeClearance(this.page, this.blockHandlingConfig);
  }

  get currentPage(): Page {
    if (!this.page) {
      throw new Error('PlaywrightDriverService: not launched');
    }
    return this.page;
  }

  get activeContext(): BrowserContext {
    if (!this.context) {
      throw new Error('PlaywrightDriverService: not launched');
    }
    return this.context;
  }

  async screenshot(forApi = false): Promise<Buffer> {
    if (forApi) {
      return this.currentPage.screenshot({
        fullPage: false,
        type: 'jpeg',
        quality: API_SCREENSHOT_JPEG_QUALITY,
      });
    }

    return this.currentPage.screenshot({ fullPage: false });
  }

  async executeAction(action: GenerationAction): Promise<Page> {
    const context = this.activeContext;
    const page = this.currentPage;

    switch (action.action) {
      case 'click': {
        const newPagePromise = context
          .waitForEvent('page', { timeout: 3000 })
          .catch(() => null);
        await page
          .locator(action.selector as string)
          .first()
          .click({ timeout: 8000 });
        const newPage = await newPagePromise;
        if (newPage) {
          trackDocumentResponses(newPage);
          await newPage
            .waitForLoadState('domcontentloaded', { timeout: 15000 })
            .catch(() => {});
          await waitForBotChallengeClearance(
            newPage,
            this.blockHandlingConfig,
            15000,
          );
          await newPage.bringToFront();
          this.page = newPage;
          return newPage;
        }
        await page
          .waitForLoadState('domcontentloaded', { timeout: 15000 })
          .catch(() => {});
        await waitForBotChallengeClearance(
          page,
          this.blockHandlingConfig,
          15000,
        );
        return page;
      }
      case 'go_back':
        await page
          .goBack({ timeout: 15000, waitUntil: 'domcontentloaded' })
          .catch(() => {});
        await waitForBotChallengeClearance(
          page,
          this.blockHandlingConfig,
          15000,
        );
        return page;
      case 'close_tab': {
        const pages = context.pages();
        if (pages.length <= 1) return page;
        const idx = pages.indexOf(page);
        await page.close();
        const prev = pages[idx > 0 ? idx - 1 : 0] ?? pages[0];
        await prev.bringToFront();
        this.page = prev;
        return prev;
      }
      case 'scroll_down':
        await page.evaluate(() => window.scrollBy(0, 700));
        await page.waitForTimeout(700);
        return page;
      case 'scroll_up':
        await page.evaluate(() => window.scrollBy(0, -700));
        await page.waitForTimeout(700);
        return page;
      case 'type':
        await page
          .locator(action.selector as string)
          .first()
          .fill(action.text as string, { timeout: 5000 });
        return page;
      case 'navigate':
        await page.goto(action.url as string, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await waitForBotChallengeClearance(page, this.blockHandlingConfig);
        return page;
      case 'wait':
        await page.waitForTimeout(3000);
        return page;
      default:
        throw new Error(`Unknown action: ${action.action}`);
    }
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}
