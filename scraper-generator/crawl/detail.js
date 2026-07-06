import { PAGE_TIMEOUT_MS, DETAIL_CONCURRENCY, DETAIL_DELAY_MS } from './config.js';
import { launchBrowser, newStealthPage } from './browser.js';

async function enrichOneDetailPage(browser, item, detailConfig) {
  const page = await newStealthPage(browser);
  try {
    await page.goto(item.source_url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(1000);

    return await page.evaluate((cfg) => {
      const images = [];

      if (cfg && cfg.image_selector) {
        const type = cfg.image_type ?? 'src';
        document.querySelectorAll(cfg.image_selector).forEach(el => {
          if (type === 'background_image') {
            const m = (el.getAttribute('style') || '').match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
            if (m && m[1]) images.push(m[1]);
          } else {
            if (el.src) images.push(el.src);
          }
        });
      } else {
        document.querySelectorAll('[style]').forEach(el => {
          const m = (el.getAttribute('style') || '').match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
          if (m && m[1] && !m[1].endsWith('.svg')) images.push(m[1]);
        });
        document.querySelectorAll('img').forEach(el => {
          if (el.src && !el.src.endsWith('.svg') && !el.src.includes('logo') && !el.src.includes('icon')) {
            images.push(el.src);
          }
        });
      }

      let descText = null;
      if (cfg && cfg.description_selector) {
        const el = document.querySelector(cfg.description_selector);
        descText = el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
      } else {
        const patterns = [
          '.description', '[class*="description"]', '.property-description',
          '[class*="detail-info"]', '.property-details', '[class*="property-text"]',
        ];
        for (const sel of patterns) {
          const el = document.querySelector(sel);
          if (el) { descText = el.innerText.replace(/\s+/g, ' ').trim(); break; }
        }
      }

      let externalId = null;
      if (cfg && cfg.external_id_source === 'selector' && cfg.external_id_selector) {
        const el = document.querySelector(cfg.external_id_selector);
        externalId = el ? el.textContent.trim() : null;
      }

      return {
        images: [...new Set(images)],
        raw_detail_text: descText,
        external_id: externalId,
      };
    }, detailConfig ?? null);
  } catch (err) {
    return { images: [], raw_detail_text: null, external_id: null, error: err.message };
  } finally {
    await page.close();
  }
}

export async function enrichDetailPages(items, detailConfig) {
  console.log(`  Enriching ${items.length} detail pages (concurrency: ${DETAIL_CONCURRENCY})...`);
  const browser = await launchBrowser();

  try {
    let done = 0;
    for (let i = 0; i < items.length; i += DETAIL_CONCURRENCY) {
      const batch = items.slice(i, i + DETAIL_CONCURRENCY);
      const results = await Promise.all(batch.map(item => enrichOneDetailPage(browser, item, detailConfig)));

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const detail = results[j];
        const listingImages = item.raw._all_images ?? [];
        const allImages = [...new Set([...detail.images, ...listingImages])];
        item.raw._all_images = allImages;
        item.raw._detail_text = detail.raw_detail_text;
        if (detail.external_id) item.raw._external_id = detail.external_id;
        done++;
        process.stdout.write(`\r  ${done}/${items.length} detail pages enriched...`);
      }

      if (i + DETAIL_CONCURRENCY < items.length) {
        await new Promise(r => setTimeout(r, DETAIL_DELAY_MS));
      }
    }
    process.stdout.write('\n');
  } finally {
    await browser.close();
  }
}
