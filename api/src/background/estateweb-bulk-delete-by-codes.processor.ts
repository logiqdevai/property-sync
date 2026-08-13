import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { ESTATEWEB_BULK_DELETE_BY_CODES_QUEUE } from '@/core/queues/queues.constants';
import { JobStatus } from 'generated/prisma';
import { EstateWebBulkDeleteByCodesJobService } from '@/modules/estateweb/services/estateweb-bulk-delete-by-codes-job.service';
import {
  EstateWebBulkDeleteByCodesItemResult,
  EstateWebBulkDeleteByCodesJobData,
  EstateWebBulkDeleteByCodesJobResult,
} from '@/modules/estateweb/interfaces/estateweb-bulk-delete-by-codes-job.interface';

const ESTATEWEB_BULK_DELETE_BY_CODES_WORKER_CONCURRENCY = 5;

@Processor(ESTATEWEB_BULK_DELETE_BY_CODES_QUEUE, {
  concurrency: ESTATEWEB_BULK_DELETE_BY_CODES_WORKER_CONCURRENCY,
})
export class EstateWebBulkDeleteByCodesProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(
    EstateWebBulkDeleteByCodesProcessor.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly estateWebBulkDeleteByCodesJobService: EstateWebBulkDeleteByCodesJobService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.worker.concurrency = ESTATEWEB_BULK_DELETE_BY_CODES_WORKER_CONCURRENCY;
  }

  async process(job: Job<EstateWebBulkDeleteByCodesJobData>): Promise<void> {
    const { job_log_id, code, total } = job.data;
    this.logger.log(
      `[process] job_log=${job_log_id} code=${code} attempt=${job.attemptsMade + 1}`,
    );

    await this.ensureJobActive(job_log_id, job, total);

    try {
      const item =
        await this.estateWebBulkDeleteByCodesJobService.processCode(job.data);
      await this.recordItemResult(job_log_id, item, total);
      this.logger.log(
        `[process] job_log=${job_log_id} code=${code} status=${item.status}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[process] job_log=${job_log_id} code=${code} failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.recordItemResult(
        job_log_id,
        {
          code,
          property_id: job.data.property_id,
          status: 'failed',
          error: message,
        },
        total,
      );
      throw error;
    }
  }

  private emptyResult(total: number): EstateWebBulkDeleteByCodesJobResult {
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
    job: Job<EstateWebBulkDeleteByCodesJobData>,
    total: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT id FROM job_logs WHERE id = ${logId} FOR UPDATE`,
      );
      const log = await tx.jobLog.findUnique({ where: { id: logId } });
      if (!log) return;

      const result =
        (log.result as unknown as EstateWebBulkDeleteByCodesJobResult | null) ??
        this.emptyResult(total);
      if (!result.logs) result.logs = [];
      result.logs.push(
        `worker start code=${job.data.code} bull_job_id=${job.id} attempt=${job.attemptsMade + 1}`,
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
    item: EstateWebBulkDeleteByCodesItemResult,
    total: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT id FROM job_logs WHERE id = ${logId} FOR UPDATE`,
      );
      const log = await tx.jobLog.findUnique({ where: { id: logId } });
      if (!log) return;

      const result =
        (log.result as unknown as EstateWebBulkDeleteByCodesJobResult | null) ??
        this.emptyResult(total);

      const already = result.items.some((row) => row.code === item.code);
      if (already) {
        result.items = result.items.map((row) =>
          row.code === item.code ? item : row,
        );
      } else {
        result.items.push(item);
        result.processed += 1;
      }

      result.deleted = result.items.filter(
        (row) => row.status === 'deleted',
      ).length;
      result.failed = result.items.filter(
        (row) => row.status === 'failed',
      ).length;

      if (!result.logs) result.logs = [];
      result.logs.push(
        `code=${item.code} status=${item.status}${item.error ? ` error=${item.error}` : ''}`,
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
                  ? `EstateWeb property deletion failed for all ${result.total} codes`
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
