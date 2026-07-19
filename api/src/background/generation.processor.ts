import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { ComputerUseOrchestratorService } from '@/integrations/computer-use/computer-use-orchestrator.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { GENERATION_QUEUE } from '@/core/queues/queues.constants';
import { GENERATION_JOB_LOCK_DURATION_MS } from '@/integrations/computer-use/constants/generation.constants';
import {
  GenerationRunStatus,
  NotificationSeverity,
  NotificationType,
} from 'generated/prisma';

interface GenerationJobData {
  runId: string;
  resume?: boolean;
  retryError?: string;
  retryPrompt?: string;
}

@Processor(GENERATION_QUEUE, { lockDuration: GENERATION_JOB_LOCK_DURATION_MS })
export class GenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: ComputerUseOrchestratorService,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<GenerationJobData>): Promise<void> {
    try {
      await this.processGenerationJob(job);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const run = await this.prisma.scraperGenerationRun.findUnique({
        where: { id: job.data.runId },
      });

      this.notificationsService.create({
        type: NotificationType.QUEUE_FAILURE,
        severity: NotificationSeverity.CRITICAL,
        title: 'Generation queue job failed',
        message: `Generation job ${job.data.runId} failed: ${message}`,
        source_agency_id: run?.source_agency_id,
        scraper_id: run?.scraper_id ?? undefined,
      });

      throw error;
    }
  }

  private async processGenerationJob(
    job: Job<GenerationJobData>,
  ): Promise<void> {
    const { runId } = job.data;
    this.logger.log(`generation job received: ${runId}`);

    const run = await this.prisma.scraperGenerationRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      this.logger.error(`generation job ${runId}: run not found`);
      return;
    }

    if (run.status !== GenerationRunStatus.QUEUED) {
      this.logger.warn(
        `generation job ${runId}: run is ${run.status}, not QUEUED — skipping`,
      );
      return;
    }

    try {
      await this.orchestrator.run(runId, {
        resume: job.data.resume,
        retryError: job.data.retryError,
        retryPrompt: job.data.retryPrompt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `generation job ${runId} crashed outside the orchestrator: ${message}`,
      );
      throw error;
    }
  }
}
