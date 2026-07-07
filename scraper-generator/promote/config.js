import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../api/src/generated/prisma/index.js';

const PROMOTE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.join(PROMOTE_DIR, '..');
export const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
export const STEPS_DIR = path.join(OUTPUT_DIR, 'steps');
export const RUN_PATH = path.join(OUTPUT_DIR, 'run.json');
export const VERSION_PATH = path.join(OUTPUT_DIR, 'version.json');

dotenv.config({ path: path.join(ROOT_DIR, '..', 'api', '.env.staging') });

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set in api/.env.staging.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });
