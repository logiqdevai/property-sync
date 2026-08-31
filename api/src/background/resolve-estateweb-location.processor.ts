import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { RESOLVE_ESTATEWEB_LOCATION_QUEUE } from '@/core/queues/queues.constants';
import { ResolveEstateWebLocationJobService } from '@/modules/user-properties/services/resolve-estateweb-location-job.service';
import {
  ResolveEstateWebLocationEntityType,
  ResolveEstateWebLocationFailure,
  ResolveEstateWebLocationItemResult,
  ResolveEstateWebLocationJobData,
} from '@/modules/user-properties/interfaces/resolve-estateweb-location-job.interface';

const RESOLVE_ESTATEWEB_LOCATION_WORKER_CONCURRENCY = 15;
// Failures are individually listed in job_logs.result for the UI; beyond this many the
// count still shows correctly (see `failed` in the aggregate counts), the list just stops
// growing -- protects job_logs.result from unbounded growth on a pathological run.
const MAX_TRACKED_FAILURES = 200;

// Google Geocoding's OVER_QUERY_LIMIT is a QPS/sustained-throughput throttle, not the
// monthly free-tier cap -- concurrency alone doesn't protect against it, since 15 workers
// running flat out for a multi-thousand-item backfill sustains far more than a brief burst.
// A per-item retry (see the enqueue opts wherever this queue is used) doesn't fix that
// either: it only delays *that* job's own next attempt while every other concurrent slot
// keeps hammering at the same aggregate rate. Capping the whole worker's throughput here is
// what actually keeps every job under a rate a shared API key can sustain indefinitely.
const RESOLVE_ESTATEWEB_LOCATION_MAX_REQUESTS_PER_SECOND = 8;

@Processor(RESOLVE_ESTATEWEB_LOCATION_QUEUE, {
  concurrency: RESOLVE_ESTATEWEB_LOCATION_WORKER_CONCURRENCY,
  limiter: {
    max: RESOLVE_ESTATEWEB_LOCATION_MAX_REQUESTS_PER_SECOND,
    duration: 1000,
  },
})
export class ResolveEstateWebLocationProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(ResolveEstateWebLocationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolveEstateWebLocationJobService: ResolveEstateWebLocationJobService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.worker.concurrency = RESOLVE_ESTATEWEB_LOCATION_WORKER_CONCURRENCY;
  }

  async process(job: Job<ResolveEstateWebLocationJobData>): Promise<void> {
    const { job_log_id, entity_id, total } = job.data;
    this.logger.log(
      `[process] job_log=${job_log_id} entity=${entity_id} attempt=${job.attemptsMade + 1}`,
    );

    await this.ensureJobActive(job_log_id, job);

    try {
      const item =
        job.data.entity_type === 'property'
          ? await this.resolveEstateWebLocationJobService.processProperty(
              job.data,
            )
          : await this.resolveEstateWebLocationJobService.processUserProperty(
              job.data,
            );
      await this.recordItemResult(job_log_id, item, total, job.data.entity_type);
      this.logger.log(
        `[process] job_log=${job_log_id} entity=${entity_id} status=${item.status}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[process] job_log=${job_log_id} entity=${entity_id} failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.recordItemResult(
        job_log_id,
        {
          entity_id,
          status: 'failed',
          error: message,
        },
        total,
        job.data.entity_type,
      );
      throw error;
    }
  }

  // Plain atomic UPDATE, no interactive transaction: safe under high concurrency since
  // Postgres serializes single statements on the row without an app-controlled lock window.
  private async ensureJobActive(
    logId: string,
    job: Job<ResolveEstateWebLocationJobData>,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE job_logs SET
        status = CASE
          WHEN status IN ('WAITING', 'DELAYED') THEN 'ACTIVE'::"JobStatus"
          ELSE status
        END,
        started_at = COALESCE(started_at, now()),
        attempt = GREATEST(attempt, ${job.attemptsMade + 1}::int),
        max_attempts = COALESCE(${job.opts.attempts ?? null}::int, max_attempts)
      WHERE id = ${logId}::text
    `;
  }

  // Upserts this entity's result into its own row (JobLogItem), then atomically re-derives
  // the job_logs summary/status from the current JobLogItem counts. Every worker recomputes
  // independently and idempotently, so a slow/failed refresh from one worker is self-healed
  // by the next item's completion -- no possibility of permanently losing an item's result.
  private async recordItemResult(
    logId: string,
    item: ResolveEstateWebLocationItemResult,
    total: number,
    entityType: ResolveEstateWebLocationEntityType,
  ): Promise<void> {
    await this.prisma.jobLogItem.upsert({
      where: {
        job_log_id_entity_id: { job_log_id: logId, entity_id: item.entity_id },
      },
      create: {
        job_log_id: logId,
        entity_id: item.entity_id,
        status: item.status,
        error: item.error ?? null,
      },
      update: {
        status: item.status,
        error: item.error ?? null,
      },
    });

    await this.prisma.$executeRaw`
      UPDATE job_logs j SET
        result = jsonb_build_object(
          'total', ${total}::int,
          'processed', counts.processed,
          'resolved', counts.resolved,
          'unchanged', counts.unchanged,
          'skipped', counts.skipped,
          'failed', counts.failed
        ),
        status = CASE
          WHEN counts.processed < ${total}::int THEN j.status
          WHEN counts.resolved = 0 AND counts.unchanged = 0 AND counts.skipped = 0
            AND counts.failed = ${total}::int THEN 'FAILED'::"JobStatus"
          ELSE 'COMPLETED'::"JobStatus"
        END,
        finished_at = CASE
          WHEN counts.processed >= ${total}::int THEN COALESCE(j.finished_at, now())
          ELSE j.finished_at
        END,
        duration_ms = CASE
          WHEN counts.processed >= ${total}::int AND j.started_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (now() - j.started_at)) * 1000
          ELSE j.duration_ms
        END,
        error_message = CASE
          WHEN counts.processed < ${total}::int THEN j.error_message
          WHEN counts.resolved = 0 AND counts.unchanged = 0 AND counts.skipped = 0
            AND counts.failed = ${total}::int
            THEN format('EstateWeb location resolution failed for all %s properties', ${total}::int)
          WHEN counts.failed > 0 THEN format('Completed with %s failures', counts.failed)
          ELSE NULL
        END
      FROM (
        SELECT
          COUNT(*)::int AS processed,
          COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
          COUNT(*) FILTER (WHERE status = 'unchanged')::int AS unchanged,
          COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
        FROM job_log_items WHERE job_log_id = ${logId}::text
      ) counts
      WHERE j.id = ${logId}::text
    `;

    // Enrich the finished result with a titled failures list. Deliberately done as a
    // one-time follow-up on the finishing call rather than appended incrementally per
    // item -- job_log_items.upsert already overwrites status on retry, so reading it
    // fresh here (instead of accumulating a side array) can never leave a stale "failed"
    // entry behind for an item that later succeeded on retry. A near-simultaneous finish
    // across a couple of workers can run this block more than once; that's harmless
    // (idempotent) rather than incorrect, so no extra locking is worth adding for it.
    const processedCount = await this.prisma.jobLogItem.count({
      where: { job_log_id: logId },
    });
    if (processedCount < total) return;

    const failedItems = await this.prisma.jobLogItem.findMany({
      where: { job_log_id: logId, status: 'failed' },
      select: { entity_id: true, error: true },
      take: MAX_TRACKED_FAILURES,
    });
    if (failedItems.length === 0) return;

    const entityIds = failedItems.map((f) => f.entity_id);
    const titleRows =
      entityType === 'property'
        ? await this.prisma.property.findMany({
            where: { id: { in: entityIds } },
            select: { id: true, title: true },
          })
        : await this.prisma.userProperty.findMany({
            where: { id: { in: entityIds } },
            select: { id: true, title: true },
          });
    const titleById = new Map(titleRows.map((r) => [r.id, r.title]));

    const failures: ResolveEstateWebLocationFailure[] = failedItems.map((f) => ({
      entity_id: f.entity_id,
      title: titleById.get(f.entity_id) ?? null,
      error: f.error ?? '',
    }));

    await this.prisma.$executeRaw`
      UPDATE job_logs SET
        result = result || jsonb_build_object('failures', ${JSON.stringify(failures)}::jsonb)
      WHERE id = ${logId}::text
    `;
  }
}
