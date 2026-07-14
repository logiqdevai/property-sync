import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CRAWL_QUEUE } from '@/core/queues/queues.constants';
import { CrawlRunStatus, JobStatus } from 'generated/prisma';

interface CrawlJobData {
  crawlRunId: string;
  jobLogId?: string;
}

@Processor(CRAWL_QUEUE)
export class CrawlProcessor extends WorkerHost {
  private readonly logger = new Logger(CrawlProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<CrawlJobData>): Promise<void> {
    const { crawlRunId, jobLogId } = job.data;
    this.logger.log(`crawl job received: ${crawlRunId}`);

    const run = await this.prisma.crawlRun.findUnique({
      where: { id: crawlRunId },
    });

    if (!run) {
      this.logger.error(`crawl job ${crawlRunId}: run not found`);
      return;
    }

    if (run.status !== CrawlRunStatus.QUEUED) {
      this.logger.warn(
        `crawl job ${crawlRunId}: run is ${run.status}, not QUEUED — skipping`,
      );
      return;
    }

    const startedAt = new Date();
    const attempt = job.attemptsMade + 1;

    let logId = jobLogId;
    if (logId) {
      await this.prisma.jobLog.update({
        where: { id: logId },
        data: {
          status: JobStatus.ACTIVE,
          attempt,
          job_id: job.id ?? null,
          started_at: startedAt,
          finished_at: null,
          duration_ms: null,
          error_message: null,
          stack_trace: null,
        },
      });
    } else {
      const jobLog = await this.prisma.jobLog.create({
        data: {
          queue_name: CRAWL_QUEUE,
          job_id: job.id ?? null,
          job_name: job.name ?? 'crawl',
          status: JobStatus.ACTIVE,
          attempt,
          max_attempts: job.opts.attempts ?? null,
          crawl_run_id: crawlRunId,
          payload: job.data as object,
          started_at: startedAt,
        },
      });
      logId = jobLog.id;
    }

    await this.prisma.crawlRun.update({
      where: { id: crawlRunId },
      data: {
        status: CrawlRunStatus.RUNNING,
        started_at: startedAt,
      },
    });

    try {
      // TODO(next task): replace with real Playwright pipeline
      await new Promise((resolve) => setTimeout(resolve, 100));

      const finishedAt = new Date();
      await this.prisma.crawlRun.update({
        where: { id: crawlRunId },
        data: {
          status: CrawlRunStatus.SUCCESS,
          finished_at: finishedAt,
        },
      });

      await this.prisma.jobLog.update({
        where: { id: logId },
        data: {
          status: JobStatus.COMPLETED,
          finished_at: finishedAt,
          duration_ms: finishedAt.getTime() - startedAt.getTime(),
          result: { status: CrawlRunStatus.SUCCESS },
        },
      });
    } catch (error) {
      const finishedAt = new Date();
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      await this.prisma.crawlRun.update({
        where: { id: crawlRunId },
        data: {
          status: CrawlRunStatus.FAILED,
          finished_at: finishedAt,
          error_message: message,
        },
      });

      await this.prisma.jobLog.update({
        where: { id: logId! },
        data: {
          status: JobStatus.FAILED,
          finished_at: finishedAt,
          duration_ms: finishedAt.getTime() - startedAt.getTime(),
          error_message: message,
          stack_trace: stack ?? null,
        },
      });

      throw error;
    }
  }
}
