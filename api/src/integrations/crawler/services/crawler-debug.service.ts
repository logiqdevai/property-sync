import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';

@Injectable()
export class CrawlerDebugService {
  private readonly logger = new Logger(CrawlerDebugService.name);

  async dumpDebugInfo(page: Page, selector: string): Promise<void> {
    const candidates = await page.evaluate(() => {
      const counts: Record<string, number> = {};
      document.querySelectorAll('*').forEach((el) => {
        const cls =
          el.className && typeof el.className === 'string'
            ? el.className.trim().split(/\s+/).slice(0, 2).join('.')
            : '';
        if (!cls) return;
        const key = `.${cls}`;
        counts[key] = (counts[key] ?? 0) + 1;
      });
      return Object.entries(counts)
        .filter(([, count]) => count >= 3 && count <= 100)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([sel, count]) => ({ selector: sel, count }));
    });

    this.logger.warn(
      `listing selector "${selector}" failed on ${page.url()} — top candidates: ${JSON.stringify(candidates)}`,
    );
  }
}
