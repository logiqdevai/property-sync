import { Injectable } from '@nestjs/common';
import { Locator } from 'playwright';
import { FieldDef } from '../interfaces/scraper-config.interface';

const FIELD_TIMEOUT = 2000;

@Injectable()
export class FieldExtractionService {
  normalizeFieldDef(def: string | FieldDef): FieldDef {
    if (typeof def === 'string') {
      return { selector: def, type: 'text' };
    }
    return {
      selector: def.selector ?? String(def),
      type: def.type ?? 'text',
    };
  }

  async extractField(
    element: Locator,
    def: string | FieldDef,
  ): Promise<string | null> {
    const { selector, type } = this.normalizeFieldDef(def);

    try {
      const el = selector ? element.locator(selector).first() : element;

      if (type === 'href') {
        return (
          (await el.getAttribute('href', { timeout: FIELD_TIMEOUT })) ?? null
        );
      }
      if (type === 'src') {
        const src =
          (await el.getAttribute('src', { timeout: FIELD_TIMEOUT })) ?? null;
        // Lazy-loaded images keep a tiny base64 placeholder in `src` and stash
        // the real URL in a data-* attribute until scrolled into view.
        if (src && src.toLowerCase().startsWith('data:')) {
          const lazySrc =
            (await el
              .getAttribute('data-src', { timeout: FIELD_TIMEOUT })
              .catch(() => null)) ??
            (await el
              .getAttribute('data-lazy-src', { timeout: FIELD_TIMEOUT })
              .catch(() => null)) ??
            (await el
              .getAttribute('data-original', { timeout: FIELD_TIMEOUT })
              .catch(() => null));
          return lazySrc ?? null;
        }
        return src;
      }
      if (type === 'background_image') {
        const style =
          (await el.getAttribute('style', { timeout: FIELD_TIMEOUT })) ?? '';
        const match = style.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
        return match ? match[1] : null;
      }

      await el.waitFor({ state: 'attached', timeout: FIELD_TIMEOUT });
      return (
        (await el.evaluate((node) => {
          const isStruck =
            node instanceof HTMLElement &&
            (node.tagName === 'DEL' ||
              node.tagName === 'S' ||
              node.tagName === 'STRIKE' ||
              window
                .getComputedStyle(node)
                .textDecorationLine.includes('line-through'));
          if (isStruck && node.parentElement) {
            const parentText = node.parentElement.textContent
              ?.replace(/\s+/g, ' ')
              .trim();
            if (parentText) return parentText;
          }
          return node.textContent?.replace(/\s+/g, ' ').trim() || null;
        })) ?? null
      );
    } catch {
      return null;
    }
  }
}
