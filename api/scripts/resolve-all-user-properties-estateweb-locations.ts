// One-off operational script: enqueue the "resolve-estateweb-location" job for
// EVERY UserProperty row (across every user), then poll and print real-time
// terminal progress until it finishes.
//
// Exists because the admin UI's bulk action requires selecting rows in the
// table first, and selecting thousands of rows there is too slow/laggy to use
// in practice -- this bypasses the UI entirely and enqueues onto the exact
// same BullMQ queue the deployed worker already consumes from (respects the
// same rate limiter, uses the same job processing code -- no logic is
// duplicated here, this script only enqueues + reports progress).
//
// Run against a specific environment, e.g.:
//   npx dotenv -e .env.production -- npx ts-node scripts/resolve-all-user-properties-estateweb-locations.ts

import { PrismaClient, JobStatus } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Queue } from 'bullmq';

const RESOLVE_ESTATEWEB_LOCATION_QUEUE = 'resolve-estateweb-location';
const POLL_INTERVAL_MS = 15000;
const BAR_WIDTH = 30;

interface JobResult {
  total: number;
  processed: number;
  resolved: number;
  unchanged: number;
  skipped: number;
  failed: number;
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

function buildRedisConnection() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error('REDIS_URL not set');
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: parseInt(url.port, 10) || 6379,
    password: url.password || undefined,
    username: url.username || undefined,
    maxRetriesPerRequest: null as null,
  };
}

function renderBar(processed: number, total: number): string {
  const pct = total > 0 ? Math.min(1, processed / total) : 0;
  const filled = Math.round(pct * BAR_WIDTH);
  const bar = '#'.repeat(filled) + '-'.repeat(BAR_WIDTH - filled);
  return `[${bar}] ${(pct * 100).toFixed(1)}%`;
}

function formatResult(result: JobResult | null): string {
  if (!result) return 'starting…';
  return (
    `${result.processed}/${result.total} checked` +
    ` — resolved=${result.resolved} unchanged=${result.unchanged}` +
    ` skipped=${result.skipped} failed=${result.failed}`
  );
}

async function main() {
  console.log('Fetching every UserProperty id…');
  const properties = await prisma.userProperty.findMany({
    select: { id: true, user_id: true },
  });

  if (properties.length === 0) {
    console.log('No UserProperty rows found. Nothing to do.');
    return;
  }

  console.log(`Found ${properties.length} UserProperty rows.`);

  const jobLog = await prisma.jobLog.create({
    data: {
      queue_name: RESOLVE_ESTATEWEB_LOCATION_QUEUE,
      job_name: 'resolve-estateweb-location',
      status: JobStatus.WAITING,
      payload: {
        total: properties.length,
        source: 'resolve-all-user-properties-estateweb-locations.ts',
      } as object,
      result: {
        total: properties.length,
        processed: 0,
        resolved: 0,
        unchanged: 0,
        skipped: 0,
        failed: 0,
      } as object,
    },
  });

  console.log(`Created job_log ${jobLog.id}`);
  console.log(
    `Watch it live in the app too: /admin/jobs/${jobLog.id}`,
  );

  const queue = new Queue(RESOLVE_ESTATEWEB_LOCATION_QUEUE, {
    connection: buildRedisConnection(),
  });

  console.log(`Enqueuing ${properties.length} jobs…`);
  await queue.addBulk(
    properties.map((property) => ({
      name: 'resolve-estateweb-location',
      data: {
        job_log_id: jobLog.id,
        entity_type: 'user_property' as const,
        entity_id: property.id,
        user_id: property.user_id,
        total: properties.length,
      },
      opts: {
        jobId: `${jobLog.id}__${property.id}`,
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    })),
  );
  console.log('Enqueued. Polling for progress…\n');

  const startedAt = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const current = await prisma.jobLog.findUnique({
      where: { id: jobLog.id },
      select: { status: true, result: true },
    });
    const result = (current?.result as unknown as JobResult) ?? null;
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);

    console.log(
      `[+${elapsedSec}s] ${renderBar(result?.processed ?? 0, properties.length)}  ${formatResult(result)}`,
    );

    if (
      current?.status === JobStatus.COMPLETED ||
      current?.status === JobStatus.FAILED
    ) {
      console.log(`\nDone — status: ${current.status}`);
      if (result) {
        console.log(
          `Final: ${result.resolved} changed, ${result.unchanged} already correct, ` +
            `${result.skipped} skipped, ${result.failed} failed (of ${result.total}).`,
        );
      }
      break;
    }
  }

  await queue.close();
}

main()
  .catch((error) => {
    console.error('Script failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
