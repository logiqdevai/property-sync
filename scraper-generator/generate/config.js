import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const GENERATE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.join(GENERATE_DIR, '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });

export const TARGET_URL = process.env.TARGET_URL;
export const MAX_STEPS = 50;
export const VERIFY_TIMEOUT_MS = 4000;
export const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
export const SCREENSHOTS_DIR = path.join(OUTPUT_DIR, 'screenshots');
export const STEPS_DIR = path.join(OUTPUT_DIR, 'steps');

export const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

if (!TARGET_URL) {
  console.error('ERROR: TARGET_URL is not set. Add it to your .env file.');
  process.exit(1);
}
