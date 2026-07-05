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
const TARGET_URL = 'https://dinvestment.gr';
const MAX_STEPS = 40; // extra headroom for verification retries
const VERIFY_TIMEOUT_MS = 4000;
const SCREENSHOTS_DIR = path.join(__dirname, 'output', 'screenshots');
const STEPS_DIR = path.join(__dirname, 'output', 'steps');
const OUTPUT_DIR = path.join(__dirname, 'output');

// --- Init dirs ---
[SCREENSHOTS_DIR, STEPS_DIR, OUTPUT_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// --- Anthropic client ---
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- System prompt ---
const SYSTEM_PROMPT = `You are a web scraping config generator. You control a browser exploring a Greek real estate agency site (https://dinvestment.gr) to produce a Playwright scraper config.

Goal: find the page listing ALL properties, identify the exact CSS selectors on the actual rendered DOM, and output a complete config.

At each step you receive a screenshot. Return ONLY a JSON object — no prose:

{
  "reasoning": "what you see and why you're taking this action",
  "action": "click" | "scroll_down" | "scroll_up" | "type" | "navigate" | "wait" | "done",
  "selector": "CSS selector",   // for click/type
  "text": "string",             // for type
  "url": "string",              // for navigate
  "config": { ... }             // ONLY for done
}

Config format (done only):
{
  "start_url": "the full URL of the property listings page",
  "listing_selector": "CSS selector that matches EACH property card (the repeating container element)",
  "fields": {
    "title":        { "selector": "CSS selector WITHIN a card", "type": "text" },
    "price":        { "selector": "CSS selector WITHIN a card", "type": "text" },
    "location":     { "selector": "CSS selector WITHIN a card", "type": "text" },
    "listing_type": { "selector": "CSS selector WITHIN a card (e.g. sale/rent badge)", "type": "text" },
    "url":          { "selector": "CSS selector WITHIN a card for the detail link", "type": "href" },
    "image":        { "selector": "CSS selector WITHIN a card", "type": "src" | "background_image" }
  },
  "pagination": {
    "type": "next_button" | "infinite_scroll" | "load_more" | "url_param",
    "selector": "CSS selector for the Next page element",
    "url_param": "query param name (only for url_param type)"
  }
}

Field types:
- "text"             — reads the element's text content
- "href"             — reads the <a> href attribute
- "src"              — reads the <img> src attribute
- "background_image" — reads the URL from a CSS background-image: url(...) style attribute

IMPORTANT rules:
- Site is in Greek. Navigation labels: "Ακίνητα", "Αγγελίες", "Αγορά", "Ενοικίαση", "Προς Πώληση", "listings"
- SCROLL DOWN on the listings page to see property cards before deciding on selectors
- Your selectors are AUTOMATICALLY VERIFIED against the real page after you return "done"
- If verification fails you will be told exactly which selector failed — you MUST correct it
- DO NOT guess selectors — use what you can see in the rendered page (class names, tags, structure)
- Property cards are repeating elements — count how many appear and ensure your listing_selector matches all of them
- Field selectors must work WITHIN a single card element, not at the page level
- Image fields: if the image is a CSS background (no <img> tag), use type "background_image" with the element that has the style attribute`;

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

// --- Config verifier — runs selectors against the live page ---
async function verifyConfig(page, config) {
  const errors = [];

  // 1. listing_selector must match at least 1 element
  let cardCount = 0;
  try {
    cardCount = await page.locator(config.listing_selector).count();
  } catch (e) {
    errors.push(`listing_selector "${config.listing_selector}" is invalid CSS: ${e.message.slice(0, 120)}`);
    return errors; // can't verify fields without valid card selector
  }

  if (cardCount === 0) {
    // Give Claude a hint: show which class names are repeated on this page
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
      `Repeated class names on this page (candidates for card selector): ${candidates}`
    );
    return errors;
  }

  // 2. Each field selector must return a non-empty value on the FIRST card
  const firstCard = page.locator(config.listing_selector).first();

  for (const [field, def] of Object.entries(config.fields ?? {})) {
    const selector = typeof def === 'string' ? def : def?.selector;
    const type = (typeof def === 'object' ? def?.type : null) ?? 'text';

    if (!selector) {
      errors.push(`field "${field}" has no selector`);
      continue;
    }

    try {
      const el = firstCard.locator(selector).first();
      let value = null;

      if (type === 'href') {
        value = await el.getAttribute('href', { timeout: VERIFY_TIMEOUT_MS });
      } else if (type === 'src') {
        value = await el.getAttribute('src', { timeout: VERIFY_TIMEOUT_MS });
      } else if (type === 'background_image') {
        const style = await el.getAttribute('style', { timeout: VERIFY_TIMEOUT_MS }) ?? '';
        const m = style.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
        value = m ? m[1] : null;
      } else {
        value = await el.textContent({ timeout: VERIFY_TIMEOUT_MS });
      }

      if (!value || !String(value).trim()) {
        // Show what IS in the first card to help Claude pick a better selector
        const cardText = await firstCard.textContent({ timeout: VERIFY_TIMEOUT_MS }).catch(() => '');
        const cardHint = cardText.replace(/\s+/g, ' ').trim().slice(0, 200);
        errors.push(
          `field "${field}": selector "${selector}" (type: ${type}) returned empty/null on the first card. ` +
          `First card text content (for reference): "${cardHint}"`
        );
      }
    } catch (e) {
      errors.push(
        `field "${field}": selector "${selector}" (type: ${type}) not found inside first card — ${e.message.slice(0, 120)}`
      );
    }
  }

  return errors;
}

async function executeAction(page, action) {
  switch (action.action) {
    case 'click':
      await page.locator(action.selector).first().click({ timeout: 8000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      break;
    case 'scroll_down':
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(600);
      break;
    case 'scroll_up':
      await page.evaluate(() => window.scrollBy(0, -600));
      await page.waitForTimeout(600);
      break;
    case 'type':
      await page.locator(action.selector).first().fill(action.text, { timeout: 5000 });
      break;
    case 'navigate':
      await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      break;
    case 'wait':
      await page.waitForTimeout(3000);
      break;
    default:
      throw new Error(`Unknown action: ${action.action}`);
  }
}

// --- Main ---
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY is not set. Create a .env file or export it.');
    process.exit(1);
  }

  const run = {
    id: `run_${uid()}`,
    source_agency: 'dinvestment.gr',
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  const messages = [];
  let finalConfig = null;
  let stepIndex = 0;

  try {
    for (stepIndex = 0; stepIndex < MAX_STEPS; stepIndex++) {
      console.log(`\n=== Step ${stepIndex} | URL: ${page.url()} ===`);

      const screenshotBefore = await takeScreenshot(page, stepIndex);
      const imageData = fs.readFileSync(screenshotBefore).toString('base64');

      const userContent = [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageData } },
        {
          type: 'text',
          text: stepIndex === 0
            ? 'Initial page. Analyze the navigation and find the path to all property listings. Navigate there.'
            : `Step ${stepIndex}. Current URL: ${page.url()}. Continue.`,
        },
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
        // --- Automatic config verification ---
        console.log('\n  Verifying proposed config against live page...');
        const errors = await verifyConfig(page, action.config);

        if (errors.length > 0) {
          console.log(`  Verification FAILED (${errors.length} issue${errors.length > 1 ? 's' : ''}):`);
          errors.forEach(e => console.log(`    ✗ ${e.slice(0, 120)}`));

          // Tell Claude exactly what failed — it will correct selectors on the next step
          const feedback = [
            'Your proposed config was verified against the actual page and FAILED. Do NOT return "done" again with the same selectors.',
            '',
            'Errors:',
            ...errors.map(e => `- ${e}`),
            '',
            'Scroll down on the listings page to inspect the actual card elements, then return a corrected JSON action with the right selectors.',
          ].join('\n');

          step.screenshot_after_path = screenshotBefore;
          step.model_reasoning += ' [VERIFICATION FAILED]';
          fs.writeFileSync(path.join(STEPS_DIR, `step_${String(stepIndex).padStart(3, '0')}.json`), JSON.stringify(step, null, 2));

          messages.push({ role: 'user', content: feedback });
          continue; // back to the loop — Claude will try again
        }

        // Verification passed
        finalConfig = action.config;
        step.screenshot_after_path = screenshotBefore;
        fs.writeFileSync(path.join(STEPS_DIR, `step_${String(stepIndex).padStart(3, '0')}.json`), JSON.stringify(step, null, 2));
        console.log('  Verification PASSED');
        break;
      }

      try {
        await executeAction(page, action);
      } catch (e) {
        console.error(`Action failed: ${e.message}`);
        messages.push({
          role: 'user',
          content: `The action "${action.action}"${action.selector ? ` with selector "${action.selector}"` : ''} failed: ${e.message}. Try a different approach.`,
        });
      }

      const screenshotAfter = await takeScreenshot(page, stepIndex);
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
