import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { JobStatus, Prisma } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CRM_IMAGE_SYNC_QUEUE } from '@/core/queues/queues.constants';
import { CrmImageSyncService } from '@/modules/user-properties/services/crm-image-sync.service';
import {
  CrmImageSyncItemResult,
  CrmImageSyncJobData,
  CrmImageSyncJobResult,
} from '@/modules/user-properties/interfaces/crm-image-sync.interface';

// One job per property, so two workers never edit the same EstateWeb gallery
// (and its cached copy) at the same time.
const CRM_IMAGE_SYNC_WORKER_CONCURRENCY = 3;

// Prisma's default 5s interactive-transaction timeout was exceeded under
// concurrency on the sibling cleanup processors; keep the bookkeeping
// transaction generous.
const JOB_LOG_TRANSACTION_TIMEOUT_MS = 20000;

@Processor(CRM_IMAGE_SYNC_QUEUE, {
  concurrency: CRM_IMAGE_SYNC_WORKER_CONCURRENCY,
})
export class CrmImageSyncProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(CrmImageSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crmImageSyncService: CrmImageSyncService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.worker.concurrency = CRM_IMAGE_SYNC_WORKER_CONCURRENCY;
  }

  async process(job: Job<CrmImageSyncJobData>): Promise<void> {
    const { job_log_id, user_property_id, total } = job.data;
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

    await this.markActive(job_log_id, total);

    try {
      const item =
        await this.crmImageSyncService.processProperty(user_property_id);
      await this.recordItemResult(job_log_id, item, total);
      this.logger.log(
        `[process] job_log=${job_log_id} user_property=${user_property_id} status=${item.status} deleted=${item.deleted} uploaded=${item.uploaded}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[process] job_log=${job_log_id} user_property=${user_property_id} attempt=${job.attemptsMade + 1} failed: ${message}`,
      );
      // Retries are safe (the sync is idempotent); only the final attempt
      // counts as a failed item, so a retried-then-succeeded property isn't
      // double-counted.
      if (isLastAttempt) {
        await this.recordItemResult(
          job_log_id,
          {
            user_property_id,
            status: 'failed',
            local_changed: false,
            crm_before: 0,
            crm_after: 0,
            desired: 0,
            deleted: 0,
            uploaded: 0,
            upload_failed: 0,
            error: message,
          },
          total,
        );
      }
      throw error;
    }
  }

  private emptyResult(total: number): CrmImageSyncJobResult {
    return {
      total,
      processed: 0,
      reconciled: 0,
      in_sync: 0,
      skipped: 0,
      failed: 0,
      deleted: 0,
      uploaded: 0,
      items: [],
      logs: [],
    };
  }

  private async markActive(logId: string, total: number): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT id FROM job_logs WHERE id = ${logId} FOR UPDATE`,
        );
        const log = await tx.jobLog.findUnique({ where: { id: logId } });
        if (!log || log.status === JobStatus.ACTIVE) return;
        await tx.jobLog.update({
          where: { id: logId },
          data: {
            status:
              log.status === JobStatus.WAITING ||
              log.status === JobStatus.DELAYED
                ? JobStatus.ACTIVE
                : log.status,
            started_at: log.started_at ?? new Date(),
            result: (log.result ?? this.emptyResult(total)) as object,
          },
        });
      },
      { timeout: JOB_LOG_TRANSACTION_TIMEOUT_MS },
    );
  }

  private async recordItemResult(
    logId: string,
    item: CrmImageSyncItemResult,
    total: number,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT id FROM job_logs WHERE id = ${logId} FOR UPDATE`,
        );
        const log = await tx.jobLog.findUnique({ where: { id: logId } });
        if (!log) return;

        const result =
          (log.result as unknown as CrmImageSyncJobResult | null) ??
          this.emptyResult(total);
        const index = result.items.findIndex(
          (row) => row.user_property_id === item.user_property_id,
        );
        if (index >= 0) result.items[index] = item;
        else {
          result.items.push(item);
          result.processed += 1;
        }

        result.reconciled = result.items.filter(
          (row) => row.status === 'reconciled',
        ).length;
        result.in_sync = result.items.filter(
          (row) => row.status === 'in_sync',
        ).length;
        result.skipped = result.items.filter(
          (row) => row.status === 'skipped',
        ).length;
        result.failed = result.items.filter(
          (row) => row.status === 'failed',
        ).length;
        result.deleted = result.items.reduce(
          (sum, row) => sum + row.deleted,
          0,
        );
        result.uploaded = result.items.reduce(
          (sum, row) => sum + row.uploaded,
          0,
        );
        if (item.status !== 'in_sync') {
          result.logs.push(
            `user_property=${item.user_property_id} status=${item.status}${item.skip_reason ? ` reason=${item.skip_reason}` : ''} crm ${item.crm_before}->${item.crm_after} deleted=${item.deleted} uploaded=${item.uploaded}${item.upload_failed ? ` upload_failed=${item.upload_failed}` : ''}${item.error ? ` error=${item.error}` : ''}`,
          );
        }

        const finished = result.processed >= result.total;
        const finishedAt = finished ? new Date() : null;
        await tx.jobLog.update({
          where: { id: logId },
          data: {
            result: result as object,
            ...(finished
              ? {
                  status: JobStatus.COMPLETED,
                  finished_at: finishedAt,
                  duration_ms: log.started_at
                    ? finishedAt!.getTime() - log.started_at.getTime()
                    : null,
                  error_message:
                    result.failed > 0
                      ? `Completed with ${result.failed} failures`
                      : null,
                }
              : { status: JobStatus.ACTIVE }),
          },
        });
      },
      { timeout: JOB_LOG_TRANSACTION_TIMEOUT_MS },
    );
  }
}
