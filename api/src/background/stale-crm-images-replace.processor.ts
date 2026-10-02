import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { STALE_CRM_IMAGES_REPLACE_QUEUE } from '@/core/queues/queues.constants';
import { JobStatus } from 'generated/prisma';
import { StaleCrmImagesReplaceJobService } from '@/modules/user-properties/services/stale-crm-images-replace-job.service';
import {
  StaleCrmImagesReplaceItemResult,
  StaleCrmImagesReplaceJobData,
  StaleCrmImagesReplaceJobResult,
} from '@/modules/user-properties/interfaces/stale-crm-images-replace-job.interface';

// Lower than the delete-only cleanup processors (5): each item here does a
// download + upload + delete round trip against EstateWeb, not just one
// delete call, so it's both slower per item and heavier on the shared DB
// transaction below.
const STALE_CRM_IMAGES_REPLACE_WORKER_CONCURRENCY = 3;

// The sibling delete-only processors use Prisma's default 5000ms interactive
// transaction timeout. Under concurrency, holding a FOR UPDATE row lock plus
// a round trip was observed to exceed that default in production (see
// docs/CLIENT-ISSUES-2026-10-01.md's image-cap-excess-images incident: 11 of
// 73 items got marked "failed" by a transaction timeout even though the
// underlying EstateWeb delete had already succeeded). This job's per-item
// work is slower still, so the timeout needs to be generous here from the
// start rather than discovered the same way again.
const JOB_LOG_TRANSACTION_TIMEOUT_MS = 20000;

@Processor(STALE_CRM_IMAGES_REPLACE_QUEUE, {
  concurrency: STALE_CRM_IMAGES_REPLACE_WORKER_CONCURRENCY,
})
export class StaleCrmImagesReplaceProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(StaleCrmImagesReplaceProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staleCrmImagesReplaceJobService: StaleCrmImagesReplaceJobService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.worker.concurrency = STALE_CRM_IMAGES_REPLACE_WORKER_CONCURRENCY;
  }

  async process(job: Job<StaleCrmImagesReplaceJobData>): Promise<void> {
    const { job_log_id, crm_image_id, total } = job.data;
    this.logger.log(
      `[process] job_log=${job_log_id} crm_image=${crm_image_id} attempt=${job.attemptsMade + 1}`,
    );

    await this.ensureJobActive(job_log_id, job, total);

    try {
      const item = await this.staleCrmImagesReplaceJobService.processItem(job.data);
      await this.recordItemResult(job_log_id, item, total);
      this.logger.log(
        `[process] job_log=${job_log_id} crm_image=${crm_image_id} status=${item.status}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[process] job_log=${job_log_id} crm_image=${crm_image_id} failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.recordItemResult(
        job_log_id,
        {
          user_property_id: job.data.user_property_id,
          crm_image_id,
          status: 'failed',
          error: message,
        },
        total,
      );
      throw error;
    }
  }

  private emptyResult(total: number): StaleCrmImagesReplaceJobResult {
    return {
      total,
      processed: 0,
      replaced: 0,
      failed: 0,
      items: [],
      logs: [],
    };
  }

  private async ensureJobActive(
    logId: string,
    job: Job<StaleCrmImagesReplaceJobData>,
    total: number,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT id FROM job_logs WHERE id = ${logId} FOR UPDATE`,
        );
        const log = await tx.jobLog.findUnique({ where: { id: logId } });
        if (!log) return;

        const result =
          (log.result as unknown as StaleCrmImagesReplaceJobResult | null) ??
          this.emptyResult(total);
        if (!result.logs) result.logs = [];
        result.logs.push(
          `worker start crm_image=${job.data.crm_image_id} bull_job_id=${job.id} attempt=${job.attemptsMade + 1}`,
        );

        await tx.jobLog.update({
          where: { id: logId },
          data: {
            status:
              log.status === JobStatus.WAITING || log.status === JobStatus.DELAYED
                ? JobStatus.ACTIVE
                : log.status,
            started_at: log.started_at ?? new Date(),
            attempt: Math.max(log.attempt, job.attemptsMade + 1),
            max_attempts: job.opts.attempts ?? log.max_attempts,
            result: result as object,
          },
        });
      },
      { timeout: JOB_LOG_TRANSACTION_TIMEOUT_MS },
    );
  }

  private async recordItemResult(
    logId: string,
    item: StaleCrmImagesReplaceItemResult,
    total: number,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT id FROM job_logs WHERE id = ${logId} FOR UPDATE`,
        );
        const log = await tx.jobLog.findUnique({ where: { id: logId } });
        if (!log) return;

        const result =
          (log.result as unknown as StaleCrmImagesReplaceJobResult | null) ??
          this.emptyResult(total);

        const already = result.items.some((row) => row.crm_image_id === item.crm_image_id);
        if (already) {
          result.items = result.items.map((row) =>
            row.crm_image_id === item.crm_image_id ? item : row,
          );
        } else {
          result.items.push(item);
          result.processed += 1;
        }

        result.replaced = result.items.filter((row) => row.status === 'replaced').length;
        result.failed = result.items.filter((row) => row.status === 'failed').length;

        if (!result.logs) result.logs = [];
        result.logs.push(
          `crm_image=${item.crm_image_id} status=${item.status}${item.error ? ` error=${item.error}` : ''}`,
        );

        const finished = result.processed >= result.total;
        const finishedAt = finished ? new Date() : null;
        const hardFailed =
          finished && result.replaced === 0 && result.failed === result.total;

        await tx.jobLog.update({
          where: { id: logId },
          data: {
            result: result as object,
            ...(finished
              ? {
                  status: hardFailed ? JobStatus.FAILED : JobStatus.COMPLETED,
                  finished_at: finishedAt,
                  duration_ms: log.started_at
                    ? finishedAt!.getTime() - log.started_at.getTime()
                    : null,
                  error_message: hardFailed
                    ? `Stale CRM image replace failed for all ${result.total} images`
                    : result.failed > 0
                      ? `Completed with ${result.failed} failures`
                      : null,
                }
              : {
                  status: JobStatus.ACTIVE,
                }),
          },
        });
      },
      { timeout: JOB_LOG_TRANSACTION_TIMEOUT_MS },
    );
  }
}
