import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CONTENT_PRODUCTION_QUEUE } from '@/core/queues/queues.constants';
import { JobStatus } from 'generated/prisma';
import { ContentProductionJobService } from '@/modules/user-properties/services/content-production-job.service';
import {
  ContentProductionItemResult,
  ContentProductionJobData,
  ContentProductionJobResult,
} from '@/modules/user-properties/interfaces/content-production-job.interface';

const CONTENT_PRODUCTION_WORKER_CONCURRENCY = 5;

@Processor(CONTENT_PRODUCTION_QUEUE, {
  concurrency: CONTENT_PRODUCTION_WORKER_CONCURRENCY,
})
export class ContentProductionProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(ContentProductionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentProductionJobService: ContentProductionJobService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.worker.concurrency = CONTENT_PRODUCTION_WORKER_CONCURRENCY;
  }

  async process(job: Job<ContentProductionJobData>): Promise<void> {
    const { job_log_id, user_property_id, total } = job.data;

    await this.ensureJobActive(job_log_id, job, total);

    try {
      const item =
        await this.contentProductionJobService.processProperty(job.data);
      await this.recordItemResult(job_log_id, item, total);
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

  private emptyResult(total: number): ContentProductionJobResult {
    return {
      total,
      processed: 0,
      ready: 0,
      pending_batch: 0,
      failed: 0,
      cms_pushed: 0,
      cms_failed: 0,
      translations_written: 0,
      titles_written: 0,
      items: [],
      logs: [],
    };
  }

  private async ensureJobActive(
    logId: string,
    job: Job<ContentProductionJobData>,
    total: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT id FROM job_logs WHERE id = ${logId} FOR UPDATE`,
      );
      const log = await tx.jobLog.findUnique({ where: { id: logId } });
      if (!log) return;

      const result =
        (log.result as unknown as ContentProductionJobResult | null) ??
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
    item: ContentProductionItemResult,
    total: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT id FROM job_logs WHERE id = ${logId} FOR UPDATE`,
      );
      const log = await tx.jobLog.findUnique({ where: { id: logId } });
      if (!log) return;

      const result =
        (log.result as unknown as ContentProductionJobResult | null) ??
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

      result.ready = result.items.filter((row) => row.status === 'ready').length;
      result.pending_batch = result.items.filter(
        (row) => row.status === 'pending_batch',
      ).length;
      result.failed = result.items.filter((row) => row.status === 'failed').length;
      result.cms_failed = result.items.filter(
        (row) => row.status === 'cms_failed',
      ).length;
      result.cms_pushed = result.items.filter((row) => row.cms_pushed).length;
      result.translations_written = result.items.reduce(
        (sum, row) => sum + (row.translations_written ?? 0),
        0,
      );
      result.titles_written = result.items.reduce(
        (sum, row) => sum + (row.titles_written ?? 0),
        0,
      );

      if (!result.logs) result.logs = [];
      result.logs.push(
        `property=${item.user_property_id} status=${item.status}${item.error ? ` error=${item.error}` : ''}`,
      );

      const finished = result.processed >= result.total;
      const finishedAt = finished ? new Date() : null;
      const hardFailed =
        finished &&
        result.ready === 0 &&
        result.pending_batch === 0 &&
        result.failed + result.cms_failed === result.total;

      await tx.jobLog.update({
        where: { id: logId },
        data: {
          result: result as object,
          ...(finished
            ? {
                status: hardFailed ? JobStatus.FAILED : JobStatus.COMPLETED,
                finished_at: finishedAt,
                duration_ms: log.started_at
                  ? (finishedAt!.getTime() - log.started_at.getTime())
                  : null,
                error_message: hardFailed
                  ? `Content production failed for all ${result.total} properties`
                  : result.failed + result.cms_failed > 0
                    ? `Completed with ${result.failed + result.cms_failed} failures`
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
