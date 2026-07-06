import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const CRAWL_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.join(CRAWL_DIR, '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });

export const MAX_PAGES = 50;
export const PAGE_TIMEOUT_MS = 30_000;
export const SELECTOR_TIMEOUT_MS = 15_000;
export const SCROLL_PAUSE_MS = 1_500;
export const NORMALIZATION_BATCH_SIZE = 10;
export const DETAIL_CONCURRENCY = 3;
export const DETAIL_DELAY_MS = 500;
export const OUTPUT_DIR = path.join(ROOT_DIR, 'output', 'crawl');

export const LISTING_TYPES = ['SALE', 'RENT', 'SHORT_TERM_RENT', 'UNKNOWN'];
export const PROPERTY_TYPES = ['APARTMENT', 'HOUSE', 'VILLA', 'MAISONETTE', 'STUDIO', 'LAND', 'COMMERCIAL', 'OFFICE', 'WAREHOUSE', 'PARKING', 'OTHER', 'UNKNOWN'];
export const PROPERTY_STATUSES = ['ACTIVE', 'INACTIVE', 'REMOVED', 'SOLD', 'RENTED', 'UNKNOWN'];

export const NORMALIZATION_MODEL = 'claude-haiku-4-5-20251001';
export const MODEL_PRICING = {
  input_per_million: 1.0,
  output_per_million: 5.0,
};

export const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
