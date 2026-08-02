import { Injectable } from '@nestjs/common';
import { BrowserContext, Page } from 'playwright';
import {
  classifyPageAccess,
  waitForBotChallengeClearance,
} from '@/integrations/crawler/block-handling/block-handling.utils';
import { BlockHandlingConfig } from '@/integrations/crawler/block-handling/block-handling.interface';
import {
  ACCESS_BARRIER_VERIFY_PREFIX,
  VERIFY_TIMEOUT_MS,
} from '../constants/generation.constants';

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

interface PaginationDef {
  type?: string;
  selector?: string;
  url_param?: string;
}

interface ScraperDraftConfig {
  start_url: string;
  listing_selector: string;
  fields?: Record<string, string | FieldDef>;
  pagination?: PaginationDef;
  detail_page?: DetailPageDef;
}

@Injectable()
export class ScraperConfigVerificationService {
  async verify(
    context: BrowserContext,
    page: Page,
    config: ScraperDraftConfig,
    blockHandlingConfig?: BlockHandlingConfig,
  ): Promise<string[]> {
    const errors: string[] = [];

    const barrierBefore = await this.accessBarrierError(
      page,
      blockHandlingConfig,
    );
    if (barrierBefore) {
      return [barrierBefore];
    }

    if (page.url() !== config.start_url) {
      try {
        await page.goto(config.start_url, {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });
        await waitForBotChallengeClearance(page, blockHandlingConfig, 20000);
      } catch (e) {
        errors.push(
          `Could not navigate to start_url "${config.start_url}": ${(e as Error).message.slice(0, 80)}`,
        );
        return errors;
      }
    }

    const barrierAfterNav = await this.accessBarrierError(
      page,
      blockHandlingConfig,
    );
    if (barrierAfterNav) {
      return [barrierAfterNav];
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
            typeof el.className === 'string'
              ? el.className.trim().split(/\s+/)[0]
              : '';
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
      const def: FieldDef =
        typeof rawDef === 'string' ? { selector: rawDef } : rawDef;
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
          const style =
            (await el.getAttribute('style', { timeout: VERIFY_TIMEOUT_MS })) ??
            '';
          const m = style.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
          value = m ? m[1] : null;
        } else {
          value = await el.textContent({ timeout: VERIFY_TIMEOUT_MS });
        }

        if (!value || !String(value).trim()) {
          const cardText = await firstCard
            .textContent({ timeout: VERIFY_TIMEOUT_MS })
            .catch(() => '');
          const hint = (cardText ?? '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 200);
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

    const pagination = config.pagination;
    if (
      pagination &&
      (pagination.type === 'next_button' || pagination.type === 'NEXT_BUTTON')
    ) {
      const sel = pagination.selector;
      if (!sel) {
        errors.push(
          `pagination.type is "next_button" but pagination.selector is missing`,
        );
      } else {
        try {
          const beforeFirstHref = await firstCard
            .locator('a')
            .first()
            .getAttribute('href')
            .catch(() => null);

          const nextControl = page.locator(sel).first();
          const existsBefore = await nextControl.count().catch(() => 0);

          if (!existsBefore) {
            errors.push(
              `pagination.selector "${sel}" matched 0 elements on the listings page`,
            );
          } else {
            await nextControl.click({ timeout: 8000 });
            await page
              .waitForLoadState('domcontentloaded', { timeout: 20000 })
              .catch(() => undefined);
            await page.waitForTimeout(1500);

            const afterFirstHref = await page
              .locator(config.listing_selector)
              .first()
              .locator('a')
              .first()
              .getAttribute('href')
              .catch(() => null);

            if (afterFirstHref && afterFirstHref === beforeFirstHref) {
              errors.push(
                `pagination.selector "${sel}" was clicked but the listings did not change — it is not a working "next page" control`,
              );
            } else {
              // The runtime crawler re-uses this exact selector to click through every
              // remaining page, so it must still resolve after advancing once — this
              // catches selectors tied to one specific page number (e.g. :has-text('2'))
              // instead of a persistent "next" control.
              const existsAfter = await page
                .locator(sel)
                .first()
                .count()
                .catch(() => 0);
              if (!existsAfter) {
                errors.push(
                  `pagination.selector "${sel}" advanced to the next page but no longer matches anything there — it must be a persistent "next" control reusable on every page, not a link tied to one specific page number`,
                );
              }
            }
          }
        } catch (e) {
          errors.push(
            `pagination.selector "${sel}" could not be clicked — ${(e as Error).message.slice(0, 120)}`,
          );
        }
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
        errors.push(
          `Cannot get detail URL for verification: ${(e as Error).message.slice(0, 80)}`,
        );
      }

      if (detailUrl) {
        const detailPage = await context.newPage();
        try {
          await detailPage.goto(detailUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 20000,
          });
          await detailPage.waitForTimeout(1500);

          if (dp.image_selector) {
            try {
              const imgEl = detailPage.locator(dp.image_selector).first();
              let imgVal: string | null = null;
              if ((dp.image_type ?? 'src') === 'background_image') {
                const style =
                  (await imgEl.getAttribute('style', {
                    timeout: VERIFY_TIMEOUT_MS,
                  })) ?? '';
                const m = style.match(
                  /background-image:\s*url\(['"]?(.*?)['"]?\)/,
                );
                imgVal = m ? m[1] : null;
              } else {
                imgVal = await imgEl.getAttribute('src', {
                  timeout: VERIFY_TIMEOUT_MS,
                });
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

  private async accessBarrierError(
    page: Page,
    blockHandlingConfig?: BlockHandlingConfig,
  ): Promise<string | null> {
    const state = await classifyPageAccess(page, blockHandlingConfig);
    if (state !== 'blocked' && state !== 'challenge') {
      return null;
    }
    return (
      `${ACCESS_BARRIER_VERIFY_PREFIX}page is ${state} at ${page.url()}. ` +
      'Cannot verify listing selectors on a WAF/bot interstitial.'
    );
  }
}
