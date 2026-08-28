import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import {
  CRAWL_QUEUE,
  GENERATION_QUEUE,
  CONTENT_PRODUCTION_QUEUE,
  CMS_SYNC_QUEUE,
  CRM_CLIENT_NOTES_SYNC_QUEUE,
  DELETE_INTEGRATION_IMAGES_QUEUE,
  ESTATEWEB_SITES_UPDATE_QUEUE,
  MIGRATE_INTEGRATION_IMAGES_QUEUE,
  PUSH_TO_CMS_QUEUE,
  RENORMALIZATION_QUEUE,
  SALES_PRICE_UPDATE_QUEUE,
  WATERMARK_REMOVAL_QUEUE,
} from '@/core/queues/queues.constants';
import {
  DEFAULT_CRAWL_JOB_ATTEMPTS,
  DEFAULT_CRAWL_JOB_BACKOFF_MS,
} from '@/integrations/crawler/constants/crawler.constants';
import { CmsSyncStatus, JobStatus, Prisma } from 'generated/prisma';
import { JobLogQueryType } from './dto/job-log-query.schema';
import { PaginatedResult } from './interfaces/job-log.interface';

const ACTIVE_JOB_STATUSES: JobStatus[] = [
  JobStatus.WAITING,
  JobStatus.ACTIVE,
  JobStatus.DELAYED,
  JobStatus.PAUSED,
];

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(GENERATION_QUEUE)
    private readonly generationQueue: Queue,
    @InjectQueue(CRAWL_QUEUE) private readonly crawlQueue: Queue,
    @InjectQueue(WATERMARK_REMOVAL_QUEUE)
    private readonly watermarkRemovalQueue: Queue,
    @InjectQueue(CONTENT_PRODUCTION_QUEUE)
    private readonly contentProductionQueue: Queue,
    @InjectQueue(SALES_PRICE_UPDATE_QUEUE)
    private readonly salesPriceUpdateQueue: Queue,
    @InjectQueue(PUSH_TO_CMS_QUEUE)
    private readonly pushToCmsQueue: Queue,
    @InjectQueue(CRM_CLIENT_NOTES_SYNC_QUEUE)
    private readonly crmClientNotesSyncQueue: Queue,
    @InjectQueue(ESTATEWEB_SITES_UPDATE_QUEUE)
    private readonly estateWebSitesUpdateQueue: Queue,
    @InjectQueue(RENORMALIZATION_QUEUE)
    private readonly renormalizationQueue: Queue,
    @InjectQueue(DELETE_INTEGRATION_IMAGES_QUEUE)
    private readonly deleteIntegrationImagesQueue: Queue,
    @InjectQueue(MIGRATE_INTEGRATION_IMAGES_QUEUE)
    private readonly migrateIntegrationImagesQueue: Queue,
    @InjectQueue(CMS_SYNC_QUEUE)
    private readonly cmsSyncQueue: Queue,
  ) {}

  async findAll(query: JobLogQueryType): Promise<PaginatedResult<any>> {
    const where: Prisma.JobLogWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.queue_name && { queue_name: query.queue_name }),
      ...(query.date_from || query.date_to
        ? {
            created_at: {
              ...(query.date_from && { gte: query.date_from }),
              ...(query.date_to && { lte: query.date_to }),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.jobLog.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.jobLog.count({ where }),
    ]);

    return {
      data: items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        total_pages: Math.ceil(total / query.limit),
        has_next: query.page < Math.ceil(total / query.limit),
        has_prev: query.page > 1,
      },
    };
  }

  async findOne(id: string) {
    const job = await this.prisma.jobLog.findUnique({ where: { id } });

    if (!job) {
      throw new NotFoundException('Job log not found');
    }

    return job;
  }

  async retry(id: string) {
    const jobLog = await this.prisma.jobLog.findUnique({ where: { id } });

    if (!jobLog) {
      throw new NotFoundException('Job log not found');
    }

    if (!jobLog.payload || typeof jobLog.payload !== 'object') {
      throw new BadRequestException('Job log has no payload to retry');
    }

    const queue = this.resolveQueue(jobLog.queue_name);
    const nextAttempt = jobLog.attempt + 1;
    const payload = jobLog.payload as Record<string, unknown>;

    await this.prisma.jobLog.update({
      where: { id },
      data: {
        status: JobStatus.WAITING,
        attempt: nextAttempt,
        started_at: null,
        finished_at: null,
        duration_ms: null,
        error_message: null,
        stack_trace: null,
        result: null,
      },
    });

    const enrichedPayload =
      jobLog.queue_name === CRAWL_QUEUE
        ? { ...payload, jobLogId: jobLog.id }
        : payload;

    const jobOptions =
      jobLog.queue_name === CRAWL_QUEUE
        ? {
            attempts: DEFAULT_CRAWL_JOB_ATTEMPTS,
            backoff: {
              type: 'exponential' as const,
              delay: DEFAULT_CRAWL_JOB_BACKOFF_MS,
            },
          }
        : jobLog.queue_name === WATERMARK_REMOVAL_QUEUE ||
            jobLog.queue_name === CONTENT_PRODUCTION_QUEUE ||
            jobLog.queue_name === SALES_PRICE_UPDATE_QUEUE ||
            jobLog.queue_name === PUSH_TO_CMS_QUEUE ||
            jobLog.queue_name === CRM_CLIENT_NOTES_SYNC_QUEUE ||
            jobLog.queue_name === ESTATEWEB_SITES_UPDATE_QUEUE ||
            jobLog.queue_name === RENORMALIZATION_QUEUE ||
            jobLog.queue_name === DELETE_INTEGRATION_IMAGES_QUEUE ||
            jobLog.queue_name === MIGRATE_INTEGRATION_IMAGES_QUEUE ||
            jobLog.queue_name === CMS_SYNC_QUEUE
          ? {
              attempts: 3,
              backoff: { type: 'exponential' as const, delay: 5000 },
              removeOnComplete: 100,
              removeOnFail: 200,
            }
          : undefined;

    if (jobLog.queue_name === CMS_SYNC_QUEUE) {
      const payloadRecord = payload as {
        cms_sync_run_id?: string;
        user_tracked_agency_id?: string;
        user_integration_id?: string;
        crawl_run_id?: string | null;
      };
      if (!payloadRecord.cms_sync_run_id) {
        throw new BadRequestException(
          'CMS sync job payload is missing cms_sync_run_id',
        );
      }

      const syncRun = await this.prisma.cmsSyncRun.findUnique({
        where: { id: payloadRecord.cms_sync_run_id },
        select: { id: true },
      });
      if (!syncRun) {
        throw new NotFoundException('CMS sync run not found');
      }

      await this.prisma.cmsSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status: CmsSyncStatus.RETRYING,
          error_message: null,
          started_at: new Date(),
          finished_at: null,
        },
      });

      await this.cmsSyncQueue.add(
        jobLog.job_name ?? 'cms-sync',
        {
          cms_sync_run_id: payloadRecord.cms_sync_run_id,
          user_tracked_agency_id: payloadRecord.user_tracked_agency_id ?? '',
          user_integration_id: payloadRecord.user_integration_id ?? '',
          crawl_run_id: payloadRecord.crawl_run_id ?? null,
        },
        jobOptions,
      );

      return this.prisma.jobLog.update({
        where: { id },
        data: {
          status: JobStatus.COMPLETED,
          finished_at: new Date(),
          duration_ms: 0,
          result: {
            requeued: true,
            cms_sync_run_id: payloadRecord.cms_sync_run_id,
          },
        },
      });
    }

    if (jobLog.queue_name === SALES_PRICE_UPDATE_QUEUE) {
      const payloadRecord = payload as {
        user_id?: string;
        user_property_ids?: string[];
        total?: number;
      };
      const propertyIds = Array.isArray(payloadRecord.user_property_ids)
        ? payloadRecord.user_property_ids
        : [];
      if (!payloadRecord.user_id || propertyIds.length === 0) {
        throw new BadRequestException(
          'Sales price update job payload is missing user or property ids',
        );
      }
      await this.salesPriceUpdateQueue.addBulk(
        propertyIds.map((userPropertyId) => ({
          name: jobLog.job_name ?? 'update-sales-price',
          data: {
            job_log_id: jobLog.id,
            user_id: payloadRecord.user_id,
            user_property_id: userPropertyId,
            total: payloadRecord.total ?? propertyIds.length,
          },
          opts: {
            ...(jobOptions ?? {}),
            jobId: `${jobLog.id}__${userPropertyId}`,
          },
        })),
      );
      return this.findOne(id);
    }

    if (jobLog.queue_name === PUSH_TO_CMS_QUEUE) {
      const payloadRecord = payload as {
        user_id?: string;
        user_property_ids?: string[];
        total?: number;
      };
      const propertyIds = Array.isArray(payloadRecord.user_property_ids)
        ? payloadRecord.user_property_ids
        : [];
      if (!payloadRecord.user_id || propertyIds.length === 0) {
        throw new BadRequestException(
          'Push to CMS job payload is missing user or property ids',
        );
      }
      await this.pushToCmsQueue.addBulk(
        propertyIds.map((userPropertyId) => ({
          name: jobLog.job_name ?? 'push-to-cms',
          data: {
            job_log_id: jobLog.id,
            user_id: payloadRecord.user_id,
            user_property_id: userPropertyId,
            total: payloadRecord.total ?? propertyIds.length,
          },
          opts: {
            ...(jobOptions ?? {}),
            jobId: `${jobLog.id}__${userPropertyId}`,
          },
        })),
      );
      return this.findOne(id);
    }

    if (jobLog.queue_name === CRM_CLIENT_NOTES_SYNC_QUEUE) {
      const payloadRecord = payload as {
        user_id?: string;
        user_property_ids?: string[];
        total?: number;
      };
      const propertyIds = Array.isArray(payloadRecord.user_property_ids)
        ? payloadRecord.user_property_ids
        : [];
      if (!payloadRecord.user_id || propertyIds.length === 0) {
        throw new BadRequestException(
          'CRM client notes sync job payload is missing user or property ids',
        );
      }
      await this.crmClientNotesSyncQueue.addBulk(
        propertyIds.map((userPropertyId) => ({
          name: jobLog.job_name ?? 'sync-crm-client-notes',
          data: {
            job_log_id: jobLog.id,
            user_id: payloadRecord.user_id,
            user_property_id: userPropertyId,
            total: payloadRecord.total ?? propertyIds.length,
          },
          opts: {
            ...(jobOptions ?? {}),
            jobId: `${jobLog.id}__${userPropertyId}`,
          },
        })),
      );
      return this.findOne(id);
    }

    if (jobLog.queue_name === DELETE_INTEGRATION_IMAGES_QUEUE) {
      const payloadRecord = payload as {
        user_id?: string;
        user_property_ids?: string[];
        total?: number;
      };
      const propertyIds = Array.isArray(payloadRecord.user_property_ids)
        ? payloadRecord.user_property_ids
        : [];
      if (!payloadRecord.user_id || propertyIds.length === 0) {
        throw new BadRequestException(
          'Delete integration images job payload is missing user or property ids',
        );
      }
      await this.deleteIntegrationImagesQueue.addBulk(
        propertyIds.map((userPropertyId) => ({
          name: jobLog.job_name ?? 'delete-integration-images',
          data: {
            job_log_id: jobLog.id,
            user_id: payloadRecord.user_id,
            user_property_id: userPropertyId,
            total: payloadRecord.total ?? propertyIds.length,
          },
          opts: {
            ...(jobOptions ?? {}),
            jobId: `${jobLog.id}__${userPropertyId}`,
          },
        })),
      );
      return this.findOne(id);
    }

    if (jobLog.queue_name === MIGRATE_INTEGRATION_IMAGES_QUEUE) {
      const payloadRecord = payload as {
        user_id?: string;
        user_property_ids?: string[];
        mode?: string;
        total?: number;
      };
      const propertyIds = Array.isArray(payloadRecord.user_property_ids)
        ? payloadRecord.user_property_ids
        : [];
      if (!payloadRecord.user_id || propertyIds.length === 0) {
        throw new BadRequestException(
          'Migrate integration images job payload is missing user or property ids',
        );
      }
      if (!payloadRecord.mode) {
        throw new BadRequestException(
          'Migrate integration images job payload is missing mode',
        );
      }
      await this.migrateIntegrationImagesQueue.addBulk(
        propertyIds.map((userPropertyId) => ({
          name: jobLog.job_name ?? 'migrate-integration-images',
          data: {
            job_log_id: jobLog.id,
            user_id: payloadRecord.user_id,
            user_property_id: userPropertyId,
            mode: payloadRecord.mode,
            total: payloadRecord.total ?? propertyIds.length,
          },
          opts: {
            ...(jobOptions ?? {}),
            jobId: `${jobLog.id}__${userPropertyId}`,
          },
        })),
      );
      return this.findOne(id);
    }

    if (jobLog.queue_name === ESTATEWEB_SITES_UPDATE_QUEUE) {
      const payloadRecord = payload as {
        user_id?: string;
        user_property_ids?: string[];
        total?: number;
        sites?: unknown[];
      };
      const propertyIds = Array.isArray(payloadRecord.user_property_ids)
        ? payloadRecord.user_property_ids
        : [];
      if (!payloadRecord.user_id || propertyIds.length === 0) {
        throw new BadRequestException(
          'EstateWeb sites update job payload is missing user or property ids',
        );
      }
      const sites = Array.isArray(payloadRecord.sites)
        ? payloadRecord.sites
        : [];
      await this.estateWebSitesUpdateQueue.addBulk(
        propertyIds.map((userPropertyId) => ({
          name: jobLog.job_name ?? 'update-estateweb-sites',
          data: {
            job_log_id: jobLog.id,
            user_id: payloadRecord.user_id,
            user_property_id: userPropertyId,
            total: payloadRecord.total ?? propertyIds.length,
            sites,
          },
          opts: {
            ...(jobOptions ?? {}),
            jobId: `${jobLog.id}__${userPropertyId}`,
          },
        })),
      );
      return this.findOne(id);
    }

    if (jobLog.queue_name === CONTENT_PRODUCTION_QUEUE) {
      const payloadRecord = payload as {
        user_id?: string;
        user_property_ids?: string[];
        run_translations?: boolean;
        run_ai_titles?: boolean;
        use_ai_batch?: boolean;
        regenerate?: boolean;
        push_to_crm?: boolean;
        total?: number;
      };
      const propertyIds = Array.isArray(payloadRecord.user_property_ids)
        ? payloadRecord.user_property_ids
        : [];
      if (!payloadRecord.user_id || propertyIds.length === 0) {
        throw new BadRequestException(
          'Content production job payload is missing user or property ids',
        );
      }
      await this.contentProductionQueue.addBulk(
        propertyIds.map((userPropertyId) => ({
          name: jobLog.job_name ?? 'produce-content',
          data: {
            job_log_id: jobLog.id,
            user_id: payloadRecord.user_id,
            user_property_id: userPropertyId,
            run_translations: payloadRecord.run_translations ?? true,
            run_ai_titles: payloadRecord.run_ai_titles ?? true,
            use_ai_batch: payloadRecord.use_ai_batch ?? false,
            regenerate: payloadRecord.regenerate ?? true,
            push_to_crm: payloadRecord.push_to_crm ?? true,
            total: payloadRecord.total ?? propertyIds.length,
          },
          opts: {
            ...(jobOptions ?? {}),
            jobId: `${jobLog.id}__${userPropertyId}`,
          },
        })),
      );
      return this.findOne(id);
    }

    if (jobLog.queue_name === RENORMALIZATION_QUEUE) {
      const payloadRecord = payload as {
        user_id?: string;
        user_property_ids?: string[];
        total?: number;
      };
      const propertyIds = Array.isArray(payloadRecord.user_property_ids)
        ? payloadRecord.user_property_ids
        : [];
      if (!payloadRecord.user_id || propertyIds.length === 0) {
        throw new BadRequestException(
          'Renormalization job payload is missing user or property ids',
        );
      }
      await this.renormalizationQueue.addBulk(
        propertyIds.map((userPropertyId) => ({
          name: jobLog.job_name ?? 'renormalize-property',
          data: {
            job_log_id: jobLog.id,
            user_id: payloadRecord.user_id,
            user_property_id: userPropertyId,
            total: payloadRecord.total ?? propertyIds.length,
          },
          opts: {
            ...(jobOptions ?? {}),
            jobId: `${jobLog.id}__${userPropertyId}`,
          },
        })),
      );
      return this.findOne(id);
    }

    await queue.add(jobLog.job_name ?? 'retry', enrichedPayload, jobOptions);

    return this.findOne(id);
  }

  async stop(id: string) {
    const jobLog = await this.prisma.jobLog.findUnique({ where: { id } });

    if (!jobLog) {
      throw new NotFoundException('Job log not found');
    }

    if (!ACTIVE_JOB_STATUSES.includes(jobLog.status)) {
      throw new BadRequestException(
        'Only queued or running jobs can be stopped',
      );
    }

    if (jobLog.job_id) {
      try {
        const queue = this.resolveQueue(jobLog.queue_name);
        await queue.remove(jobLog.job_id);
      } catch {}
    }

    if (
      jobLog.queue_name === CONTENT_PRODUCTION_QUEUE ||
      jobLog.queue_name === SALES_PRICE_UPDATE_QUEUE ||
      jobLog.queue_name === PUSH_TO_CMS_QUEUE ||
      jobLog.queue_name === CRM_CLIENT_NOTES_SYNC_QUEUE ||
      jobLog.queue_name === ESTATEWEB_SITES_UPDATE_QUEUE ||
      jobLog.queue_name === RENORMALIZATION_QUEUE ||
      jobLog.queue_name === DELETE_INTEGRATION_IMAGES_QUEUE ||
      jobLog.queue_name === MIGRATE_INTEGRATION_IMAGES_QUEUE
    ) {
      const payload = (jobLog.payload ?? {}) as {
        user_property_ids?: string[];
      };
      const propertyIds = Array.isArray(payload.user_property_ids)
        ? payload.user_property_ids
        : [];
      const queue =
        jobLog.queue_name === CONTENT_PRODUCTION_QUEUE
          ? this.contentProductionQueue
          : jobLog.queue_name === SALES_PRICE_UPDATE_QUEUE
            ? this.salesPriceUpdateQueue
            : jobLog.queue_name === PUSH_TO_CMS_QUEUE
              ? this.pushToCmsQueue
              : jobLog.queue_name === CRM_CLIENT_NOTES_SYNC_QUEUE
                ? this.crmClientNotesSyncQueue
                : jobLog.queue_name === ESTATEWEB_SITES_UPDATE_QUEUE
                  ? this.estateWebSitesUpdateQueue
                  : jobLog.queue_name === DELETE_INTEGRATION_IMAGES_QUEUE
                    ? this.deleteIntegrationImagesQueue
                    : jobLog.queue_name === MIGRATE_INTEGRATION_IMAGES_QUEUE
                      ? this.migrateIntegrationImagesQueue
                      : this.renormalizationQueue;
      for (const propertyId of propertyIds) {
        try {
          await queue.remove(`${jobLog.id}__${propertyId}`);
        } catch {}
      }
    }

    const finishedAt = new Date();

    return this.prisma.jobLog.update({
      where: { id },
      data: {
        status: JobStatus.FAILED,
        finished_at: finishedAt,
        duration_ms: jobLog.started_at
          ? finishedAt.getTime() - jobLog.started_at.getTime()
          : null,
        error_message: 'Stopped by admin',
      },
    });
  }

  async remove(id: string) {
    const jobLog = await this.prisma.jobLog.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!jobLog) {
      throw new NotFoundException('Job log not found');
    }

    if (ACTIVE_JOB_STATUSES.includes(jobLog.status)) {
      throw new BadRequestException('Stop the job before deleting it');
    }

    await this.prisma.jobLog.delete({ where: { id } });
  }

  async removeMany(jobIds: string[]) {
    const uniqueIds = [...new Set(jobIds)];
    const jobLogs = await this.prisma.jobLog.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, status: true },
    });

    if (jobLogs.length !== uniqueIds.length) {
      throw new NotFoundException('One or more job logs not found');
    }

    if (jobLogs.some((jobLog) => ACTIVE_JOB_STATUSES.includes(jobLog.status))) {
      throw new BadRequestException('Stop active jobs before deleting them');
    }

    await this.prisma.jobLog.deleteMany({
      where: { id: { in: uniqueIds } },
    });

    return { deleted: uniqueIds.length };
  }

  private resolveQueue(queueName: string): Queue {
    if (queueName === GENERATION_QUEUE) {
      return this.generationQueue;
    }
    if (queueName === CRAWL_QUEUE) {
      return this.crawlQueue;
    }
    if (queueName === WATERMARK_REMOVAL_QUEUE) {
      return this.watermarkRemovalQueue;
    }
    if (queueName === CONTENT_PRODUCTION_QUEUE) {
      return this.contentProductionQueue;
    }
    if (queueName === SALES_PRICE_UPDATE_QUEUE) {
      return this.salesPriceUpdateQueue;
    }
    if (queueName === PUSH_TO_CMS_QUEUE) {
      return this.pushToCmsQueue;
    }
    if (queueName === CRM_CLIENT_NOTES_SYNC_QUEUE) {
      return this.crmClientNotesSyncQueue;
    }
    if (queueName === ESTATEWEB_SITES_UPDATE_QUEUE) {
      return this.estateWebSitesUpdateQueue;
    }
    if (queueName === RENORMALIZATION_QUEUE) {
      return this.renormalizationQueue;
    }
    if (queueName === DELETE_INTEGRATION_IMAGES_QUEUE) {
      return this.deleteIntegrationImagesQueue;
    }
    if (queueName === MIGRATE_INTEGRATION_IMAGES_QUEUE) {
      return this.migrateIntegrationImagesQueue;
    }
    if (queueName === CMS_SYNC_QUEUE) {
      return this.cmsSyncQueue;
    }
    throw new BadRequestException(`Unsupported queue: ${queueName}`);
  }
}
