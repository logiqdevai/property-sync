import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { WATERMARK_REMOVAL_QUEUE } from '@/core/queues/queues.constants';
import { JobStatus } from 'generated/prisma';
import { WatermarkRemovalService } from '@/modules/user-properties/services/watermark-removal.service';
import {
  WatermarkRemovalJobData,
  WatermarkRemovalJobResult,
} from '@/modules/user-properties/interfaces/watermark-removal-job.interface';

@Processor(WATERMARK_REMOVAL_QUEUE)
export class WatermarkRemovalProcessor extends WorkerHost {
  private readonly logger = new Logger(WatermarkRemovalProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly watermarkRemovalService: WatermarkRemovalService,
  ) {
    super();
  }

  async process(job: Job<WatermarkRemovalJobData>): Promise<void> {
    const startedAt = new Date();
    await this.markJobActive(job.data.job_log_id, job, startedAt);

    const progress: WatermarkRemovalJobResult = {
      total: job.data.image_ids.length,
      completed: 0,
      failed: 0,
      items: [],
    };

    try {
      for (const imageId of job.data.image_ids) {
        try {
          await this.watermarkRemovalService.processSingleImage(
            job.data,
            imageId,
          );
          progress.completed += 1;
          progress.items.push({ image_id: imageId, status: 'completed' });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          progress.failed += 1;
          progress.items.push({
            image_id: imageId,
            status: 'failed',
            error: message,
          });
        }

        await this.updateJobProgress(job.data.job_log_id, progress);
      }

      if (progress.failed > 0) {
        throw new Error(
          `Watermark removal failed for ${progress.failed} of ${progress.total} images`,
        );
      }

      await this.markJobCompleted(job.data.job_log_id, startedAt, progress);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Watermark removal job ${job.data.job_log_id} failed: ${message}`,
      );
      await this.markJobFailed(
        job.data.job_log_id,
        startedAt,
        message,
        error,
        progress,
      );
      throw error;
    }
  }

  private async markJobActive(
    logId: string,
    job: Job<WatermarkRemovalJobData>,
    startedAt: Date,
  ): Promise<void> {
    await this.prisma.jobLog.update({
      where: { id: logId },
      data: {
        queue_name: WATERMARK_REMOVAL_QUEUE,
        job_id: job.id ?? null,
        job_name: job.name ?? 'remove-watermark',
        status: JobStatus.ACTIVE,
        attempt: job.attemptsMade + 1,
        max_attempts: job.opts.attempts ?? null,
        payload: job.data as object,
        started_at: startedAt,
      },
    });
  }

  private async updateJobProgress(
    logId: string,
    progress: WatermarkRemovalJobResult,
  ): Promise<void> {
    await this.prisma.jobLog.update({
      where: { id: logId },
      data: {
        result: progress as object,
      },
    });
  }

  private async markJobCompleted(
    logId: string,
    startedAt: Date,
    result: WatermarkRemovalJobResult,
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
    result: WatermarkRemovalJobResult,
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
        result: result as object,
      },
    });
  }
}
