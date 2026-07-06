import fs from 'fs';
import { chromium } from 'playwright';
import { client, TARGET_URL, MAX_STEPS, OUTPUT_DIR } from './config.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { uid, extractJSON } from './utils.js';
import { initOutputDir, takeScreenshot, writeStep, writeRun, writeVersion } from './output.js';
import { executeAction } from './actions.js';
import { verifyConfig } from './verify.js';

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
  writeRun(run);
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
          writeStep(stepIndex, step);
          messages.push({ role: 'user', content: feedback });
          continue;
        }

        finalConfig = action.config;
        step.screenshot_after_path = screenshotBefore;
        writeStep(stepIndex, step);
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
      writeStep(stepIndex, step);
    }
  } finally {
    await browser.close();
  }

  run.finished_at = new Date().toISOString();
  run.status = finalConfig ? 'AWAITING_REVIEW' : 'FAILED';
  run.staged_config = finalConfig;
  writeRun(run);

  if (finalConfig) {
    const version = {
      id: `version_${uid()}`,
      run_id: run.id,
      created_by: 'AI',
      notes: `Auto-generated by computer use loop in ${stepIndex + 1} steps`,
      config: finalConfig,
      created_at: new Date().toISOString(),
    };
    writeVersion(version);

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
