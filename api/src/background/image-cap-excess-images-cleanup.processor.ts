import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { IMAGE_CAP_EXCESS_IMAGES_CLEANUP_QUEUE } from '@/core/queues/queues.constants';
import { JobStatus } from 'generated/prisma';
import { ImageCapExcessImagesCleanupJobService } from '@/modules/user-properties/services/image-cap-excess-images-cleanup-job.service';
import {
  ImageCapExcessImagesCleanupItemResult,
  ImageCapExcessImagesCleanupJobData,
  ImageCapExcessImagesCleanupJobResult,
} from '@/modules/user-properties/interfaces/image-cap-excess-images-cleanup-job.interface';

const IMAGE_CAP_EXCESS_IMAGES_CLEANUP_WORKER_CONCURRENCY = 5;

@Processor(IMAGE_CAP_EXCESS_IMAGES_CLEANUP_QUEUE, {
  concurrency: IMAGE_CAP_EXCESS_IMAGES_CLEANUP_WORKER_CONCURRENCY,
})
export class ImageCapExcessImagesCleanupProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(
    ImageCapExcessImagesCleanupProcessor.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly imageCapExcessImagesCleanupJobService: ImageCapExcessImagesCleanupJobService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.worker.concurrency = IMAGE_CAP_EXCESS_IMAGES_CLEANUP_WORKER_CONCURRENCY;
  }

  async process(job: Job<ImageCapExcessImagesCleanupJobData>): Promise<void> {
    const { job_log_id, crm_image_id, total } = job.data;
    this.logger.log(
      `[process] job_log=${job_log_id} crm_image=${crm_image_id} attempt=${job.attemptsMade + 1}`,
    );

    await this.ensureJobActive(job_log_id, job, total);

    try {
      const item = await this.imageCapExcessImagesCleanupJobService.processItem(
        job.data,
      );
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

  private emptyResult(total: number): ImageCapExcessImagesCleanupJobResult {
    return {
      total,
      processed: 0,
      deleted: 0,
      failed: 0,
      items: [],
      logs: [],
    };
  }

  private async ensureJobActive(
    logId: string,
    job: Job<ImageCapExcessImagesCleanupJobData>,
    total: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT id FROM job_logs WHERE id = ${logId} FOR UPDATE`,
      );
      const log = await tx.jobLog.findUnique({ where: { id: logId } });
      if (!log) return;

      const result =
        (log.result as unknown as ImageCapExcessImagesCleanupJobResult | null) ??
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
    });
  }

  private async recordItemResult(
    logId: string,
    item: ImageCapExcessImagesCleanupItemResult,
    total: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT id FROM job_logs WHERE id = ${logId} FOR UPDATE`,
      );
      const log = await tx.jobLog.findUnique({ where: { id: logId } });
      if (!log) return;

      const result =
        (log.result as unknown as ImageCapExcessImagesCleanupJobResult | null) ??
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

      result.deleted = result.items.filter((row) => row.status === 'deleted').length;
      result.failed = result.items.filter((row) => row.status === 'failed').length;

      if (!result.logs) result.logs = [];
      result.logs.push(
        `crm_image=${item.crm_image_id} status=${item.status}${item.error ? ` error=${item.error}` : ''}`,
      );

      const finished = result.processed >= result.total;
      const finishedAt = finished ? new Date() : null;
      const hardFailed =
        finished && result.deleted === 0 && result.failed === result.total;

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
                  ? `Image cap cleanup failed for all ${result.total} images`
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
