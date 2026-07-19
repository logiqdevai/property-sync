import { HttpException, Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CMS_SYNC_QUEUE } from '@/core/queues/queues.constants';
import { CmsSyncJobData } from '@/modules/cms-sync/interfaces/cms-sync-job.interface';
import {
  CmsSyncBatchOperation,
  CmsSyncBatchResult,
  CmsSyncOperationResult,
} from '@/modules/cms-sync/interfaces/cms-sync-batch.interface';
import { CmsSyncAdapterFactory } from '@/modules/cms-sync/services/cms-sync-adapter.factory';
import { CmsSyncRunsService } from '@/modules/cms-sync-runs/cms-sync-runs.service';
import { CrawlRunsService } from '@/modules/crawl-runs/crawl-runs.service';
import { CmsSyncAdapter } from '@/modules/cms-sync/interfaces/cms-sync-adapter.interface';
import {
  CmsSyncStatus,
  JobStatus,
  NotificationSeverity,
  NotificationType,
  UserProperty,
} from 'generated/prisma';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { EstateWebException } from '@/integrations/estateweb/exceptions/estateweb.exception';
import {
  EstateWebPropertyCatalog,
  EstateWebPropertyReconciliationService,
} from '@/integrations/estateweb/services/estateweb-property-reconciliation.service';

const CMS_SYNC_WORKER_CONCURRENCY = 1;

interface StoredPayload {
  user_tracked_agency_id: string;
  source_agency_id: string;
  concurrent_insertions: number;
  insertion_interval_minutes: number;
  user_property_ids: string[];
  operations: CmsSyncBatchOperation[];
}

interface StoredResponse {
  failed_property_ids?: string[];
  skipped_duplicate_property_ids?: string[];
  operation_results?: CmsSyncOperationResult[];
}

@Processor(CMS_SYNC_QUEUE, { concurrency: CMS_SYNC_WORKER_CONCURRENCY })
export class CmsSyncProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(CmsSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterFactory: CmsSyncAdapterFactory,
    private readonly cmsSyncRunsService: CmsSyncRunsService,
    private readonly crawlRunsService: CrawlRunsService,
    private readonly notificationsService: NotificationsService,
    private readonly estateWebPropertyReconciliationService: EstateWebPropertyReconciliationService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.worker.concurrency = CMS_SYNC_WORKER_CONCURRENCY;
  }

  async process(job: Job<CmsSyncJobData>): Promise<void> {
    const { cms_sync_run_id } = job.data;
    this.logger.log(`CMS sync job received: ${cms_sync_run_id}`);

    const logId = await this.markJobActive(job);
    const startedAt = new Date();

    try {
      await this.processBatchJob(job);
      await this.markJobCompleted(logId, startedAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`CMS sync job ${cms_sync_run_id} failed: ${message}`);
      await this.markJobFailed(logId, startedAt, message, error);
      throw error;
    }
  }

  private async processBatchJob(job: Job<CmsSyncJobData>): Promise<void> {
    const { cms_sync_run_id, crawl_run_id, user_integration_id } = job.data;

    const syncRun = await this.cmsSyncRunsService.findOneById(cms_sync_run_id);
    const payload = (syncRun.payload ?? {}) as unknown as StoredPayload;
    const previousResponse = (syncRun.response ??
      {}) as unknown as StoredResponse;

    const isRetry =
      syncRun.attempt > 0 &&
      (previousResponse.failed_property_ids?.length ?? 0) > 0;
    const operations = isRetry
      ? this.filterFailedOperations(payload.operations, previousResponse)
      : payload.operations;

    if (operations.length === 0) {
      await this.cmsSyncRunsService.updateBatchResult(cms_sync_run_id, {
        total_created: syncRun.total_created,
        total_updated: syncRun.total_updated,
        total_removed: syncRun.total_removed,
        total_failed: 0,
        response: {
          ...previousResponse,
          failed_property_ids: [],
        },
        status: CmsSyncStatus.SUCCESS,
      });
      await this.crawlRunsService.recalculateCmsSyncTotals(crawl_run_id);
      return;
    }

    const adapter = this.adapterFactory.getAdapter(
      syncRun.user_integration.integration_target.integration_type,
    );

    const userProperties = await this.loadUserProperties(
      operations.map((op) => op.user_property_id),
    );
    const tracker = await this.prisma.userTrackedAgency.findUnique({
      where: { id: payload.user_tracked_agency_id },
    });

    const result = await this.executeOperations(
      adapter,
      user_integration_id,
      operations,
      userProperties,
      tracker?.concurrent_insertions ?? 1,
      tracker?.insertion_interval_minutes ?? 5,
      crawl_run_id,
    );

    const mergedResult = this.mergeWithPreviousResult(previousResponse, result);
    const status =
      mergedResult.failed > 0 ? CmsSyncStatus.FAILED : CmsSyncStatus.SUCCESS;
    const failureSummary = this.formatFailureSummary(mergedResult.responses);

    if (mergedResult.failed > 0) {
      this.logger.error(
        `CmsSyncRun ${cms_sync_run_id}: ${mergedResult.failed} property push(es) failed. ${failureSummary}`,
      );
      for (const op of mergedResult.responses.filter((r) => !r.success)) {
        this.logger.error(
          `CmsSyncRun ${cms_sync_run_id} op failure: property=${op.user_property_id} operation=${op.operation} error=${op.error ?? 'unknown'}`,
        );
      }
    }

    await this.cmsSyncRunsService.updateBatchResult(cms_sync_run_id, {
      total_created: mergedResult.created,
      total_updated: mergedResult.updated,
      total_removed: mergedResult.removed,
      total_failed: mergedResult.failed,
      response: {
        failed_property_ids: mergedResult.failed_property_ids,
        skipped_duplicate_property_ids:
          mergedResult.skipped_duplicate_property_ids,
        operation_results: mergedResult.responses,
      },
      status,
      error_message: mergedResult.failed > 0 ? failureSummary : null,
    });

    await this.crawlRunsService.recalculateCmsSyncTotals(crawl_run_id);

    if (mergedResult.failed > 0) {
      if (syncRun.attempt + 1 >= (syncRun.max_attempts ?? 3)) {
        this.notificationsService.create({
          type: NotificationType.CMS_SYNC_FAILURE,
          severity: NotificationSeverity.CRITICAL,
          title: 'CMS sync batch failed',
          message: `CmsSyncRun ${cms_sync_run_id} exhausted all retries. ${failureSummary}`,
          crawl_run_id: crawl_run_id,
        });
      } else {
        throw new Error(
          `CmsSyncRun ${cms_sync_run_id}: ${mergedResult.failed} property push(es) failed; scheduling retry. ${failureSummary}`,
        );
      }
    }
  }

  private async executeOperations(
    adapter: CmsSyncAdapter,
    userIntegrationId: string,
    operations: CmsSyncBatchOperation[],
    userProperties: Map<string, UserProperty>,
    concurrentInsertions: number,
    insertionIntervalMinutes: number,
    crawlRunId: string,
  ): Promise<CmsSyncBatchResult> {
    const result: CmsSyncBatchResult = {
      created: 0,
      updated: 0,
      removed: 0,
      failed: 0,
      failed_property_ids: [],
      skipped_duplicate_property_ids: [],
      responses: [],
    };

    const sleepMs = insertionIntervalMinutes * 60 * 1000;
    const reconciliationCatalog = await this.loadReconciliationCatalog(
      operations,
      userProperties,
    );

    for (let i = 0; i < operations.length; i += concurrentInsertions) {
      const chunk = operations.slice(i, i + concurrentInsertions);

      const chunkResults = await Promise.all(
        chunk.map((op) =>
          this.executeSingleOperation(
            adapter,
            userIntegrationId,
            op,
            userProperties,
            reconciliationCatalog,
            crawlRunId,
          ),
        ),
      );

      for (const opResult of chunkResults) {
        this.aggregateResult(result, opResult);
      }

      if (i + concurrentInsertions < operations.length && sleepMs > 0) {
        await this.sleep(sleepMs);
      }
    }

    return result;
  }

  private async executeSingleOperation(
    adapter: CmsSyncAdapter,
    userIntegrationId: string,
    operation: CmsSyncBatchOperation,
    userProperties: Map<string, UserProperty>,
    reconciliationCatalog: EstateWebPropertyCatalog | null,
    crawlRunId: string,
  ): Promise<CmsSyncOperationResult> {
    const userProperty = userProperties.get(operation.user_property_id);
    if (!userProperty) {
      return {
        user_property_id: operation.user_property_id,
        operation: operation.operation,
        success: false,
        error: 'User property not found',
      };
    }

    this.logger.log(
      `CMS sync op start: property=${operation.user_property_id} operation=${operation.operation} integration=${userIntegrationId} type_id=${userProperty.estateweb_type_id ?? 'null'} location_id=${userProperty.estateweb_location_id ?? 'null'}`,
    );

    try {
      switch (operation.operation) {
        case 'CREATE': {
          if (!reconciliationCatalog) {
            return {
              user_property_id: operation.user_property_id,
              operation: 'CREATE',
              success: false,
              error:
                'EstateWeb default catalog unavailable; refusing CREATE to avoid duplicates. Ensure a default EstateWeb UserIntegration exists and can list all properties.',
            };
          }

          const reconciled =
            await this.estateWebPropertyReconciliationService.reconcileCreate(
              userProperty,
              reconciliationCatalog,
              crawlRunId,
            );

          if (reconciled.matched && reconciled.integrationPropertyId) {
            const integrationPropertyId = reconciled.integrationPropertyId;
            const pushIntegrationId =
              reconciled.defaultUserIntegrationId ?? userIntegrationId;

            await this.stampIntegrationPropertyId(
              operation.user_property_id,
              operation.duplicate_group_id,
              userProperty.user_id,
              integrationPropertyId,
            );

            if (reconciled.shouldUpdate) {
              await adapter.pushUpdate(
                pushIntegrationId,
                integrationPropertyId,
                userProperty,
              );
              this.logger.log(
                `CMS sync op success: property=${operation.user_property_id} operation=CREATE reconciled=UPDATE integration_property_id=${integrationPropertyId}`,
              );
              return {
                user_property_id: operation.user_property_id,
                operation: 'UPDATE',
                success: true,
                integration_property_id: integrationPropertyId,
                reconciled: true,
              };
            }

            this.logger.log(
              `CMS sync op success: property=${operation.user_property_id} operation=CREATE reconciled=LINK integration_property_id=${integrationPropertyId}`,
            );
            return {
              user_property_id: operation.user_property_id,
              operation: 'CREATE',
              success: true,
              integration_property_id: integrationPropertyId,
              reconciled: true,
              skipped_push: true,
            };
          }

          const createResult = await adapter.pushCreate(
            userIntegrationId,
            userProperty,
          );
          await this.stampIntegrationPropertyId(
            operation.user_property_id,
            operation.duplicate_group_id,
            userProperty.user_id,
            createResult.integration_property_id,
          );
          this.logger.log(
            `CMS sync op success: property=${operation.user_property_id} operation=CREATE integration_property_id=${createResult.integration_property_id}`,
          );
          return {
            user_property_id: operation.user_property_id,
            operation: 'CREATE',
            success: true,
            integration_property_id: createResult.integration_property_id,
          };
        }
        case 'UPDATE': {
          const integrationId =
            userProperty.integration_property_id ??
            (await this.findSharedIntegrationPropertyId(
              operation.duplicate_group_id,
              userProperty.user_id,
            ));
          if (!integrationId) {
            throw new Error('No integration property id for update');
          }
          await adapter.pushUpdate(
            userIntegrationId,
            integrationId,
            userProperty,
          );
          await this.stampIntegrationPropertyId(
            operation.user_property_id,
            operation.duplicate_group_id,
            userProperty.user_id,
            integrationId,
          );
          this.logger.log(
            `CMS sync op success: property=${operation.user_property_id} operation=UPDATE integration_property_id=${integrationId}`,
          );
          return {
            user_property_id: operation.user_property_id,
            operation: 'UPDATE',
            success: true,
            integration_property_id: integrationId,
          };
        }
        case 'REMOVE': {
          const integrationId = userProperty.integration_property_id;
          if (!integrationId) {
            return {
              user_property_id: operation.user_property_id,
              operation: 'REMOVE',
              success: false,
              error: 'No integration property id for remove',
            };
          }
          await adapter.pushRemove(userIntegrationId, integrationId);
          await this.clearIntegrationPropertyId(
            operation.duplicate_group_id,
            userProperty.user_id,
          );
          this.logger.log(
            `CMS sync op success: property=${operation.user_property_id} operation=REMOVE integration_property_id=${integrationId}`,
          );
          return {
            user_property_id: operation.user_property_id,
            operation: 'REMOVE',
            success: true,
            integration_property_id: null,
          };
        }
      }
    } catch (error) {
      const message = this.extractErrorMessage(error);
      this.logger.error(
        `CMS sync op failed: property=${operation.user_property_id} operation=${operation.operation} error=${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        user_property_id: operation.user_property_id,
        operation: operation.operation,
        success: false,
        error: message,
      };
    }
  }

  private formatFailureSummary(
    responses: CmsSyncOperationResult[],
  ): string {
    const failures = responses.filter((op) => !op.success);
    if (failures.length === 0) {
      return 'Some properties failed to sync';
    }

    return failures
      .map(
        (op) =>
          `${op.user_property_id}[${op.operation}]: ${op.error ?? 'unknown error'}`,
      )
      .join(' | ');
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof EstateWebException) {
      const response = error.getResponse();
      const bodyMessage =
        typeof response === 'object' &&
        response !== null &&
        'message' in response &&
        typeof (response as { message: unknown }).message === 'string'
          ? (response as { message: string }).message
          : error.message;
      const details =
        error.details && Object.keys(error.details).length > 0
          ? ` details=${JSON.stringify(error.details)}`
          : '';
      return `${error.code}: ${bodyMessage}${details}`;
    }

    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (
        typeof response === 'object' &&
        response !== null &&
        'message' in response
      ) {
        const message = (response as { message?: unknown }).message;
        if (typeof message === 'string') return message;
        if (Array.isArray(message)) return message.join(', ');
      }
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private async stampIntegrationPropertyId(
    userPropertyId: string,
    duplicateGroupId: string | null,
    userId: string,
    integrationPropertyId: string,
  ): Promise<void> {
    if (!duplicateGroupId) {
      await this.prisma.userProperty.updateMany({
        where: { user_id: userId, id: userPropertyId },
        data: {
          integration_property_id: integrationPropertyId,
          pending_crm_update: false,
        },
      });
      return;
    }

    await this.prisma.userProperty.updateMany({
      where: {
        user_id: userId,
        OR: [
          { duplicate_group_id: duplicateGroupId },
          { canonical_property: { duplicate_group_id: duplicateGroupId } },
        ],
      },
      data: {
        integration_property_id: integrationPropertyId,
        pending_crm_update: false,
      },
    });
  }

  private async clearIntegrationPropertyId(
    duplicateGroupId: string | null,
    userId: string,
  ): Promise<void> {
    if (!duplicateGroupId) return;

    await this.prisma.userProperty.updateMany({
      where: {
        user_id: userId,
        OR: [
          { duplicate_group_id: duplicateGroupId },
          { canonical_property: { duplicate_group_id: duplicateGroupId } },
        ],
      },
      data: { integration_property_id: null },
    });
  }

  private async findSharedIntegrationPropertyId(
    duplicateGroupId: string | null,
    userId: string,
  ): Promise<string | null> {
    if (!duplicateGroupId) return null;

    const member = await this.prisma.userProperty.findFirst({
      where: {
        user_id: userId,
        integration_property_id: { not: null },
        OR: [
          { duplicate_group_id: duplicateGroupId },
          { canonical_property: { duplicate_group_id: duplicateGroupId } },
        ],
      },
      select: { integration_property_id: true },
    });

    return member?.integration_property_id ?? null;
  }

  private async loadUserProperties(
    ids: string[],
  ): Promise<Map<string, UserProperty>> {
    const rows = await this.prisma.userProperty.findMany({
      where: { id: { in: [...new Set(ids)] } },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  private filterFailedOperations(
    operations: CmsSyncBatchOperation[],
    previousResponse: StoredResponse,
  ): CmsSyncBatchOperation[] {
    const failedIds = new Set(previousResponse.failed_property_ids ?? []);
    return operations.filter((op) => failedIds.has(op.user_property_id));
  }

  private mergeWithPreviousResult(
    previousResponse: StoredResponse,
    currentResult: CmsSyncBatchResult,
  ): CmsSyncBatchResult {
    const previousResults = (previousResponse.operation_results ?? []).filter(
      (op) => op.success,
    );
    const mergedResponses = [...previousResults, ...currentResult.responses];

    const successCounts = previousResults.reduce(
      (acc, op) => {
        if (op.operation === 'CREATE') acc.created++;
        if (op.operation === 'UPDATE') acc.updated++;
        if (op.operation === 'REMOVE') acc.removed++;
        return acc;
      },
      { created: 0, updated: 0, removed: 0 },
    );

    const failedIds = currentResult.responses
      .filter((op) => !op.success)
      .map((op) => op.user_property_id);

    const skippedIds = new Set([
      ...(previousResponse.skipped_duplicate_property_ids ?? []),
      ...currentResult.skipped_duplicate_property_ids,
    ]);

    return {
      created: successCounts.created + currentResult.created,
      updated: successCounts.updated + currentResult.updated,
      removed: successCounts.removed + currentResult.removed,
      failed: failedIds.length,
      failed_property_ids: failedIds,
      skipped_duplicate_property_ids: [...skippedIds],
      responses: mergedResponses,
    };
  }

  private aggregateResult(
    result: CmsSyncBatchResult,
    opResult: CmsSyncOperationResult,
  ): void {
    result.responses.push(opResult);

    if (!opResult.success) {
      result.failed++;
      result.failed_property_ids.push(opResult.user_property_id);
      return;
    }

    switch (opResult.operation) {
      case 'CREATE':
        if (opResult.skipped_push) {
          break;
        }
        result.created++;
        break;
      case 'UPDATE':
        result.updated++;
        break;
      case 'REMOVE':
        result.removed++;
        break;
    }
  }

  private async loadReconciliationCatalog(
    operations: CmsSyncBatchOperation[],
    userProperties: Map<string, UserProperty>,
  ): Promise<EstateWebPropertyCatalog | null> {
    const hasCreate = operations.some((op) => op.operation === 'CREATE');
    if (!hasCreate) {
      return null;
    }

    const createUserIds = new Set<string>();
    for (const operation of operations) {
      if (operation.operation !== 'CREATE') continue;
      const userProperty = userProperties.get(operation.user_property_id);
      if (userProperty) {
        createUserIds.add(userProperty.user_id);
      }
    }

    if (createUserIds.size !== 1) {
      this.logger.warn(
        'Skipping EstateWeb reconciliation catalog load for mixed-user CMS batch',
      );
      return null;
    }

    const [userId] = createUserIds;
    return this.estateWebPropertyReconciliationService.loadCatalog(userId);
  }

  private async markJobActive(job: Job<CmsSyncJobData>): Promise<string> {
    const jobLog = await this.prisma.jobLog.create({
      data: {
        queue_name: CMS_SYNC_QUEUE,
        job_id: job.id ?? null,
        job_name: job.name ?? 'cms-sync',
        status: JobStatus.ACTIVE,
        attempt: job.attemptsMade + 1,
        max_attempts: job.opts.attempts ?? null,
        crawl_run_id: job.data.crawl_run_id,
        payload: job.data as object,
        started_at: new Date(),
      },
    });
    return jobLog.id;
  }

  private async markJobCompleted(
    logId: string,
    startedAt: Date,
  ): Promise<void> {
    const finishedAt = new Date();
    await this.prisma.jobLog.update({
      where: { id: logId },
      data: {
        status: JobStatus.COMPLETED,
        finished_at: finishedAt,
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
      },
    });
  }

  private async markJobFailed(
    logId: string,
    startedAt: Date,
    message: string,
    error: unknown,
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
      },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
