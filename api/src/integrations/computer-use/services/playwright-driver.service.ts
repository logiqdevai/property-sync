import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { GenerationAction } from '../interfaces/computer-use.interface';

/**
 * One instance = one generation run's browser session (launch -> steps -> close).
 * Instantiated directly with `new` per run by the orchestrator rather than injected as a
 * singleton, since it holds mutable per-session state (active page/tab) that concurrent
 * runs must not share.
 */
export class PlaywrightDriverService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async launch(url: string): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    this.page = await this.context.newPage();
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.page.waitForTimeout(2000);
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

  async screenshot(): Promise<Buffer> {
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
        await page.locator(action.selector as string).first().click({ timeout: 8000 });
        const newPage = await newPagePromise;
        if (newPage) {
          await newPage
            .waitForLoadState('domcontentloaded', { timeout: 15000 })
            .catch(() => {});
          await newPage.waitForTimeout(1000);
          await newPage.bringToFront();
          this.page = newPage;
          return newPage;
        }
        await page
          .waitForLoadState('domcontentloaded', { timeout: 15000 })
          .catch(() => {});
        await page.waitForTimeout(1500);
        return page;
      }
      case 'go_back':
        await page
          .goBack({ timeout: 15000, waitUntil: 'domcontentloaded' })
          .catch(() => {});
        await page.waitForTimeout(1500);
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
        await page.waitForTimeout(2000);
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
