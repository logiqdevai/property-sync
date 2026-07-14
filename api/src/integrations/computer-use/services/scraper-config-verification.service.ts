import { Injectable } from '@nestjs/common';
import { BrowserContext, Page } from 'playwright';
import { VERIFY_TIMEOUT_MS } from '../constants/generation.constants';

interface FieldDef {
  selector?: string;
  type?: 'text' | 'href' | 'src' | 'background_image';
}

interface DetailPageDef {
  image_selector?: string;
  image_type?: 'src' | 'background_image';
  description_selector?: string;
  external_id_source?: 'url_path' | 'selector';
  external_id_selector?: string;
}

interface ScraperDraftConfig {
  start_url: string;
  listing_selector: string;
  fields?: Record<string, string | FieldDef>;
  detail_page?: DetailPageDef;
}

@Injectable()
export class ScraperConfigVerificationService {
  async verify(
    context: BrowserContext,
    page: Page,
    config: ScraperDraftConfig,
  ): Promise<string[]> {
    const errors: string[] = [];

    if (page.url() !== config.start_url) {
      try {
        await page.goto(config.start_url, {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });
        await page.waitForTimeout(1500);
      } catch (e) {
        errors.push(
          `Could not navigate to start_url "${config.start_url}": ${(e as Error).message.slice(0, 80)}`,
        );
        return errors;
      }
    }

    let cardCount = 0;
    try {
      cardCount = await page.locator(config.listing_selector).count();
    } catch (e) {
      errors.push(
        `listing_selector "${config.listing_selector}" is invalid CSS: ${(e as Error).message.slice(0, 120)}`,
      );
      return errors;
    }

    if (cardCount === 0) {
      const candidates = await page.evaluate(() => {
        const counts: Record<string, number> = {};
        document.querySelectorAll('*').forEach((el) => {
          const cls =
            typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
          if (!cls) return;
          const key = `.${cls}`;
          counts[key] = (counts[key] ?? 0) + 1;
        });
        return Object.entries(counts)
          .filter(([, c]) => c >= 3 && c <= 80)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([sel, count]) => `${count}x ${sel}`)
          .join(', ');
      });
      errors.push(
        `listing_selector "${config.listing_selector}" matched 0 elements. ` +
          `Repeated class names on this page (candidates): ${candidates}`,
      );
      return errors;
    }

    const firstCard = page.locator(config.listing_selector).first();

    for (const [field, rawDef] of Object.entries(config.fields ?? {})) {
      const def: FieldDef = typeof rawDef === 'string' ? { selector: rawDef } : rawDef;
      const selector = def?.selector;
      const type = def?.type ?? 'text';

      if (!selector) {
        errors.push(`field "${field}" has no selector`);
        continue;
      }

      try {
        const el = firstCard.locator(selector).first();
        let value: string | null = null;

        if (type === 'href') {
          value = await el.getAttribute('href', { timeout: VERIFY_TIMEOUT_MS });
        } else if (type === 'src') {
          value = await el.getAttribute('src', { timeout: VERIFY_TIMEOUT_MS });
        } else if (type === 'background_image') {
          const style = (await el.getAttribute('style', { timeout: VERIFY_TIMEOUT_MS })) ?? '';
          const m = style.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
          value = m ? m[1] : null;
        } else {
          value = await el.textContent({ timeout: VERIFY_TIMEOUT_MS });
        }

        if (!value || !String(value).trim()) {
          const cardText = await firstCard
            .textContent({ timeout: VERIFY_TIMEOUT_MS })
            .catch(() => '');
          const hint = (cardText ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
          errors.push(
            `field "${field}": selector "${selector}" (type: ${type}) returned empty. Card text: "${hint}"`,
          );
        }
      } catch (e) {
        errors.push(
          `field "${field}": selector "${selector}" not found in first card — ${(e as Error).message.slice(0, 120)}`,
        );
      }
    }

    const dp = config.detail_page;
    const urlDef = config.fields?.url;

    if (dp && urlDef) {
      const urlSel = typeof urlDef === 'string' ? urlDef : urlDef?.selector;
      let detailUrl: string | null = null;

      try {
        detailUrl = await firstCard
          .locator(urlSel as string)
          .first()
          .getAttribute('href', { timeout: VERIFY_TIMEOUT_MS });
        if (detailUrl && !detailUrl.startsWith('http')) {
          detailUrl = new URL(detailUrl, page.url()).href;
        }
      } catch (e) {
        errors.push(`Cannot get detail URL for verification: ${(e as Error).message.slice(0, 80)}`);
      }

      if (detailUrl) {
        const detailPage = await context.newPage();
        try {
          await detailPage.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await detailPage.waitForTimeout(1500);

          if (dp.image_selector) {
            try {
              const imgEl = detailPage.locator(dp.image_selector).first();
              let imgVal: string | null = null;
              if ((dp.image_type ?? 'src') === 'background_image') {
                const style =
                  (await imgEl.getAttribute('style', { timeout: VERIFY_TIMEOUT_MS })) ?? '';
                const m = style.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
                imgVal = m ? m[1] : null;
              } else {
                imgVal = await imgEl.getAttribute('src', { timeout: VERIFY_TIMEOUT_MS });
              }
              if (!imgVal) {
                errors.push(
                  `detail_page.image_selector "${dp.image_selector}" matched an element but returned no image value`,
                );
              }
            } catch (e) {
              const candidates = await detailPage.evaluate(() => {
                const imgs = [...document.querySelectorAll('img')]
                  .slice(0, 5)
                  .map((i) => i.className || i.id || i.src?.split('/').pop())
                  .join(', ');
                return imgs || 'none found';
              });
              errors.push(
                `detail_page.image_selector "${dp.image_selector}" not found. Sample <img> elements: ${candidates}`,
              );
            }
          }

          if (dp.description_selector) {
            try {
              const text = await detailPage
                .locator(dp.description_selector)
                .first()
                .textContent({ timeout: VERIFY_TIMEOUT_MS });
              if (!text?.trim()) {
                errors.push(
                  `detail_page.description_selector "${dp.description_selector}" matched but returned empty text`,
                );
              }
            } catch (e) {
              errors.push(
                `detail_page.description_selector "${dp.description_selector}" not found on detail page — ${(e as Error).message.slice(0, 80)}`,
              );
            }
          }

          if (dp.external_id_source === 'selector' && dp.external_id_selector) {
            try {
              const text = await detailPage
                .locator(dp.external_id_selector)
                .first()
                .textContent({ timeout: VERIFY_TIMEOUT_MS });
              if (!text?.trim()) {
                errors.push(
                  `detail_page.external_id_selector "${dp.external_id_selector}" returned empty text`,
                );
              }
            } catch (e) {
              errors.push(
                `detail_page.external_id_selector "${dp.external_id_selector}" not found — ${(e as Error).message.slice(0, 80)}`,
              );
            }
          }
        } finally {
          await detailPage.close();
        }
      }
    }

    return errors;
  }
}
