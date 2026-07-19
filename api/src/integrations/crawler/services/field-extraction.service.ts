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
        return (
          (await el.getAttribute('src', { timeout: FIELD_TIMEOUT })) ?? null
        );
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
