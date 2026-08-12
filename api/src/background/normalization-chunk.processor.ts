import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma, JobStatus } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { NORMALIZATION_QUEUE } from '@/core/queues/queues.constants';
import { PropertyNormalizationService } from '@/modules/properties/services/property-normalization.service';
import { SyncForPropertyResult } from '@/modules/user-properties/user-properties.service';
import {
  NormalizationChunkItemResult,
  NormalizationChunkJobData,
  NormalizationChunkJobResult,
} from '@/modules/properties/interfaces/normalization-chunk-job.interface';

const NORMALIZATION_WORKER_CONCURRENCY = 5;
// One job attempt is now bounded to ~1 AI call (protected by the 90s request
// timeout in AiService) plus DB writes — no nested per-property retry loop —
// so this comfortably covers worst case without needing the ~20min a nested
// retry loop would require.
const NORMALIZATION_JOB_LOCK_DURATION_MS = 10 * 60 * 1000;

const emptyResult = (total: number): NormalizationChunkJobResult => ({
  total,
  processed: 0,
  chunks: [],
  affected: [],
  created_count: 0,
  finalized: false,
  logs: [],
});

@Processor(NORMALIZATION_QUEUE, {
  concurrency: NORMALIZATION_WORKER_CONCURRENCY,
  lockDuration: NORMALIZATION_JOB_LOCK_DURATION_MS,
})
export class NormalizationChunkProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(NormalizationChunkProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly propertyNormalizationService: PropertyNormalizationService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.worker.concurrency = NORMALIZATION_WORKER_CONCURRENCY;
  }

  async process(job: Job<NormalizationChunkJobData>): Promise<void> {
    const { job_log_id, chunk_index, total_chunks } = job.data;
    this.logger.log(
      `[process] job_log=${job_log_id} chunk=${chunk_index}/${total_chunks} attempt=${job.attemptsMade + 1}`,
    );

    await this.ensureJobActive(job_log_id, job, total_chunks);

    const totalAttempts = job.opts.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade + 1 >= totalAttempts;

    try {
      const { item, affected } =
        await this.propertyNormalizationService.processNormalizationChunk(
          job.data,
        );
      await this.recordAndMaybeFinalize(job.data, item, affected);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isFinalAttempt) {
        // Don't record progress yet — an intermediate failed attempt isn't
        // "processed" until it either succeeds on retry or exhausts
        // attempts. Recording here would let `processed >= total` become
        // true while this chunk is still mid-retry, firing finalize (CMS
        // sync + normalization_status='completed') against an incomplete
        // result set.
        this.logger.warn(
          `[process] job_log=${job_log_id} chunk=${chunk_index}/${total_chunks} attempt=${job.attemptsMade + 1} failed, will retry: ${message}`,
        );
        throw error;
      }

      this.logger.error(
        `[process] job_log=${job_log_id} chunk=${chunk_index}/${total_chunks} exhausted retries, falling back: ${message}`,
      );
      const { item, affected } =
        await this.propertyNormalizationService.applyFallbackForChunk(
          job.data,
          error,
        );
      await this.recordAndMaybeFinalize(job.data, item, affected);
      // Don't rethrow: the chunk's properties were written via fallback rows
      // and counted as processed on this terminal attempt — a 4th BullMQ
      // retry would just redo already-completed work.
    }
  }

  private async recordAndMaybeFinalize(
    data: NormalizationChunkJobData,
    item: NormalizationChunkItemResult,
    affected: SyncForPropertyResult[],
  ): Promise<void> {
    const finished = await this.recordChunkResult(
      data.job_log_id,
      item,
      affected,
      data.total_chunks,
    );
    if (finished) {
      await this.propertyNormalizationService.finalizeNormalizationChunks({
        crawlRunId: data.crawl_run_id,
        sourceAgencyId: data.source_agency_id,
        crawlStartedAt: new Date(data.crawl_started_at),
        userTrackedAgencyId: data.user_tracked_agency_id,
        scraperId: data.scraper_id,
        affected: finished.affected,
        createdCount: finished.createdCount,
      });
    }
  }

  private async ensureJobActive(
    logId: string,
    job: Job<NormalizationChunkJobData>,
    totalChunks: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT id FROM job_logs WHERE id = ${logId} FOR UPDATE`,
      );
      const log = await tx.jobLog.findUnique({ where: { id: logId } });
      if (!log) return;

      const result =
        (log.result as unknown as NormalizationChunkJobResult | null) ??
        emptyResult(totalChunks);
      if (!result.logs) result.logs = [];
      result.logs.push(
        `worker start chunk=${job.data.chunk_index} bull_job_id=${job.id} attempt=${job.attemptsMade + 1}`,
      );

      await tx.jobLog.update({
        where: { id: logId },
        data: {
          status:
            log.status === JobStatus.WAITING || log.status === JobStatus.DELAYED
              ? JobStatus.ACTIVE
              : log.status,
          started_at: log.started_at ?? new Date(),
          max_attempts: job.opts.attempts ?? log.max_attempts,
          result: result as object,
        },
      });
    });
  }

  // Locks the shared JobLog row, merges this chunk's result in, and — only
  // when every chunk has now been accounted for (success or terminal
  // failure) — marks the row finalized and returns the accumulated
  // affected/createdCount for the caller to run finalize() with, OUTSIDE
  // this transaction. finalize() does its own separate writes (removals
  // detection, CMS sync enqueue) that must not run while holding this lock.
  // Postgres row-lock serialization means exactly one caller ever observes
  // the finalized:false -> true transition, so this stays race-free even
  // though the side effects run unlocked.
  private async recordChunkResult(
    jobLogId: string,
    item: NormalizationChunkItemResult,
    affected: SyncForPropertyResult[],
    totalChunks: number,
  ): Promise<{
    affected: SyncForPropertyResult[];
    createdCount: number;
  } | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT id FROM job_logs WHERE id = ${jobLogId} FOR UPDATE`,
      );
      const log = await tx.jobLog.findUnique({ where: { id: jobLogId } });
      if (!log) return null;

      const result =
        (log.result as unknown as NormalizationChunkJobResult | null) ??
        emptyResult(totalChunks);

      const alreadyRecorded = result.chunks.some(
        (c) => c.chunk_index === item.chunk_index,
      );
      if (alreadyRecorded) {
        result.chunks = result.chunks.map((c) =>
          c.chunk_index === item.chunk_index ? item : c,
        );
      } else {
        result.chunks.push(item);
        result.processed += 1;
        result.affected.push(...affected);
        result.created_count += item.created_count;
      }

      if (!result.logs) result.logs = [];
      result.logs.push(
        `chunk=${item.chunk_index} status=${item.status}${item.error ? ` error=${item.error}` : ''}`,
      );

      const isNowComplete = result.processed >= result.total;
      const justFinished = isNowComplete && !result.finalized;
      if (justFinished) result.finalized = true;

      const hardFailed =
        isNowComplete &&
        result.chunks.length > 0 &&
        result.chunks.every((c) => c.status === 'failed');

      await tx.jobLog.update({
        where: { id: jobLogId },
        data: {
          result: result as object,
          ...(isNowComplete
            ? {
                status: hardFailed ? JobStatus.FAILED : JobStatus.COMPLETED,
                finished_at: new Date(),
                error_message: hardFailed
                  ? `Normalization failed for all ${result.total} chunk(s)`
                  : null,
              }
            : { status: JobStatus.ACTIVE }),
        },
      });

      return justFinished
        ? { affected: result.affected, createdCount: result.created_count }
        : null;
    });
  }
}
