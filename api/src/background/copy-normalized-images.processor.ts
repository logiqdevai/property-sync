import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { COPY_NORMALIZED_IMAGES_QUEUE } from '@/core/queues/queues.constants';
import { JobStatus } from 'generated/prisma';
import { CopyNormalizedImagesJobService } from '@/modules/user-properties/services/copy-normalized-images-job.service';
import {
  CopyNormalizedImagesJobData,
  CopyNormalizedImagesJobResult,
} from '@/modules/user-properties/interfaces/copy-normalized-images-job.interface';

const COPY_NORMALIZED_IMAGES_WORKER_CONCURRENCY = 3;

@Processor(COPY_NORMALIZED_IMAGES_QUEUE, {
  concurrency: COPY_NORMALIZED_IMAGES_WORKER_CONCURRENCY,
})
export class CopyNormalizedImagesProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(CopyNormalizedImagesProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly copyNormalizedImagesJobService: CopyNormalizedImagesJobService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.worker.concurrency = COPY_NORMALIZED_IMAGES_WORKER_CONCURRENCY;
  }

  async process(job: Job<CopyNormalizedImagesJobData>): Promise<void> {
    const startedAt = new Date();
    this.logger.log(
      `[process] job_log=${job.data.job_log_id} property=${job.data.user_property_id} attempt=${job.attemptsMade + 1}`,
    );
    await this.markJobActive(job.data.job_log_id, job, startedAt);

    try {
      const result = await this.copyNormalizedImagesJobService.processJob(
        job.data,
        (progress) => this.updateJobProgress(job.data.job_log_id, progress),
      );
      await this.markJobCompleted(job.data.job_log_id, startedAt, result);
      this.logger.log(`[process] job_log=${job.data.job_log_id} completed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[process] job_log=${job.data.job_log_id} failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.markJobFailed(job.data.job_log_id, startedAt, message, error);
      throw error;
    }
  }

  private async markJobActive(
    logId: string,
    job: Job<CopyNormalizedImagesJobData>,
    startedAt: Date,
  ): Promise<void> {
    await this.prisma.jobLog.update({
      where: { id: logId },
      data: {
        job_id: job.id ?? null,
        job_name: job.name ?? 'copy-normalized-images',
        status: JobStatus.ACTIVE,
        attempt: job.attemptsMade + 1,
        max_attempts: job.opts.attempts ?? null,
        started_at: startedAt,
      },
    });
  }

  private async updateJobProgress(
    logId: string,
    progress: CopyNormalizedImagesJobResult,
  ): Promise<void> {
    await this.prisma.jobLog.update({
      where: { id: logId },
      data: { result: progress as object },
    });
  }

  private async markJobCompleted(
    logId: string,
    startedAt: Date,
    result: CopyNormalizedImagesJobResult,
  ): Promise<void> {
    const finishedAt = new Date();
    await this.prisma.jobLog.update({
      where: { id: logId },
      data: {
        status: JobStatus.COMPLETED,
        finished_at: finishedAt,
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
        result: result as object,
      },
    });
  }

  private async markJobFailed(
    logId: string,
    startedAt: Date,
    message: string,
    error: unknown,
  ): Promise<void> {
    const finishedAt = new Date();
    const stack = error instanceof Error ? error.stack : null;
    await this.prisma.jobLog.update({
      where: { id: logId },
      data: {
        status: JobStatus.FAILED,
        finished_at: finishedAt,
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
        error_message: message,
        stack_trace: stack ?? null,
      },
    });
  }
}
