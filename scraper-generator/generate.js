/**
 * Scraper Generator — Computer Use MVP
 *
 * Opens a browser, loops: screenshot → Claude vision → action → repeat.
 * Before accepting a "done" action, the proposed config is automatically
 * verified against the live page — if selectors fail, Claude is told what
 * broke and continues without any human intervention.
 *
 * Outputs:
 *   output/run.json          → ScraperGenerationRun
 *   output/steps/step_N.json → ComputerUseStep (one per action)
 *   output/version.json      → ScraperVersion (final config)
 */

import Anthropic from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// --- Config ---
const TARGET_URL = process.env.TARGET_URL;
if (!TARGET_URL) {
  console.error('ERROR: TARGET_URL is not set. Add it to your .env file.');
  process.exit(1);
}
const MAX_STEPS = 50;
const VERIFY_TIMEOUT_MS = 4000;
const SCREENSHOTS_DIR = path.join(__dirname, 'output', 'screenshots');
const STEPS_DIR = path.join(__dirname, 'output', 'steps');
const OUTPUT_DIR = path.join(__dirname, 'output');

function initOutputDir() {
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  [OUTPUT_DIR, SCREENSHOTS_DIR, STEPS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));
}

// --- Anthropic client ---
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- System prompt ---
const SYSTEM_PROMPT = `You are a web scraping config generator. You control a real browser to explore a real estate website and produce a complete Playwright scraper config.

## MANDATORY WORKFLOW — follow this exact sequence every time:

STEP 1 — Find listings page
  Navigate to the page that lists ALL properties (the main property search/listings page).

STEP 2 — Identify listing selectors
  Scroll down to see property cards fully rendered. Identify the repeating card container and field selectors. Count how many cards are visible to confirm the selector.

STEP 3 — Visit a detail page
  Click a property card link OR use navigate to its URL to open the property detail page.
  On the detail page: scroll down, identify the image gallery selector, the description text block, and any property ID element.
  Then use go_back (or close_tab if it opened in a new tab) to return to the listings page.

STEP 4 — Test pagination
  From the listings page, click the "next page" or "page 2" link. Verify that a different set of properties loads. Return to page 1 if needed.

STEP 5 — Call done with the complete config

## Actions available — return ONLY a JSON object, no prose:

{
  "reasoning": "what you see and why you are taking this action",
  "action": "click" | "scroll_down" | "scroll_up" | "type" | "navigate" | "go_back" | "close_tab" | "wait" | "done",
  "selector": "CSS selector",   // required for click / type
  "text": "string",             // required for type
  "url": "string",              // required for navigate
  "config": { ... }             // required for done
}

Tab behaviour:
- If a click opens a NEW tab the browser automatically switches to it — the next screenshot will show the new tab's page.
- "go_back"   — browser back button (use to return to the previous page in the same tab)
- "close_tab" — close current tab; control returns to the tab that was open before

## Config schema (for "done" only):

{
  "start_url": "full URL of the property listings page",
  "listing_selector": "CSS selector matching EACH property card container",
  "fields": {
    "title":        { "selector": "selector WITHIN a card", "type": "text" },
    "price":        { "selector": "selector WITHIN a card", "type": "text" },
    "location":     { "selector": "selector WITHIN a card", "type": "text" },
    "listing_type": { "selector": "selector WITHIN a card (sale/rent badge)", "type": "text" },
    "url":          { "selector": "selector WITHIN a card for the detail link", "type": "href" },
    "image":        { "selector": "selector WITHIN a card", "type": "src" | "background_image" }
  },
  "pagination": {
    "type": "next_button" | "infinite_scroll" | "load_more" | "url_param",
    "selector": "CSS selector for the Next/Load More button",
    "url_param": "query param name (only for url_param type)"
  },
  "detail_page": {
    "image_selector": "CSS selector matching gallery images on the detail page",
    "image_type": "src" | "background_image",
    "description_selector": "CSS selector for the main property description text block",
    "external_id_source": "url_path" | "selector",
    "external_id_selector": "CSS selector for the property ID element (only when external_id_source is 'selector')"
  }
}

Field types:
- "text"             — element's textContent
- "href"             — <a> href attribute
- "src"              — <img> src attribute
- "background_image" — URL from CSS background-image: url(...)

## Critical rules:
- SCROLL DOWN before choosing any selector — cards may not be visible at the top of the page
- Selectors are AUTOMATICALLY VERIFIED after "done" — if they fail you will be told exactly what broke and MUST fix them
- listing_selector must match ALL card containers on the page (the repeating outer wrapper)
- Fields must work WITHIN a single card, not at page level
- For detail_page: you MUST visit an actual detail page and inspect it — do not guess selectors
- external_id_source "url_path": pipeline extracts last URL path segment (e.g. /property/1165 → "1165")
- external_id_source "selector": pipeline reads the text of external_id_selector on the detail page
- You MUST test pagination (click page 2) before calling done`;

// --- Helpers ---
function uid() {
  return crypto.randomBytes(4).toString('hex');
}

function extractJSON(text) {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock) return JSON.parse(codeBlock[1]);
  const raw = text.match(/\{[\s\S]*\}/);
  if (raw) return JSON.parse(raw[0]);
  throw new Error('No JSON found in response');
}

async function takeScreenshot(page, step) {
  const file = path.join(SCREENSHOTS_DIR, `step_${String(step).padStart(3, '0')}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

// --- Tab-aware action executor ---
// Returns the page that should be used for all subsequent steps.
async function executeAction(context, page, action) {
  switch (action.action) {
    case 'click': {
      // Race: detect a new tab opening within 3 seconds of the click
      const newPagePromise = context.waitForEvent('page', { timeout: 3000 }).catch(() => null);
      await page.locator(action.selector).first().click({ timeout: 8000 });
      const newPage = await newPagePromise;
      if (newPage) {
        // A new tab opened — switch to it automatically
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
      if (pages.length <= 1) return page; // nothing to close
      const idx = pages.indexOf(page);
      await page.close();
      // Switch to the page that was open before this one
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

// --- Config verifier ---
// Tests all listing selectors against the live listings page,
// then opens the first property detail page and tests detail_page selectors.
async function verifyConfig(context, page, config) {
  const errors = [];

  // ── 1. Navigate to start_url to ensure we're on the listings page ──
  if (page.url() !== config.start_url) {
    try {
      await page.goto(config.start_url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1500);
    } catch (e) {
      errors.push(`Could not navigate to start_url "${config.start_url}": ${e.message.slice(0, 80)}`);
      return errors;
    }
  }

  // ── 2. listing_selector ──
  let cardCount = 0;
  try {
    cardCount = await page.locator(config.listing_selector).count();
  } catch (e) {
    errors.push(`listing_selector "${config.listing_selector}" is invalid CSS: ${e.message.slice(0, 120)}`);
    return errors;
  }

  if (cardCount === 0) {
    const candidates = await page.evaluate(() => {
      const counts = {};
      document.querySelectorAll('*').forEach(el => {
        const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
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
      `Repeated class names on this page (candidates): ${candidates}`
    );
    return errors;
  }

  // ── 3. Field selectors ──
  const firstCard = page.locator(config.listing_selector).first();

  for (const [field, def] of Object.entries(config.fields ?? {})) {
    const selector = typeof def === 'string' ? def : def?.selector;
    const type = (typeof def === 'object' ? def?.type : null) ?? 'text';

    if (!selector) { errors.push(`field "${field}" has no selector`); continue; }

    try {
      const el = firstCard.locator(selector).first();
      let value = null;
      if (type === 'href') value = await el.getAttribute('href', { timeout: VERIFY_TIMEOUT_MS });
      else if (type === 'src') value = await el.getAttribute('src', { timeout: VERIFY_TIMEOUT_MS });
      else if (type === 'background_image') {
        const style = await el.getAttribute('style', { timeout: VERIFY_TIMEOUT_MS }) ?? '';
        const m = style.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
        value = m ? m[1] : null;
      } else {
        value = await el.textContent({ timeout: VERIFY_TIMEOUT_MS });
      }

      if (!value || !String(value).trim()) {
        const cardText = await firstCard.textContent({ timeout: VERIFY_TIMEOUT_MS }).catch(() => '');
        const hint = cardText.replace(/\s+/g, ' ').trim().slice(0, 200);
        errors.push(`field "${field}": selector "${selector}" (type: ${type}) returned empty. Card text: "${hint}"`);
      }
    } catch (e) {
      errors.push(`field "${field}": selector "${selector}" not found in first card — ${e.message.slice(0, 120)}`);
    }
  }

  // ── 4. detail_page selectors (open first property in a new tab, verify, close) ──
  const dp = config.detail_page;
  if (dp && config.fields?.url) {
    const urlDef = config.fields.url;
    const urlSel = typeof urlDef === 'string' ? urlDef : urlDef?.selector;
    let detailUrl = null;

    try {
      detailUrl = await firstCard.locator(urlSel).first().getAttribute('href', { timeout: VERIFY_TIMEOUT_MS });
      if (detailUrl && !detailUrl.startsWith('http')) {
        detailUrl = new URL(detailUrl, page.url()).href;
      }
    } catch (e) {
      errors.push(`Cannot get detail URL for verification: ${e.message.slice(0, 80)}`);
    }

    if (detailUrl) {
      console.log(`  Verifying detail page selectors on: ${detailUrl}`);
      const detailPage = await context.newPage();
      try {
        await detailPage.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await detailPage.waitForTimeout(1500);

        if (dp.image_selector) {
          try {
            const imgEl = detailPage.locator(dp.image_selector).first();
            let imgVal = null;
            if ((dp.image_type ?? 'src') === 'background_image') {
              const style = await imgEl.getAttribute('style', { timeout: VERIFY_TIMEOUT_MS }) ?? '';
              const m = style.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
              imgVal = m ? m[1] : null;
            } else {
              imgVal = await imgEl.getAttribute('src', { timeout: VERIFY_TIMEOUT_MS });
            }
            if (!imgVal) errors.push(`detail_page.image_selector "${dp.image_selector}" matched an element but returned no image value`);
          } catch (e) {
            const cands = await detailPage.evaluate(() => {
              const imgs = [...document.querySelectorAll('img')].slice(0, 5).map(i => i.className || i.id || i.src?.split('/').pop()).join(', ');
              return imgs || 'none found';
            });
            errors.push(`detail_page.image_selector "${dp.image_selector}" not found. Sample <img> elements: ${cands}`);
          }
        }

        if (dp.description_selector) {
          try {
            const text = await detailPage.locator(dp.description_selector).first().textContent({ timeout: VERIFY_TIMEOUT_MS });
            if (!text?.trim()) errors.push(`detail_page.description_selector "${dp.description_selector}" matched but returned empty text`);
          } catch (e) {
            errors.push(`detail_page.description_selector "${dp.description_selector}" not found on detail page — ${e.message.slice(0, 80)}`);
          }
        }

        if (dp.external_id_source === 'selector' && dp.external_id_selector) {
          try {
            const text = await detailPage.locator(dp.external_id_selector).first().textContent({ timeout: VERIFY_TIMEOUT_MS });
            if (!text?.trim()) errors.push(`detail_page.external_id_selector "${dp.external_id_selector}" returned empty text`);
          } catch (e) {
            errors.push(`detail_page.external_id_selector "${dp.external_id_selector}" not found — ${e.message.slice(0, 80)}`);
          }
        }
      } finally {
        await detailPage.close();
      }
    }
  }

  return errors;
}

// --- Main ---
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY is not set. Create a .env file or export it.');
    process.exit(1);
  }

  initOutputDir();

  const run = {
    id: `run_${uid()}`,
    source_agency: new URL(TARGET_URL).hostname,
    trigger: 'MANUAL',
    status: 'RUNNING',
    prompt: `Find all property listings on ${TARGET_URL}. Handle filters and pagination.`,
    staged_config: null,
    started_at: new Date().toISOString(),
    finished_at: null,
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'run.json'), JSON.stringify(run, null, 2));
  console.log(`\nStarting generation run: ${run.id}`);
  console.log(`  Target: ${TARGET_URL}`);
  console.log(`  Output: ${OUTPUT_DIR}\n`);

  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  let currentPage = await context.newPage();

  await currentPage.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await currentPage.waitForTimeout(2000);

  const messages = [];
  let finalConfig = null;
  let stepIndex = 0;

  try {
    for (stepIndex = 0; stepIndex < MAX_STEPS; stepIndex++) {
      const tabCount = context.pages().length;
      const tabInfo = tabCount > 1
        ? `Open tabs: ${tabCount}  |  Active tab URL: ${currentPage.url()}`
        : `URL: ${currentPage.url()}`;

      console.log(`\n=== Step ${stepIndex} | ${tabInfo} ===`);

      const screenshotBefore = await takeScreenshot(currentPage, stepIndex);
      const imageData = fs.readFileSync(screenshotBefore).toString('base64');

      const stepHint = stepIndex === 0
        ? 'Initial page. Follow the mandatory workflow: find the listings page, inspect cards, visit a detail page, test pagination, then call done.'
        : `Step ${stepIndex}. ${tabInfo}.`;

      const userContent = [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageData } },
        { type: 'text', text: stepHint },
      ];
      messages.push({ role: 'user', content: userContent });

      const response = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 2048,
        thinking: { type: 'adaptive' },
        system: SYSTEM_PROMPT,
        messages,
      });

      const rawText = response.content.find(b => b.type === 'text')?.text ?? '';
      console.log('Claude:', rawText.substring(0, 400));
      messages.push({ role: 'assistant', content: rawText });

      let action;
      try {
        action = extractJSON(rawText);
      } catch (e) {
        console.error(`JSON parse error: ${e.message}`);
        messages.push({ role: 'user', content: 'Your response was not valid JSON. Return ONLY a JSON object, no other text.' });
        continue;
      }

      console.log(`Action: ${action.action}${action.selector ? ` → ${action.selector}` : ''}${action.url ? ` → ${action.url}` : ''}`);

      const step = {
        id: `step_${uid()}`,
        run_id: run.id,
        step_index: stepIndex,
        action_type: action.action.toUpperCase(),
        action_payload: action.action === 'done'
          ? { config: action.config }
          : { selector: action.selector, url: action.url, text: action.text },
        screenshot_before_path: screenshotBefore,
        screenshot_after_path: null,
        model_reasoning: action.reasoning ?? '',
        timestamp: new Date().toISOString(),
      };

      if (action.action === 'done') {
        console.log('\n  Verifying proposed config against live page...');
        const errors = await verifyConfig(context, currentPage, action.config);

        if (errors.length > 0) {
          console.log(`  Verification FAILED (${errors.length} issue${errors.length > 1 ? 's' : ''}):`);
          errors.forEach(e => console.log(`    ✗ ${e.slice(0, 140)}`));

          const feedback = [
            'Your proposed config was verified against the actual page and FAILED. Do NOT return "done" again with the same selectors.',
            '',
            'Errors:',
            ...errors.map(e => `- ${e}`),
            '',
            'Return to the listings page, inspect the actual elements, and return a corrected config.',
          ].join('\n');

          step.screenshot_after_path = screenshotBefore;
          step.model_reasoning += ' [VERIFICATION FAILED]';
          fs.writeFileSync(path.join(STEPS_DIR, `step_${String(stepIndex).padStart(3, '0')}.json`), JSON.stringify(step, null, 2));
          messages.push({ role: 'user', content: feedback });
          continue;
        }

        finalConfig = action.config;
        step.screenshot_after_path = screenshotBefore;
        fs.writeFileSync(path.join(STEPS_DIR, `step_${String(stepIndex).padStart(3, '0')}.json`), JSON.stringify(step, null, 2));
        console.log('  Verification PASSED');
        break;
      }

      try {
        currentPage = await executeAction(context, currentPage, action);
      } catch (e) {
        console.error(`Action failed: ${e.message}`);
        messages.push({
          role: 'user',
          content: `The action "${action.action}"${action.selector ? ` with selector "${action.selector}"` : ''} failed: ${e.message}. Try a different approach.`,
        });
      }

      const screenshotAfter = await takeScreenshot(currentPage, stepIndex);
      step.screenshot_after_path = screenshotAfter;
      fs.writeFileSync(path.join(STEPS_DIR, `step_${String(stepIndex).padStart(3, '0')}.json`), JSON.stringify(step, null, 2));
    }
  } finally {
    await browser.close();
  }

  run.finished_at = new Date().toISOString();
  run.status = finalConfig ? 'AWAITING_REVIEW' : 'FAILED';
  run.staged_config = finalConfig;
  fs.writeFileSync(path.join(OUTPUT_DIR, 'run.json'), JSON.stringify(run, null, 2));

  if (finalConfig) {
    const version = {
      id: `version_${uid()}`,
      run_id: run.id,
      created_by: 'AI',
      notes: `Auto-generated by computer use loop in ${stepIndex + 1} steps`,
      config: finalConfig,
      created_at: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, 'version.json'), JSON.stringify(version, null, 2));

    console.log('\nFiles written:');
    console.log(`  output/run.json          → ScraperGenerationRun (AWAITING_REVIEW)`);
    console.log(`  output/steps/step_*.json → ComputerUseStep (${stepIndex + 1} steps)`);
    console.log(`  output/version.json      → ScraperVersion\n`);
    console.log('Config:');
    console.log(JSON.stringify(finalConfig, null, 2));
  } else {
    console.log(`\nNo config produced after ${stepIndex} steps (run.status = FAILED)`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
