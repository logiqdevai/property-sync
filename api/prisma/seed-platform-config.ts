import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DEFAULT_CHROMIUM_MAX_CONTEXTS_BEFORE_RESTART,
  DEFAULT_CRAWL_JOB_TIMEOUT_MS,
  DEFAULT_CRAWL_WORKER_CONCURRENCY,
  DEFAULT_DETAIL_CONCURRENCY,
  DEFAULT_DETAIL_DELAY_MS,
  DEFAULT_MAX_PAGES,
  DEFAULT_PAGE_TIMEOUT_MS,
  DEFAULT_SCROLL_PAUSE_MS,
  DEFAULT_SELECTOR_TIMEOUT_MS,
} from '../src/integrations/crawler/constants/crawler.constants';
import { DEFAULT_AI_RAW_DESCRIPTION_MAX_CHARS } from '../src/modules/properties/constants/normalization.constants';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

const SINGLETON_ID = 'singleton';

const data = {
  crawler_max_pages: DEFAULT_MAX_PAGES,
  crawler_page_timeout_ms: DEFAULT_PAGE_TIMEOUT_MS,
  crawler_selector_timeout_ms: DEFAULT_SELECTOR_TIMEOUT_MS,
  crawler_scroll_pause_ms: DEFAULT_SCROLL_PAUSE_MS,
  crawler_detail_concurrency: DEFAULT_DETAIL_CONCURRENCY,
  crawler_detail_delay_ms: DEFAULT_DETAIL_DELAY_MS,
  crawler_worker_concurrency: DEFAULT_CRAWL_WORKER_CONCURRENCY,
  crawler_job_timeout_ms: DEFAULT_CRAWL_JOB_TIMEOUT_MS,
  crawler_chromium_max_contexts_before_restart: DEFAULT_CHROMIUM_MAX_CONTEXTS_BEFORE_RESTART,
  normalization_ai_raw_description_max_chars: DEFAULT_AI_RAW_DESCRIPTION_MAX_CHARS,
};

async function main() {
  const row = await prisma.platformConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...data },
    update: data,
  });

  console.log('Seeded platform_config with current crawler/normalization defaults:');
  console.log(row);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
