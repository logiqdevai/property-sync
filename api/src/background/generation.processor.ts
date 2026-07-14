import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { GENERATION_QUEUE } from '@/core/queues/queues.constants';
import { GenerationRunStatus } from 'generated/prisma';

interface GenerationJobData {
  runId: string;
  initiatedByUserId?: string;
}

// TODO(next task): replace this stub body with the real computer-use loop
// (Anthropic vision loop + Playwright actions, ported from scraper-generator/generate/).
@Processor(GENERATION_QUEUE)
export class GenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerationProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<GenerationJobData>): Promise<void> {
    const { runId } = job.data;
    this.logger.log(`generation job received: ${runId}`);

    await this.prisma.scraperGenerationRun.update({
      where: { id: runId },
      data: { status: GenerationRunStatus.RUNNING, started_at: new Date() },
    });

    await this.prisma.scraperGenerationRun.update({
      where: { id: runId },
      data: {
        status: GenerationRunStatus.FAILED,
        error_message: 'AI loop not implemented yet',
        finished_at: new Date(),
      },
    });
  }
}
