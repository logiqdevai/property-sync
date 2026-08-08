import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { DELETE_INTEGRATION_IMAGES_QUEUE } from '@/core/queues/queues.constants';
import { JobStatus } from 'generated/prisma';
import { DeleteIntegrationImagesJobService } from '@/modules/user-properties/services/delete-integration-images-job.service';
import {
  DeleteIntegrationImagesItemResult,
  DeleteIntegrationImagesJobData,
  DeleteIntegrationImagesJobResult,
} from '@/modules/user-properties/interfaces/delete-integration-images-job.interface';

const DELETE_INTEGRATION_IMAGES_WORKER_CONCURRENCY = 5;

@Processor(DELETE_INTEGRATION_IMAGES_QUEUE, {
  concurrency: DELETE_INTEGRATION_IMAGES_WORKER_CONCURRENCY,
})
export class DeleteIntegrationImagesProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(DeleteIntegrationImagesProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deleteIntegrationImagesJobService: DeleteIntegrationImagesJobService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.worker.concurrency = DELETE_INTEGRATION_IMAGES_WORKER_CONCURRENCY;
  }

  async process(job: Job<DeleteIntegrationImagesJobData>): Promise<void> {
    const { job_log_id, user_property_id, total } = job.data;
    this.logger.log(
      `[process] job_log=${job_log_id} property=${user_property_id} attempt=${job.attemptsMade + 1}`,
    );

    await this.ensureJobActive(job_log_id, job, total);

    try {
      const item =
        await this.deleteIntegrationImagesJobService.processProperty(job.data);
      await this.recordItemResult(job_log_id, item, total);
      this.logger.log(
        `[process] job_log=${job_log_id} property=${user_property_id} status=${item.status}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[process] job_log=${job_log_id} property=${user_property_id} failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.recordItemResult(
        job_log_id,
        {
          user_property_id,
          status: 'failed',
          error: message,
        },
        total,
      );
      throw error;
    }
  }

  private emptyResult(total: number): DeleteIntegrationImagesJobResult {
    return {
      total,
      processed: 0,
      deleted: 0,
      skipped: 0,
      failed: 0,
      items: [],
      logs: [],
    };
  }

  private async ensureJobActive(
    logId: string,
    job: Job<DeleteIntegrationImagesJobData>,
    total: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT id FROM job_logs WHERE id = ${logId} FOR UPDATE`,
      );
      const log = await tx.jobLog.findUnique({ where: { id: logId } });
      if (!log) return;

      const result =
        (log.result as unknown as DeleteIntegrationImagesJobResult | null) ??
        this.emptyResult(total);
      if (!result.logs) result.logs = [];
      result.logs.push(
        `worker start property=${job.data.user_property_id} bull_job_id=${job.id} attempt=${job.attemptsMade + 1}`,
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
    });
  }

  private async recordItemResult(
    logId: string,
    item: DeleteIntegrationImagesItemResult,
    total: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT id FROM job_logs WHERE id = ${logId} FOR UPDATE`,
      );
      const log = await tx.jobLog.findUnique({ where: { id: logId } });
      if (!log) return;

      const result =
        (log.result as unknown as DeleteIntegrationImagesJobResult | null) ??
        this.emptyResult(total);

      const already = result.items.some(
        (row) => row.user_property_id === item.user_property_id,
      );
      if (already) {
        result.items = result.items.map((row) =>
          row.user_property_id === item.user_property_id ? item : row,
        );
      } else {
        result.items.push(item);
        result.processed += 1;
      }

      result.deleted = result.items.filter(
        (row) => row.status === 'deleted',
      ).length;
      result.skipped = result.items.filter(
        (row) => row.status === 'skipped',
      ).length;
      result.failed = result.items.filter(
        (row) => row.status === 'failed',
      ).length;

      if (!result.logs) result.logs = [];
      result.logs.push(
        `property=${item.user_property_id} status=${item.status}${item.deleted_count != null ? ` deleted_count=${item.deleted_count}` : ''}${item.error ? ` error=${item.error}` : ''}`,
      );

      const finished = result.processed >= result.total;
      const finishedAt = finished ? new Date() : null;
      const hardFailed =
        finished &&
        result.deleted === 0 &&
        result.skipped === 0 &&
        result.failed === result.total;

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
                  ? `CMS image delete failed for all ${result.total} properties`
                  : result.failed > 0
                    ? `Completed with ${result.failed} failures`
                    : null,
              }
            : {
                status: JobStatus.ACTIVE,
              }),
        },
      });
    });
  }
}
