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
  WatermarkRemovalStepLog,
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
      logs: [
        `start job_log_id=${job.data.job_log_id} bull_job_id=${job.id} attempt=${job.attemptsMade + 1}/${job.opts.attempts ?? 1} images=${job.data.image_ids.join(',')} replace_crm_images=${job.data.replace_crm_images} crm_property_id=${job.data.crm_property_id}`,
      ],
    };

    this.logger.log(progress.logs[0]);
    await this.updateJobProgress(job.data.job_log_id, progress);

    try {
      for (const imageId of job.data.image_ids) {
        const steps: WatermarkRemovalStepLog[] = [];
        const imageStarted = Date.now();
        progress.logs?.push(`image=${imageId} begin`);
        this.logger.log(
          `[job=${job.data.job_log_id}] image=${imageId} begin`,
        );

        try {
          await this.watermarkRemovalService.processSingleImage(
            job.data,
            imageId,
            steps,
          );
          progress.completed += 1;
          progress.items.push({
            image_id: imageId,
            status: 'completed',
            steps,
          });
          progress.logs?.push(
            `image=${imageId} completed ${Date.now() - imageStarted}ms`,
          );
          this.logger.log(
            `[job=${job.data.job_log_id}] image=${imageId} completed ${Date.now() - imageStarted}ms`,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const stack = error instanceof Error ? error.stack : undefined;
          progress.failed += 1;
          progress.items.push({
            image_id: imageId,
            status: 'failed',
            error: message,
            steps,
          });
          progress.logs?.push(
            `image=${imageId} failed ${Date.now() - imageStarted}ms: ${message}`,
          );
          this.logger.error(
            `[job=${job.data.job_log_id}] image=${imageId} failed ${Date.now() - imageStarted}ms: ${message}`,
            stack,
          );
        }

        await this.updateJobProgress(job.data.job_log_id, progress);
      }

      if (progress.failed > 0) {
        throw new Error(
          `Watermark removal failed for ${progress.failed} of ${progress.total} images`,
        );
      }

      progress.logs?.push('job completed');
      await this.markJobCompleted(job.data.job_log_id, startedAt, progress);
      this.logger.log(`[job=${job.data.job_log_id}] completed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      progress.logs?.push(`job failed: ${message}`);
      this.logger.error(
        `Watermark removal job ${job.data.job_log_id} failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
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
