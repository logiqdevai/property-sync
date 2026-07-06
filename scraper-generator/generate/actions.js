export async function executeAction(context, page, action) {
  switch (action.action) {
    case 'click': {
      const newPagePromise = context.waitForEvent('page', { timeout: 3000 }).catch(() => null);
      await page.locator(action.selector).first().click({ timeout: 8000 });
      const newPage = await newPagePromise;
      if (newPage) {
        await newPage.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        await newPage.waitForTimeout(1000);
        await newPage.bringToFront();
        return newPage;
      }
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      return page;
    }
    case 'go_back':
      await page.goBack({ timeout: 15000, waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(1500);
      return page;
    case 'close_tab': {
      const pages = context.pages();
      if (pages.length <= 1) return page;
      const idx = pages.indexOf(page);
      await page.close();
      const prev = pages[idx > 0 ? idx - 1 : 0] ?? pages[0];
      await prev.bringToFront();
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
      await page.locator(action.selector).first().fill(action.text, { timeout: 5000 });
      return page;
    case 'navigate':
      await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      return page;
    case 'wait':
      await page.waitForTimeout(3000);
      return page;
    default:
      throw new Error(`Unknown action: ${action.action}`);
  }
}
