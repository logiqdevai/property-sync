import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { UserIntegrationsService } from '@/modules/user-integrations/user-integrations.service';
import { ComputerUseOrchestratorService } from '@/integrations/computer-use/computer-use-orchestrator.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { GENERATION_QUEUE } from '@/core/queues/queues.constants';
import {
  AiProvider,
  GenerationRunStatus,
  GenerationTrigger,
  IntegrationType,
  NotificationSeverity,
  NotificationType,
} from 'generated/prisma';

interface GenerationJobData {
  runId: string;
  initiatedByUserId?: string;
}

@Processor(GENERATION_QUEUE)
export class GenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userIntegrationsService: UserIntegrationsService,
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

  private async processGenerationJob(job: Job<GenerationJobData>): Promise<void> {
    const { runId, initiatedByUserId } = job.data;
    this.logger.log(`generation job received: ${runId}`);

    const run = await this.prisma.scraperGenerationRun.findUnique({ where: { id: runId } });

    if (!run) {
      this.logger.error(`generation job ${runId}: run not found`);
      return;
    }

    if (run.status !== GenerationRunStatus.QUEUED) {
      this.logger.warn(`generation job ${runId}: run is ${run.status}, not QUEUED — skipping`);
      return;
    }

    let apiKey: string;
    try {
      if (run.trigger === GenerationTrigger.MANUAL) {
        if (!initiatedByUserId) {
          throw new Error('MANUAL generation run is missing initiatedByUserId');
        }
        ({ apiKey } = await this.userIntegrationsService.resolveActiveApiKey(
          initiatedByUserId,
          IntegrationType.ANTHROPIC,
        ));
      } else {
        const resolved = await this.userIntegrationsService.resolveForSourceAgency(
          run.source_agency_id,
          AiProvider.ANTHROPIC,
        );
        if (!resolved) {
          throw new Error('No active Anthropic UserIntegration available for this agency');
        }
        apiKey = resolved.apiKey;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resolve an Anthropic API key';
      this.logger.error(`generation job ${runId} failed to resolve an Anthropic key: ${message}`);
      await this.prisma.scraperGenerationRun.update({
        where: { id: runId },
        data: {
          status: GenerationRunStatus.FAILED,
          error_message: message,
          finished_at: new Date(),
        },
      });
      return;
    }

    try {
      await this.orchestrator.run(runId, apiKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`generation job ${runId} crashed outside the orchestrator: ${message}`);
      throw error;
    }
  }
}
