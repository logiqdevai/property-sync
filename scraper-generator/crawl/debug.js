import fs from 'fs';
import path from 'path';
import { OUTPUT_DIR } from './config.js';

export async function dumpDebugInfo(page, selector) {
  const debugDir = path.join(OUTPUT_DIR, 'debug');
  fs.mkdirSync(debugDir, { recursive: true });

  await page.screenshot({ path: path.join(debugDir, 'page.png'), fullPage: true });

  const outline = await page.evaluate(() => {
    function describeEl(el, depth) {
      if (depth > 4) return '';
      const tag = el.tagName.toLowerCase();
      const cls = el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
      const id = el.id ? `#${el.id}` : '';
      const children = Array.from(el.children).map(c => describeEl(c, depth + 1)).filter(Boolean);
      return `${'  '.repeat(depth)}<${tag}${id}${cls}>${children.length ? '\n' + children.join('\n') + '\n' + '  '.repeat(depth) : ''}</${tag}>`;
    }
    return describeEl(document.body, 0).slice(0, 20000);
  });
  fs.writeFileSync(path.join(debugDir, 'outline.txt'), outline);

  const candidates = await page.evaluate(() => {
    const counts = {};
    document.querySelectorAll('*').forEach(el => {
      const cls = el.className && typeof el.className === 'string'
        ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      if (!cls) return;
      const key = `.${cls}`;
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return Object.entries(counts)
      .filter(([, c]) => c >= 3 && c <= 100)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([sel, count]) => ({ selector: sel, count }));
  });

  const report = { url: page.url(), failed_selector: selector, candidate_selectors: candidates };
  fs.writeFileSync(path.join(debugDir, 'selector_candidates.json'), JSON.stringify(report, null, 2));

  console.log('\n  [DEBUG] Selector failed → output/crawl/debug/');
  candidates.slice(0, 10).forEach(c => console.log(`    ${String(c.count).padStart(3)}x  ${c.selector}`));
}
