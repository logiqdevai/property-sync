import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { GEOCODE_MISSING_COORDINATES_QUEUE } from '@/core/queues/queues.constants';
import { GeocodeCoordinatesJobService } from '@/modules/user-properties/services/geocode-coordinates-job.service';
import {
  GeocodeCoordinatesItemResult,
  GeocodeCoordinatesJobData,
} from '@/modules/user-properties/interfaces/geocode-coordinates-job.interface';

const GEOCODE_COORDINATES_WORKER_CONCURRENCY = 15;

@Processor(GEOCODE_MISSING_COORDINATES_QUEUE, {
  concurrency: GEOCODE_COORDINATES_WORKER_CONCURRENCY,
})
export class GeocodeCoordinatesProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(GeocodeCoordinatesProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocodeCoordinatesJobService: GeocodeCoordinatesJobService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.worker.concurrency = GEOCODE_COORDINATES_WORKER_CONCURRENCY;
  }

  async process(job: Job<GeocodeCoordinatesJobData>): Promise<void> {
    const { job_log_id, entity_id, total } = job.data;
    this.logger.log(
      `[process] job_log=${job_log_id} entity=${entity_id} attempt=${job.attemptsMade + 1}`,
    );

    await this.ensureJobActive(job_log_id, job);

    try {
      const item =
        job.data.entity_type === 'property'
          ? await this.geocodeCoordinatesJobService.processProperty(job.data)
          : await this.geocodeCoordinatesJobService.processUserProperty(
              job.data,
            );
      await this.recordItemResult(job_log_id, item, total);
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
      );
      throw error;
    }
  }

  // Plain atomic UPDATE, no interactive transaction: safe under high concurrency since
  // Postgres serializes single statements on the row without an app-controlled lock window.
  private async ensureJobActive(
    logId: string,
    job: Job<GeocodeCoordinatesJobData>,
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
    item: GeocodeCoordinatesItemResult,
    total: number,
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
          'geocoded', counts.geocoded,
          'failed', counts.failed
        ),
        status = CASE
          WHEN counts.processed < ${total}::int THEN j.status
          WHEN counts.geocoded = 0 AND counts.failed = ${total}::int THEN 'FAILED'::"JobStatus"
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
          WHEN counts.geocoded = 0 AND counts.failed = ${total}::int
            THEN format('Geocoding failed for all %s properties', ${total}::int)
          WHEN counts.failed > 0 THEN format('Completed with %s failures', counts.failed)
          ELSE NULL
        END
      FROM (
        SELECT
          COUNT(*)::int AS processed,
          COUNT(*) FILTER (WHERE status = 'geocoded')::int AS geocoded,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
        FROM job_log_items WHERE job_log_id = ${logId}::text
      ) counts
      WHERE j.id = ${logId}::text
    `;
  }
}
