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
import { EstateWebIntegrationResolverService } from '@/integrations/estateweb/services/estateweb-integration-resolver.service';
import { EstateWebPropertyService } from '@/integrations/estateweb/services/estateweb-property.service';
import { EstateWebClientsService } from '@/integrations/estateweb/services/estateweb-clients.service';
import { CmsSyncPushOptions } from '@/modules/cms-sync/interfaces/cms-sync-adapter.interface';

const CMS_SYNC_WORKER_CONCURRENCY = 1;

interface StoredPayload {
  user_tracked_agency_id: string;
  user_integration_id?: string;
  source_agency_id: string;
  concurrent_insertions: number;
  insertion_interval_seconds: number;
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
    private readonly estateWebIntegrationResolver: EstateWebIntegrationResolverService,
    private readonly estateWebPropertyService: EstateWebPropertyService,
    private readonly estateWebClientsService: EstateWebClientsService,
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
    const { cms_sync_run_id, crawl_run_id } = job.data;

    const syncRun = await this.cmsSyncRunsService.findOneById(cms_sync_run_id);
    const payload = (syncRun.payload ?? {}) as unknown as StoredPayload;
    const previousResponse = (syncRun.response ??
      {}) as unknown as StoredResponse;
    const sourceAgencyId =
      syncRun.crawl_run?.source_agency_id ?? payload.source_agency_id;
    const agencyName = await this.resolveAgencyName(
      sourceAgencyId,
      syncRun.crawl_run?.source_agency?.name,
    );

    const attempt = Math.max(syncRun.attempt, job.attemptsMade + 1);
    await this.cmsSyncRunsService.markAttemptStarted(cms_sync_run_id, attempt);

    const isRetry =
      attempt > 1 &&
      (previousResponse.failed_property_ids?.length ?? 0) > 0;
    const operations = isRetry
      ? this.filterFailedOperations(payload.operations, previousResponse)
      : payload.operations;

    if (operations.length === 0) {
      await this.cmsSyncRunsService.updateBatchResult(cms_sync_run_id, {
        total_created: syncRun.total_created,
        total_updated: syncRun.total_updated,
        total_removed: syncRun.total_removed,
        total_linked: syncRun.total_linked,
        total_failed: 0,
        response: {
          ...previousResponse,
          failed_property_ids: [],
        },
        status: CmsSyncStatus.SUCCESS,
      });
      if (crawl_run_id) {
        await this.crawlRunsService.recalculateCmsSyncTotals(crawl_run_id);
      }
      this.notifySyncCompleted({
        cmsSyncRunId: cms_sync_run_id,
        crawlRunId: crawl_run_id,
        sourceAgencyId,
        agencyName,
        created: syncRun.total_created,
        updated: syncRun.total_updated,
        removed: syncRun.total_removed,
        linked: syncRun.total_linked,
      });
      return;
    }

    const linkedIntegration =
      await this.estateWebIntegrationResolver.resolveForUserTrackedAgencyId(
        payload.user_tracked_agency_id,
      );
    const userIntegrationId = linkedIntegration.userIntegrationId;

    const adapter = this.adapterFactory.getAdapter(
      linkedIntegration.integrationType,
    );

    const userProperties = await this.loadUserProperties(
      operations.map((op) => op.user_property_id),
    );
    const tracker = await this.prisma.userTrackedAgency.findUnique({
      where: { id: payload.user_tracked_agency_id },
      include: { integration_link: true },
    });

    let propertyNote: string | undefined;
    try {
      propertyNote =
        await this.estateWebClientsService.resolvePropertyNoteFromClient(
          tracker?.user_id,
          tracker?.integration_link?.integration_client_id,
        );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to fetch CRM client last name for user=${tracker?.user_id ?? 'n/a'} client=${tracker?.integration_link?.integration_client_id ?? 'n/a'}: ${message}`,
      );
    }

    const result = await this.executeOperations(
      adapter,
      userIntegrationId,
      operations,
      userProperties,
      tracker?.concurrent_insertions ?? 1,
      tracker?.insertion_interval_seconds ?? 1,
      crawl_run_id,
      (tracker?.remove_watermark ?? false) &&
        (tracker?.watermark_manual_selection ?? false),
      propertyNote,
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
      total_linked: mergedResult.linked,
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

    if (crawl_run_id) {
      await this.crawlRunsService.recalculateCmsSyncTotals(crawl_run_id);
    }

    if (mergedResult.failed > 0) {
      if (attempt >= (syncRun.max_attempts ?? 3)) {
        this.notificationsService.create({
          type: NotificationType.CMS_SYNC_FAILURE,
          severity: NotificationSeverity.CRITICAL,
          title: `CMS sync batch failed — ${agencyName}`,
          message: `CmsSyncRun ${cms_sync_run_id} for ${agencyName} exhausted all retries. ${failureSummary}`,
          crawl_run_id: crawl_run_id,
          source_agency_id: sourceAgencyId,
        });
      } else {
        throw new Error(
          `CmsSyncRun ${cms_sync_run_id}: ${mergedResult.failed} property push(es) failed; scheduling retry. ${failureSummary}`,
        );
      }
      return;
    }

    this.notifySyncCompleted({
      cmsSyncRunId: cms_sync_run_id,
      crawlRunId: crawl_run_id,
      sourceAgencyId,
      agencyName,
      created: mergedResult.created,
      updated: mergedResult.updated,
      removed: mergedResult.removed,
      linked: mergedResult.linked,
    });
  }

  private async resolveAgencyName(
    sourceAgencyId: string | undefined,
    knownName?: string | null,
  ): Promise<string> {
    if (knownName) return knownName;
    if (!sourceAgencyId) return 'Unknown agency';

    const agency = await this.prisma.sourceAgency.findUnique({
      where: { id: sourceAgencyId },
      select: { name: true },
    });
    return agency?.name ?? 'Unknown agency';
  }

  private notifySyncCompleted(params: {
    cmsSyncRunId: string;
    crawlRunId: string | null;
    sourceAgencyId?: string;
    agencyName: string;
    created: number;
    updated: number;
    removed: number;
    linked: number;
  }): void {
    const {
      cmsSyncRunId,
      crawlRunId,
      sourceAgencyId,
      agencyName,
      created,
      updated,
      removed,
      linked,
    } = params;
    this.notificationsService.create({
      type: NotificationType.CMS_SYNC_SUCCESS,
      severity: NotificationSeverity.INFO,
      title: `CMS sync completed — ${agencyName}`,
      message: `CmsSyncRun ${cmsSyncRunId} for ${agencyName} completed. Created ${created}, updated ${updated}, linked ${linked}, removed ${removed}.`,
      crawl_run_id: crawlRunId,
      source_agency_id: sourceAgencyId,
    });
  }

  private async executeOperations(
    adapter: CmsSyncAdapter,
    userIntegrationId: string,
    operations: CmsSyncBatchOperation[],
    userProperties: Map<string, UserProperty>,
    concurrentInsertions: number,
    insertionIntervalSeconds: number,
    crawlRunId: string | null,
    watermarkManualSelection: boolean,
    propertyNote?: string,
  ): Promise<CmsSyncBatchResult> {
    const result: CmsSyncBatchResult = {
      created: 0,
      updated: 0,
      removed: 0,
      linked: 0,
      failed: 0,
      failed_property_ids: [],
      skipped_duplicate_property_ids: [],
      responses: [],
    };

    const sleepMs = insertionIntervalSeconds * 1000;
    const reconciliationCatalog = await this.loadReconciliationCatalog(
      operations,
      userIntegrationId,
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
            watermarkManualSelection,
            propertyNote,
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
    crawlRunId: string | null,
    watermarkManualSelection: boolean,
    propertyNote?: string,
  ): Promise<CmsSyncOperationResult> {
    const userProperty = userProperties.get(operation.user_property_id);
    if (!userProperty) {
      return {
        user_property_id: operation.user_property_id,
        operation: operation.operation,
        success: false,
        property_title: null,
        error: 'User property not found',
      };
    }

    const propertyTitle = userProperty.title;

    this.logger.log(
      `CMS sync op start: property=${operation.user_property_id} operation=${operation.operation} integration=${userIntegrationId} type_id=${userProperty.estateweb_type_id ?? 'null'} location_id=${userProperty.estateweb_location_id ?? 'null'}`,
    );

    const pushOptions: CmsSyncPushOptions = {
      watermarkManualSelection,
      ...(propertyNote ? { propertyNote } : {}),
    };

    try {
      switch (operation.operation) {
        case 'CREATE': {
          if (!reconciliationCatalog) {
            return {
              user_property_id: operation.user_property_id,
              operation: 'CREATE',
              success: false,
              property_title: propertyTitle,
              error:
                'EstateWeb reconciliation catalog unavailable; refusing CREATE to avoid duplicates. Ensure the linked EstateWeb integration can list properties.',
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

            await this.stampIntegrationPropertyId(
              operation.user_property_id,
              operation.duplicate_group_id,
              userProperty.user_id,
              integrationPropertyId,
            );

            if (reconciled.shouldUpdate) {
              await adapter.pushUpdate(
                userIntegrationId,
                integrationPropertyId,
                userProperty,
                pushOptions,
              );
              this.logger.log(
                `CMS sync op success: property=${operation.user_property_id} operation=CREATE reconciled=UPDATE integration_property_id=${integrationPropertyId}`,
              );
              return {
                user_property_id: operation.user_property_id,
                operation: 'UPDATE',
                success: true,
                property_title: propertyTitle,
                integration_property_id: integrationPropertyId,
                reconciled: true,
              };
            }

            await this.backfillImagesCache(
              adapter,
              userIntegrationId,
              integrationPropertyId,
              operation.user_property_id,
            );

            this.logger.log(
              `CMS sync op success: property=${operation.user_property_id} operation=CREATE reconciled=LINK integration_property_id=${integrationPropertyId}`,
            );
            return {
              user_property_id: operation.user_property_id,
              operation: 'CREATE',
              success: true,
              property_title: propertyTitle,
              integration_property_id: integrationPropertyId,
              reconciled: true,
              skipped_push: true,
            };
          }

          const createResult = await adapter.pushCreate(
            userIntegrationId,
            userProperty,
            pushOptions,
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
            property_title: propertyTitle,
            integration_property_id: createResult.integration_property_id,
          };
        }
        case 'UPDATE': {
          const integrationId = userProperty.integration_property_id;
          if (!integrationId) {
            throw new Error('No integration property id for update');
          }

          const belongsToLinkedAccount =
            await this.listingBelongsToIntegration(
              userIntegrationId,
              integrationId,
              userProperty.internal_id,
            );

          if (!belongsToLinkedAccount) {
            await this.clearIntegrationPropertyId(operation.user_property_id);
            userProperty.integration_property_id = null;

            const createResult = await adapter.pushCreate(
              userIntegrationId,
              userProperty,
              pushOptions,
            );
            await this.stampIntegrationPropertyId(
              operation.user_property_id,
              operation.duplicate_group_id,
              userProperty.user_id,
              createResult.integration_property_id,
            );
            this.logger.log(
              `CMS sync op success: property=${operation.user_property_id} operation=UPDATE->CREATE integration_property_id=${createResult.integration_property_id}`,
            );
            return {
              user_property_id: operation.user_property_id,
              operation: 'CREATE',
              success: true,
              property_title: propertyTitle,
              integration_property_id: createResult.integration_property_id,
            };
          }

          await adapter.pushUpdate(
            userIntegrationId,
            integrationId,
            userProperty,
            pushOptions,
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
            property_title: propertyTitle,
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
              property_title: propertyTitle,
              error: 'No integration property id for remove',
            };
          }
          await adapter.pushRemove(
            userIntegrationId,
            integrationId,
            userProperty,
          );
          this.logger.log(
            `CMS sync op success: property=${operation.user_property_id} operation=REMOVE integration_property_id=${integrationId}`,
          );
          return {
            user_property_id: operation.user_property_id,
            operation: 'REMOVE',
            success: true,
            property_title: propertyTitle,
            integration_property_id: integrationId,
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
        property_title: propertyTitle,
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

  private async listingBelongsToIntegration(
    userIntegrationId: string,
    integrationPropertyId: string,
    internalId: string | null,
  ): Promise<boolean> {
    try {
      const listing = await this.estateWebPropertyService.getProperty(
        userIntegrationId,
        integrationPropertyId,
      );
      if (!internalId?.trim()) {
        return true;
      }
      const listingCode = listing.code?.trim().toLowerCase() ?? '';
      return listingCode === internalId.trim().toLowerCase();
    } catch {
      return false;
    }
  }

  private async clearIntegrationPropertyId(userPropertyId: string): Promise<void> {
    await this.prisma.userProperty.update({
      where: { id: userPropertyId },
      data: { integration_property_id: null },
    });
  }

  private async backfillImagesCache(
    adapter: CmsSyncAdapter,
    userIntegrationId: string,
    integrationPropertyId: string,
    userPropertyId: string,
  ): Promise<void> {
    try {
      await adapter.ensureImagesCached?.({
        userIntegrationId,
        crmPropertyId: integrationPropertyId,
        userPropertyId,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to backfill cached images: property=${userPropertyId} integration_property_id=${integrationPropertyId} error=${this.extractErrorMessage(error)}`,
      );
    }
  }

  private async stampIntegrationPropertyId(
    userPropertyId: string,
    _duplicateGroupId: string | null,
    userId: string,
    integrationPropertyId: string,
  ): Promise<void> {
    await this.prisma.userProperty.updateMany({
      where: { user_id: userId, id: userPropertyId },
      data: {
        integration_property_id: integrationPropertyId,
        pending_crm_update: false,
      },
    });
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
        if (op.skipped_push) {
          acc.linked++;
          return acc;
        }
        if (op.operation === 'CREATE') acc.created++;
        if (op.operation === 'UPDATE') acc.updated++;
        if (op.operation === 'REMOVE') acc.removed++;
        return acc;
      },
      { created: 0, updated: 0, removed: 0, linked: 0 },
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
      linked: successCounts.linked + currentResult.linked,
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

    if (opResult.skipped_push) {
      result.linked++;
      return;
    }

    switch (opResult.operation) {
      case 'CREATE':
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
    userIntegrationId: string,
  ): Promise<EstateWebPropertyCatalog | null> {
    const hasCreate = operations.some((op) => op.operation === 'CREATE');
    if (!hasCreate) {
      return null;
    }

    return this.estateWebPropertyReconciliationService.loadCatalog(
      userIntegrationId,
    );
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
