import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { FIX_ESTATEWEB_REMOVAL_QUEUE } from '@/core/queues/queues.constants';
import { FixEstateWebRemovalJobService } from '@/modules/user-properties/services/fix-estateweb-removal-job.service';
import {
  FixEstateWebRemovalItemResult,
  FixEstateWebRemovalJobData,
} from '@/modules/user-properties/interfaces/fix-estateweb-removal-job.interface';

// pushRemove does a GET + PATCH + GET round trip to EstateWeb per property -- keep
// concurrency modest so a big batch doesn't hammer one EstateWeb account's session.
const FIX_ESTATEWEB_REMOVAL_WORKER_CONCURRENCY = 4;

@Processor(FIX_ESTATEWEB_REMOVAL_QUEUE, {
  concurrency: FIX_ESTATEWEB_REMOVAL_WORKER_CONCURRENCY,
})
export class FixEstateWebRemovalProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(FixEstateWebRemovalProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fixEstateWebRemovalJobService: FixEstateWebRemovalJobService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.worker.concurrency = FIX_ESTATEWEB_REMOVAL_WORKER_CONCURRENCY;
  }

  async process(job: Job<FixEstateWebRemovalJobData>): Promise<void> {
    const { job_log_id, user_property_id, total } = job.data;
    this.logger.log(
      `[process] job_log=${job_log_id} user_property=${user_property_id} attempt=${job.attemptsMade + 1}`,
    );

    await this.ensureJobActive(job_log_id, job);

    try {
      const item =
        await this.fixEstateWebRemovalJobService.processProperty(job.data);
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

  private async ensureJobActive(
    logId: string,
    job: Job<FixEstateWebRemovalJobData>,
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

  // Same idempotent per-item + atomic-summary-rederive pattern as
  // CheckEstateWebRemovalProcessor / ResolveEstateWebLocationProcessor.
  private async recordItemResult(
    logId: string,
    item: FixEstateWebRemovalItemResult,
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
          'fixed', counts.fixed,
          'skipped', counts.skipped,
          'failed', counts.failed
        ),
        status = CASE
          WHEN counts.processed < ${total}::int THEN j.status
          WHEN counts.fixed = 0 AND counts.skipped = 0 AND counts.failed = ${total}::int
            THEN 'FAILED'::"JobStatus"
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
          WHEN counts.fixed = 0 AND counts.skipped = 0 AND counts.failed = ${total}::int
            THEN format('EstateWeb removal fix failed for all %s properties', ${total}::int)
          WHEN counts.failed > 0 THEN format('Completed with %s failures', counts.failed)
          ELSE NULL
        END
      FROM (
        SELECT
          COUNT(*)::int AS processed,
          COUNT(*) FILTER (WHERE status = 'fixed')::int AS fixed,
          COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
        FROM job_log_items WHERE job_log_id = ${logId}::text
      ) counts
      WHERE j.id = ${logId}::text
    `;
  }
}
