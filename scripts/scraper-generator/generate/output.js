import fs from 'fs';
import path from 'path';
import { OUTPUT_DIR, SCREENSHOTS_DIR, STEPS_DIR } from './config.js';

export function initOutputDir() {
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  [OUTPUT_DIR, SCREENSHOTS_DIR, STEPS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));
}

export async function takeScreenshot(page, step) {
  const file = path.join(SCREENSHOTS_DIR, `step_${String(step).padStart(3, '0')}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

export function writeStep(stepIndex, step) {
  const file = path.join(STEPS_DIR, `step_${String(stepIndex).padStart(3, '0')}.json`);
  fs.writeFileSync(file, JSON.stringify(step, null, 2));
}

export function writeRun(run) {
  fs.writeFileSync(path.join(OUTPUT_DIR, 'run.json'), JSON.stringify(run, null, 2));
}

export function writeVersion(version) {
  fs.writeFileSync(path.join(OUTPUT_DIR, 'version.json'), JSON.stringify(version, null, 2));
}
