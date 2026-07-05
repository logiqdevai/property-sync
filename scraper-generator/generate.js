/**
 * Scraper Generator — Computer Use MVP
 *
 * Opens a browser, loops: screenshot → Claude vision → action → repeat.
 * Outputs JSON files mirroring the architecture tables:
 *   output/run.json          → ScraperGenerationRun
 *   output/steps/step_N.json → ComputerUseStep (one per action)
 *   output/version.json      → ScraperVersion (final config)
 */

import Anthropic from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Config ---
const TARGET_URL = 'https://dinvestment.gr';
const MAX_STEPS = 25;
const SCREENSHOTS_DIR = path.join(__dirname, 'output', 'screenshots');
const STEPS_DIR = path.join(__dirname, 'output', 'steps');
const OUTPUT_DIR = path.join(__dirname, 'output');

// --- Init dirs ---
[SCREENSHOTS_DIR, STEPS_DIR, OUTPUT_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// --- Anthropic client ---
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- System prompt ---
const SYSTEM_PROMPT = `You are a web scraping config generator. You control a browser exploring a Greek real estate agency site (https://dinvestment.gr) to produce a Playwright scraper config.

Goal: find the page listing ALL properties, identify selectors, pagination, and output a complete config.

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
  "start_url": "the listings page URL",
  "listing_selector": "CSS selector for each property card",
  "fields": {
    "title":    { "selector": "...", "type": "text" },
    "price":    { "selector": "...", "type": "text" },
    "location": { "selector": "...", "type": "text" },
    "url":      { "selector": "a", "type": "href" },
    "image":    { "selector": "img", "type": "src" }
  },
  "pagination": {
    "type": "next_button" | "infinite_scroll" | "load_more" | "url_param",
    "selector": "...",
    "url_param": "..."
  }
}

Rules:
- Site is in Greek. Look for: "Ακίνητα", "Αγγελίες", "Αγορά", "Ενοικίαση", "Προς Πώληση"
- Navigate to the main listings page
- Verify selectors exist before using them
- Return "done" only when confident in the config`;

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

  // ScraperGenerationRun record
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
  console.log(`\n🚀 Starting generation run: ${run.id}`);
  console.log(`   Target: ${TARGET_URL}`);
  console.log(`   Output: ${OUTPUT_DIR}\n`);

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

      // Take before screenshot
      const screenshotBefore = await takeScreenshot(page, stepIndex);
      const imageData = fs.readFileSync(screenshotBefore).toString('base64');

      // Build user message with screenshot
      const userContent = [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: imageData },
        },
        {
          type: 'text',
          text: stepIndex === 0
            ? 'Initial page. Analyze the navigation and find the path to all property listings.'
            : `Step ${stepIndex}. Current URL: ${page.url()}. Continue exploring.`,
        },
      ];
      messages.push({ role: 'user', content: userContent });

      // Call Claude
      const response = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 1024,
        thinking: { type: 'adaptive' },
        system: SYSTEM_PROMPT,
        messages,
      });

      const rawText = response.content.find(b => b.type === 'text')?.text ?? '';
      console.log('Claude:', rawText.substring(0, 400));

      messages.push({ role: 'assistant', content: rawText });

      // Parse action
      let action;
      try {
        action = extractJSON(rawText);
      } catch (e) {
        console.error(`JSON parse error: ${e.message}`);
        messages.push({
          role: 'user',
          content: 'Your response was not valid JSON. Return ONLY a JSON object, no other text.',
        });
        continue;
      }

      console.log(`Action: ${action.action}${action.selector ? ` → ${action.selector}` : ''}${action.url ? ` → ${action.url}` : ''}`);

      // Save ComputerUseStep
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

      // Done — grab config
      if (action.action === 'done') {
        finalConfig = action.config;
        step.screenshot_after_path = screenshotBefore; // same, we're done
        fs.writeFileSync(path.join(STEPS_DIR, `step_${String(stepIndex).padStart(3, '0')}.json`), JSON.stringify(step, null, 2));
        console.log('\n✅ Generation complete!');
        break;
      }

      // Execute action
      try {
        await executeAction(page, action);
      } catch (e) {
        console.error(`Action failed: ${e.message}`);
        messages.push({
          role: 'user',
          content: `The action "${action.action}"${action.selector ? ` with selector "${action.selector}"` : ''} failed: ${e.message}. Try a different approach.`,
        });
      }

      // Take after screenshot
      const screenshotAfter = await takeScreenshot(page, stepIndex);
      step.screenshot_after_path = screenshotAfter;
      fs.writeFileSync(path.join(STEPS_DIR, `step_${String(stepIndex).padStart(3, '0')}.json`), JSON.stringify(step, null, 2));
    }
  } finally {
    await browser.close();
  }

  // Update run record
  run.finished_at = new Date().toISOString();
  run.status = finalConfig ? 'AWAITING_REVIEW' : 'FAILED';
  run.staged_config = finalConfig;
  fs.writeFileSync(path.join(OUTPUT_DIR, 'run.json'), JSON.stringify(run, null, 2));

  if (finalConfig) {
    // ScraperVersion record
    const version = {
      id: `version_${uid()}`,
      run_id: run.id,
      created_by: 'AI',
      notes: `Auto-generated by computer use loop in ${stepIndex + 1} steps`,
      config: finalConfig,
      created_at: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, 'version.json'), JSON.stringify(version, null, 2));

    console.log('\n📄 Files written:');
    console.log(`   output/run.json          → ScraperGenerationRun (status: AWAITING_REVIEW)`);
    console.log(`   output/steps/step_*.json → ComputerUseStep (${stepIndex + 1} steps)`);
    console.log(`   output/version.json      → ScraperVersion (staged config)\n`);
    console.log('Config:');
    console.log(JSON.stringify(finalConfig, null, 2));
  } else {
    console.log(`\n❌ No config produced after ${stepIndex} steps (run.status = FAILED)`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
