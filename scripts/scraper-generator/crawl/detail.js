import { PAGE_TIMEOUT_MS, DETAIL_CONCURRENCY, DETAIL_DELAY_MS } from './config.js';
import { launchBrowser, newStealthPage, waitForBotChallengeClearance } from './browser.js';

async function enrichOneDetailPage(browser, item, detailConfig, blockHandlingConfig) {
  const page = await newStealthPage(browser);
  try {
    await page.goto(item.source_url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    await waitForBotChallengeClearance(page, blockHandlingConfig, Math.min(15_000, PAGE_TIMEOUT_MS));

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

      const preserveDescriptionText = (value) => {
        if (!value) return null;
        const cleaned = value
          .replace(/\r\n?/g, '\n')
          .replace(/[^\S\n]+/g, ' ')
          .replace(/ *\n */g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        return cleaned || null;
      };

      let descText = null;
      if (cfg && cfg.description_selector) {
        const el = document.querySelector(cfg.description_selector);
        descText = el ? preserveDescriptionText(el.innerText) : null;
      } else {
        const patterns = [
          '.description', '[class*="description"]', '.property-description',
          '[class*="detail-info"]', '.property-details', '[class*="property-text"]',
        ];
        for (const sel of patterns) {
          const el = document.querySelector(sel);
          if (el) { descText = preserveDescriptionText(el.innerText); break; }
        }
      }

      let externalId = null;
      if (cfg && cfg.external_id_source === 'selector' && cfg.external_id_selector) {
        const el = document.querySelector(cfg.external_id_selector);
        externalId = el ? el.textContent.trim() : null;
      }

      let latitude = null;
      let longitude = null;
      const MAX_SCRIPT_CHARS = 50_000;
      const parseCoord = (value) => {
        const n = parseFloat(value);
        return Number.isFinite(n) ? n : null;
      };
      const isValidCoords = (lat, lng) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
      const roundCoord = (n) => Math.round(n * 1e7) / 1e7;
      const acceptCoords = (lat, lng) => {
        if (lat == null || lng == null || !isValidCoords(lat, lng)) return false;
        latitude = roundCoord(lat);
        longitude = roundCoord(lng);
        return true;
      };

      for (const script of Array.from(document.querySelectorAll('script'))) {
        if (script.src) continue;
        const text = script.textContent || '';
        if (!text || text.length > MAX_SCRIPT_CHARS) continue;
        if (!/lat|long|lng|setView|LatLng/i.test(text)) continue;

        const realStatusLat = text.match(/\bvar\s+lat\s*=\s*(-?\d+(?:\.\d+)?)/i);
        const realStatusLng = text.match(/\bvar\s+long\s*=\s*(-?\d+(?:\.\d+)?)/i);
        if (
          acceptCoords(
            realStatusLat ? parseCoord(realStatusLat[1]) : null,
            realStatusLng ? parseCoord(realStatusLng[1]) : null,
          )
        ) {
          break;
        }

        const latMatch = text.match(
          /\b(?:let|const)\s+lat(?:itude)?\s*=\s*(-?\d+(?:\.\d+)?)/i,
        );
        const lngMatch =
          text.match(
            /\b(?:let|const)\s+long(?:itude)?\s*=\s*(-?\d+(?:\.\d+)?)/i,
          ) ||
          text.match(/\b(?:var|let|const)\s+lng\s*=\s*(-?\d+(?:\.\d+)?)/i);
        if (
          acceptCoords(
            latMatch ? parseCoord(latMatch[1]) : null,
            lngMatch ? parseCoord(lngMatch[1]) : null,
          )
        ) {
          break;
        }

        const setViewMatch = text.match(
          /\.setView\(\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/,
        );
        if (
          setViewMatch &&
          acceptCoords(parseCoord(setViewMatch[1]), parseCoord(setViewMatch[2]))
        ) {
          break;
        }

        const latLngMatch = text.match(
          /(?:LatLng|latLng)\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/,
        );
        if (
          latLngMatch &&
          acceptCoords(parseCoord(latLngMatch[1]), parseCoord(latLngMatch[2]))
        ) {
          break;
        }
      }

      return {
        images: [...new Set(images)],
        raw_detail_text: descText,
        external_id: externalId,
        latitude,
        longitude,
      };
    }, detailConfig ?? null);
  } catch (err) {
    return { images: [], raw_detail_text: null, external_id: null, latitude: null, longitude: null, error: err.message };
  } finally {
    await page.close();
  }
}

export async function enrichDetailPages(items, detailConfig, blockHandlingConfig) {
  console.log(`  Enriching ${items.length} detail pages (concurrency: ${DETAIL_CONCURRENCY})...`);
  const browser = await launchBrowser();

  try {
    let done = 0;
    for (let i = 0; i < items.length; i += DETAIL_CONCURRENCY) {
      const batch = items.slice(i, i + DETAIL_CONCURRENCY);
      const results = await Promise.all(batch.map(item => enrichOneDetailPage(browser, item, detailConfig, blockHandlingConfig)));

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const detail = results[j];
        const listingImages = item.raw._all_images ?? [];
        const allImages = [...new Set([...detail.images, ...listingImages])];
        item.raw._all_images = allImages;
        item.raw._detail_text = detail.raw_detail_text;
        if (detail.external_id) item.raw._external_id = detail.external_id;
        if (detail.latitude != null && detail.longitude != null) {
          item.raw.latitude = detail.latitude;
          item.raw.longitude = detail.longitude;
          item.raw._lat_lng = `${detail.latitude},${detail.longitude}`;
        }
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
