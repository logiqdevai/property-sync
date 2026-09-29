import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CHECK_ESTATEWEB_REMOVAL_QUEUE } from '@/core/queues/queues.constants';
import { CheckEstateWebRemovalJobService } from '@/modules/user-properties/services/check-estateweb-removal-job.service';
import {
  CheckEstateWebRemovalItemResult,
  CheckEstateWebRemovalJobData,
} from '@/modules/user-properties/interfaces/check-estateweb-removal-job.interface';

const CHECK_ESTATEWEB_REMOVAL_WORKER_CONCURRENCY = 8;
// still_live_ids beyond this many still count toward `still_live` above, they just stop
// being individually listed -- protects job_logs.result from unbounded growth on a
// pathological run while comfortably covering any realistic admin selection.
const MAX_TRACKED_STILL_LIVE_IDS = 2000;

@Processor(CHECK_ESTATEWEB_REMOVAL_QUEUE, {
  concurrency: CHECK_ESTATEWEB_REMOVAL_WORKER_CONCURRENCY,
})
export class CheckEstateWebRemovalProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(CheckEstateWebRemovalProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly checkEstateWebRemovalJobService: CheckEstateWebRemovalJobService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.worker.concurrency = CHECK_ESTATEWEB_REMOVAL_WORKER_CONCURRENCY;
  }

  async process(job: Job<CheckEstateWebRemovalJobData>): Promise<void> {
    const { job_log_id, user_property_id, total } = job.data;
    this.logger.log(
      `[process] job_log=${job_log_id} user_property=${user_property_id} attempt=${job.attemptsMade + 1}`,
    );

    await this.ensureJobActive(job_log_id, job);

    try {
      const item =
        await this.checkEstateWebRemovalJobService.processProperty(job.data);
      await this.recordItemResult(job_log_id, item, total);
      this.logger.log(
        `[process] job_log=${job_log_id} user_property=${user_property_id} status=${item.status}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[process] job_log=${job_log_id} user_property=${user_property_id} failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.recordItemResult(
        job_log_id,
        { user_property_id, status: 'failed', error: message },
        total,
      );
      throw error;
    }
  }

  // Plain atomic UPDATE, no interactive transaction: safe under high concurrency since
  // Postgres serializes single statements on the row without an app-controlled lock window.
  private async ensureJobActive(
    logId: string,
    job: Job<CheckEstateWebRemovalJobData>,
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

  // Upserts this property's result into its own row (JobLogItem), then atomically
  // re-derives the job_logs summary/status from the current JobLogItem counts. Every
  // worker recomputes independently and idempotently, so a slow/failed refresh from one
  // worker is self-healed by the next item's completion -- no possibility of permanently
  // losing an item's result (see ResolveEstateWebLocationProcessor, same pattern).
  private async recordItemResult(
    logId: string,
    item: CheckEstateWebRemovalItemResult,
    total: number,
  ): Promise<void> {
    await this.prisma.jobLogItem.upsert({
      where: {
        job_log_id_entity_id: {
          job_log_id: logId,
          entity_id: item.user_property_id,
        },
      },
      create: {
        job_log_id: logId,
        entity_id: item.user_property_id,
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
          'still_live', counts.still_live,
          'unpublished', counts.unpublished,
          'skipped', counts.skipped,
          'failed', counts.failed
        ) || COALESCE(
          jsonb_build_object('still_live_ids', j.result -> 'still_live_ids'),
          '{}'::jsonb
        ),
        status = CASE
          WHEN counts.processed < ${total}::int THEN j.status
          WHEN counts.still_live = 0 AND counts.unpublished = 0 AND counts.skipped = 0
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
          WHEN counts.still_live = 0 AND counts.unpublished = 0 AND counts.skipped = 0
            AND counts.failed = ${total}::int
            THEN format('EstateWeb removal check failed for all %s properties', ${total}::int)
          WHEN counts.failed > 0 THEN format('Completed with %s failures', counts.failed)
          ELSE NULL
        END
      FROM (
        SELECT
          COUNT(*)::int AS processed,
          COUNT(*) FILTER (WHERE status = 'still_live')::int AS still_live,
          COUNT(*) FILTER (WHERE status = 'unpublished')::int AS unpublished,
          COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
        FROM job_log_items WHERE job_log_id = ${logId}::text
      ) counts
      WHERE j.id = ${logId}::text
    `;

    // Appends the full still-live id list once the job finishes (deliberately a one-time
    // follow-up on the finishing call, same reasoning as the failures list in
    // ResolveEstateWebLocationProcessor: job_log_items.upsert already overwrites status on
    // retry, so reading it fresh here can never leave a stale id behind for a property
    // that later resolved as unpublished on retry). A near-simultaneous finish across a
    // couple of workers can run this more than once; harmless (idempotent).
    const processedCount = await this.prisma.jobLogItem.count({
      where: { job_log_id: logId },
    });
    if (processedCount < total) return;

    const stillLiveItems = await this.prisma.jobLogItem.findMany({
      where: { job_log_id: logId, status: 'still_live' },
      select: { entity_id: true },
      take: MAX_TRACKED_STILL_LIVE_IDS,
    });

    await this.prisma.$executeRaw`
      UPDATE job_logs SET
        result = result || jsonb_build_object(
          'still_live_ids', ${JSON.stringify(stillLiveItems.map((i) => i.entity_id))}::jsonb
        )
      WHERE id = ${logId}::text
    `;
  }
}
