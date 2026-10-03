import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { REORDER_INTEGRATION_IMAGES_QUEUE } from '@/core/queues/queues.constants';
import { JobStatus } from 'generated/prisma';
import { UserPropertiesService } from '@/modules/user-properties/user-properties.service';
import { ReorderIntegrationImagesJobData } from '@/modules/user-properties/interfaces/reorder-integration-images-job.interface';

const REORDER_INTEGRATION_IMAGES_WORKER_CONCURRENCY = 5;

@Processor(REORDER_INTEGRATION_IMAGES_QUEUE, {
  concurrency: REORDER_INTEGRATION_IMAGES_WORKER_CONCURRENCY,
})
export class ReorderIntegrationImagesProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(ReorderIntegrationImagesProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userPropertiesService: UserPropertiesService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.worker.concurrency = REORDER_INTEGRATION_IMAGES_WORKER_CONCURRENCY;
  }

  async process(job: Job<ReorderIntegrationImagesJobData>): Promise<void> {
    const { job_log_id, user_id, user_property_id, image_ids } = job.data;
    this.logger.log(
      `[process] job_log=${job_log_id} property=${user_property_id} attempt=${job.attemptsMade + 1}`,
    );

    await this.markActive(job_log_id, job);

    try {
      await this.userPropertiesService.reorderIntegrationImagesForJob(
        user_id,
        user_property_id,
        image_ids,
      );
      await this.markFinished(job_log_id, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[process] job_log=${job_log_id} property=${user_property_id} failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) {
        await this.markFinished(job_log_id, message);
      }
      throw error;
    }
  }

  private async markActive(
    logId: string,
    job: Job<ReorderIntegrationImagesJobData>,
  ): Promise<void> {
    const log = await this.prisma.jobLog.findUnique({ where: { id: logId } });
    if (!log) return;
    await this.prisma.jobLog.update({
      where: { id: logId },
      data: {
        status: JobStatus.ACTIVE,
        started_at: log.started_at ?? new Date(),
        attempt: Math.max(log.attempt, job.attemptsMade + 1),
        max_attempts: job.opts.attempts ?? log.max_attempts,
      },
    });
  }

  private async markFinished(
    logId: string,
    errorMessage: string | null,
  ): Promise<void> {
    const log = await this.prisma.jobLog.findUnique({ where: { id: logId } });
    if (!log) return;
    const finishedAt = new Date();
    await this.prisma.jobLog.update({
      where: { id: logId },
      data: {
        status: errorMessage ? JobStatus.FAILED : JobStatus.COMPLETED,
        finished_at: finishedAt,
        duration_ms: log.started_at
          ? finishedAt.getTime() - log.started_at.getTime()
          : null,
        error_message: errorMessage,
      },
    });
  }
}
