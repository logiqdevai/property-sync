import { Injectable, Logger } from '@nestjs/common';
import {
  AiBatchRunKind,
  AiBatchRunStatus,
  ContentLanguage,
  ContentType,
  CostOperationType,
  IntegrationType,
  JobStatus,
} from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { AiBatchClientService } from '@/integrations/ai-batch/services/ai-batch-client.service';
import { AiDefaults } from '@/integrations/ai/utils/ai.config';
import { calculateAiCost } from '@/integrations/ai/utils/ai-cost';
import { AiProviders } from '@/integrations/ai/interfaces/ai.interface';
import { CostLogsService } from '@/modules/cost-logs/cost-logs.service';
import { OPENAI_BATCH_QUEUE } from '@/core/queues/queues.constants';
import {
  AI_TITLE_SYSTEM_PROMPT,
  AiTitlePropertyFacts,
  buildAiTitleUserPrompt,
} from '../constants/ai-title-prompt';
import { AiTitleFamilyService } from './ai-title-family.service';

@Injectable()
export class AiTitleBatchService {
  private readonly logger = new Logger(AiTitleBatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiBatchClient: AiBatchClientService,
    private readonly aiTitleFamilyService: AiTitleFamilyService,
    private readonly costLogsService: CostLogsService,
  ) {}

  async submitFamilyBatch(params: {
    configId: string;
    familyId: string;
    familyName: string;
    instructions?: string | null;
    model?: string | null;
    sourceLanguage: ContentLanguage;
    writingLanguage: ContentLanguage;
    targetLanguages: ContentLanguage[];
    apiKey: string;
    userId?: string | null;
    crawlRunId?: string | null;
    changeTypesByPropertyId?: Record<string, string>;
    retryCount?: number;
    items: Array<{
      userPropertyId: string;
      title: string;
      description: string | null;
      facts: AiTitlePropertyFacts;
    }>;
  }): Promise<string | null> {
    if (!params.items.length || !params.targetLanguages.length) return null;

    const client = this.aiBatchClient.createClient(params.apiKey);
    const model = params.model || AiDefaults.model;
    const lines = params.items.map((item) => {
      const prompt = buildAiTitleUserPrompt({
        sourceLanguage: params.sourceLanguage,
        targetLanguages: params.targetLanguages,
        writingLanguage: params.writingLanguage,
        title: item.title,
        description: item.description,
        facts: item.facts,
        familyInstructions: params.instructions,
      });
      return JSON.stringify({
        custom_id: item.userPropertyId,
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model,
          max_tokens: 1200,
          temperature: 0.4,
          messages: [
            { role: 'system', content: AI_TITLE_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
        },
      });
    });

    const inputFileId = await this.aiBatchClient.uploadJsonl(client, lines);
    const batchId = await this.aiBatchClient.createBatch(client, inputFileId, {
      kind: 'title_family',
      config_id: params.configId,
      family_id: params.familyId,
    });

    await this.prisma.aiBatchRun.create({
      data: {
        kind: AiBatchRunKind.TITLE_FAMILY,
        status: AiBatchRunStatus.SUBMITTED,
        openai_batch_id: batchId,
        config_id: params.configId,
        ai_title_family_id: params.familyId,
        crawl_run_id: params.crawlRunId ?? null,
        user_property_ids: params.items.map((i) => i.userPropertyId),
        metadata: {
          target_languages: params.targetLanguages,
          source_language: params.sourceLanguage,
          writing_language: params.writingLanguage,
          family_name: params.familyName,
          model,
          user_id: params.userId ?? null,
          change_types_by_property_id: params.changeTypesByPropertyId ?? {},
          retry_count: params.retryCount ?? 0,
        },
      },
    });

    await this.prisma.jobLog.create({
      data: {
        queue_name: OPENAI_BATCH_QUEUE,
        job_id: batchId,
        job_name: 'title-family-batch',
        status: JobStatus.WAITING,
        payload: {
          batch_id: batchId,
          family_id: params.familyId,
          property_count: params.items.length,
          crawl_run_id: params.crawlRunId ?? null,
        },
      },
    });

    this.logger.log(
      `Submitted title-family batch ${batchId} for family ${params.familyId} (${params.items.length} properties)`,
    );
    return batchId;
  }

  async completeBatch(batchId: string, apiKey: string): Promise<void> {
    const run = await this.prisma.aiBatchRun.findUnique({
      where: { openai_batch_id: batchId },
    });
    if (!run) {
      this.logger.warn(`No AiBatchRun for OpenAI batch ${batchId}`);
      return;
    }
    if (run.status === AiBatchRunStatus.COMPLETED) return;

    const claimed = await this.prisma.aiBatchRun.updateMany({
      where: {
        id: run.id,
        status: AiBatchRunStatus.SUBMITTED,
      },
      data: { status: AiBatchRunStatus.IN_PROGRESS },
    });
    if (claimed.count === 0) {
      const fresh = await this.prisma.aiBatchRun.findUnique({
        where: { id: run.id },
        select: { status: true },
      });
      if (
        !fresh ||
        fresh.status === AiBatchRunStatus.COMPLETED ||
        fresh.status === AiBatchRunStatus.IN_PROGRESS
      ) {
        return;
      }
    }

    try {
      const client = this.aiBatchClient.createClient(apiKey);
      const batch = await this.aiBatchClient.retrieveBatch(client, batchId);
      if (batch.status !== 'completed' || !batch.output_file_id) {
        await this.prisma.aiBatchRun.update({
          where: { id: run.id },
          data: {
            status: AiBatchRunStatus.FAILED,
            error_message: `Batch status ${batch.status}`,
          },
        });
        return;
      }

      const output = await this.aiBatchClient.downloadOutputFile(
        client,
        batch.output_file_id,
      );
      const meta = (run.metadata ?? {}) as {
        target_languages?: ContentLanguage[];
        writing_language?: ContentLanguage;
        model?: string;
        user_id?: string | null;
      };
      const targetLanguages = meta.target_languages ?? [];
      const writingLanguage = meta.writing_language ?? ContentLanguage.EN;
      const model = meta.model || AiDefaults.model;

      const propertyIds = Array.isArray(run.user_property_ids)
        ? (run.user_property_ids as string[])
        : [];
      const properties = propertyIds.length
        ? await this.prisma.userProperty.findMany({
            where: { id: { in: propertyIds } },
            select: { id: true, square_meters: true },
          })
        : [];
      const factsByPropertyId = new Map(
        properties.map((property) => [
          property.id,
          { square_meters: property.square_meters?.toString() ?? null },
        ]),
      );

      let lineErrors = 0;
      for (const line of output.split('\n')) {
        if (!line.trim()) continue;
        try {
          await this.applyCompletedBatchLine({
            line,
            runId: run.id,
            targetLanguages,
            writingLanguage,
            model,
            userId: meta.user_id,
            factsByPropertyId,
          });
        } catch (error) {
          lineErrors += 1;
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Title batch ${batchId}: failed applying one output line: ${message}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }

      await this.prisma.aiBatchRun.update({
        where: { id: run.id },
        data: {
          status: AiBatchRunStatus.COMPLETED,
          error_message:
            lineErrors > 0
              ? `Completed with ${lineErrors} line error(s)`
              : null,
        },
      });

      await this.prisma.jobLog.updateMany({
        where: { queue_name: OPENAI_BATCH_QUEUE, job_id: batchId },
        data: { status: JobStatus.COMPLETED },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Title batch ${batchId}: completeBatch failed after claim; marking COMPLETED to unblock CMS gate: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.prisma.aiBatchRun.update({
        where: { id: run.id },
        data: {
          status: AiBatchRunStatus.COMPLETED,
          error_message: `Completed with errors: ${message}`.slice(0, 1000),
        },
      });
      await this.prisma.jobLog.updateMany({
        where: { queue_name: OPENAI_BATCH_QUEUE, job_id: batchId },
        data: {
          status: JobStatus.COMPLETED,
          error_message: message.slice(0, 1000),
        },
      });
    }
  }

  private async applyCompletedBatchLine(params: {
    line: string;
    runId: string;
    targetLanguages: ContentLanguage[];
    writingLanguage: ContentLanguage;
    model: string;
    userId?: string | null;
    factsByPropertyId: Map<string, { square_meters: string | null }>;
  }): Promise<void> {
    let parsed: {
      custom_id?: string;
      response?: {
        body?: {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
      };
    };
    try {
      parsed = JSON.parse(params.line);
    } catch {
      return;
    }
    const userPropertyId = parsed.custom_id;
    const content = parsed.response?.body?.choices?.[0]?.message?.content ?? '';
    if (!userPropertyId || !content) return;

    const usage = parsed.response?.body?.usage;
    if (usage) {
      const cost = calculateAiCost({
        provider: AiProviders.openai,
        model: params.model,
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        isBatch: true,
      });
      await this.costLogsService.record({
        userId: params.userId,
        operationType: CostOperationType.TITLE_GENERATION,
        provider: IntegrationType.OPENAI,
        model: params.model,
        inputQuantity: cost.inputTokens,
        outputQuantity: cost.outputTokens,
        inputCost: cost.inputCost,
        outputCost: cost.outputCost,
        totalCost: cost.totalCost,
        userPropertyId,
        aiBatchRunId: params.runId,
      });
    }

    const titles = this.aiTitleFamilyService.applySquareMetersGuard(
      this.aiTitleFamilyService.parseTitlesResponse(
        content,
        params.targetLanguages,
      ),
      params.factsByPropertyId.get(userPropertyId) ?? {},
      params.writingLanguage,
    );
    for (const [language, text] of Object.entries(titles)) {
      if (!text) continue;
      await this.prisma.propertyLocalizedContent.upsert({
        where: {
          user_property_id_content_type_language: {
            user_property_id: userPropertyId,
            content_type: ContentType.TITLE,
            language: language as ContentLanguage,
          },
        },
        create: {
          user_property_id: userPropertyId,
          content_type: ContentType.TITLE,
          language: language as ContentLanguage,
          production: 'AI',
          text,
          is_stale: false,
        },
        update: {
          production: 'AI',
          text,
          is_stale: false,
        },
      });
    }
  }

  /**
   * Fallback for missed/undelivered OpenAI webhooks (completeBatch above is normally
   * only reached via openai-webhooks.service.ts). Polls the batch directly and only
   * acts on a terminal OpenAI status -- unlike completeBatch, it leaves the run alone
   * if OpenAI still reports validating/in_progress/finalizing, so it's safe to call
   * on a batch that simply hasn't finished yet.
   */
  async reconcileStaleBatch(batchId: string, apiKey: string): Promise<void> {
    const run = await this.prisma.aiBatchRun.findUnique({
      where: { openai_batch_id: batchId },
    });
    if (!run || run.status !== AiBatchRunStatus.SUBMITTED) return;

    const client = this.aiBatchClient.createClient(apiKey);
    const batch = await this.aiBatchClient.retrieveBatch(client, batchId);

    if (batch.status === 'completed') {
      await this.completeBatch(batchId, apiKey);
      return;
    }

    if (
      batch.status === 'failed' ||
      batch.status === 'expired' ||
      batch.status === 'cancelled'
    ) {
      await this.markFailed(batchId, `OpenAI batch ${batch.status}`, apiKey);
    }
  }

  // How many times to transparently resubmit a title batch that failed for the
  // specific OpenAI-side "cannot find file" race (see isTransientFileRace below)
  // before giving up and surfacing it as a real failure.
  private static readonly MAX_TRANSIENT_RETRIES = 2;

  async markFailed(
    batchId: string,
    message: string,
    apiKey?: string,
  ): Promise<void> {
    // Atomically claim this run out of SUBMITTED before doing anything else.
    // OpenAI fans a batch.failed event out to every webhook endpoint
    // registered on the org, so this can be entered concurrently for the same
    // batchId (and can also race the watchdog cron); without this guard both
    // callers read the same "not yet handled" state and both resubmit,
    // doubling the batch count on every failure. Claiming into CANCELLED
    // up front also means a run that gets successfully resubmitted no longer
    // sits in SUBMITTED forever -- previously that left it a zombie the
    // watchdog would rediscover and resubmit again on every future tick,
    // since its own metadata.retry_count was never incremented.
    const claim = await this.prisma.aiBatchRun.updateMany({
      where: { openai_batch_id: batchId, status: AiBatchRunStatus.SUBMITTED },
      data: { status: AiBatchRunStatus.CANCELLED, error_message: message },
    });
    if (claim.count === 0) return;

    if (apiKey) {
      const resubmitted = await this.tryResubmitTransientFailure(
        batchId,
        apiKey,
      );
      if (resubmitted) return;
    }

    await this.prisma.aiBatchRun.updateMany({
      where: { openai_batch_id: batchId },
      data: { status: AiBatchRunStatus.FAILED, error_message: message },
    });
    await this.prisma.jobLog.updateMany({
      where: { queue_name: OPENAI_BATCH_QUEUE, job_id: batchId },
      data: { status: JobStatus.FAILED, error_message: message },
    });
  }

  // OpenAI's batch worker can resolve a batch straight to `failed` (request_counts
  // all zero, usually within ~1-2 minutes) with "Cannot find file ... or organization
  // does not have access to it" -- the same file-propagation race createBatch() already
  // retries around for the synchronous create() call, but this instance happens later,
  // inside OpenAI's own async batch execution, so no amount of waiting before create()
  // can prevent it. Detect that specific signature and transparently resubmit a fresh
  // batch (new file upload, new batch) instead of surfacing a false alarm.
  private isTransientFileRace(errors: unknown): boolean {
    const list =
      (errors as { data?: Array<{ code?: string; message?: string }> })?.data ??
      [];
    return list.some(
      (e) =>
        e.code === 'invalid_request' &&
        /cannot find file/i.test(e.message ?? ''),
    );
  }

  private async tryResubmitTransientFailure(
    batchId: string,
    apiKey: string,
  ): Promise<boolean> {
    const run = await this.prisma.aiBatchRun.findUnique({
      where: { openai_batch_id: batchId },
    });
    if (!run || run.kind !== AiBatchRunKind.TITLE_FAMILY) return false;

    const meta = (run.metadata ?? {}) as {
      target_languages?: ContentLanguage[];
      source_language?: ContentLanguage;
      writing_language?: ContentLanguage;
      family_name?: string;
      model?: string;
      user_id?: string | null;
      change_types_by_property_id?: Record<string, string>;
      retry_count?: number;
    };
    const retryCount = meta.retry_count ?? 0;
    if (retryCount >= AiTitleBatchService.MAX_TRANSIENT_RETRIES) return false;

    try {
      const client = this.aiBatchClient.createClient(apiKey);
      const batch = await this.aiBatchClient.retrieveBatch(client, batchId);
      if (!this.isTransientFileRace(batch.errors)) return false;
    } catch (error) {
      this.logger.warn(
        `tryResubmitTransientFailure: could not inspect batch ${batchId} errors: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }

    if (
      !run.config_id ||
      !run.ai_title_family_id ||
      !meta.target_languages?.length
    ) {
      return false;
    }

    const propertyIds = Array.isArray(run.user_property_ids)
      ? (run.user_property_ids as string[])
      : [];
    if (!propertyIds.length) return false;

    const [family, properties] = await Promise.all([
      this.prisma.aiTitleFamily.findUnique({
        where: { id: run.ai_title_family_id },
      }),
      this.prisma.userProperty.findMany({
        where: { id: { in: propertyIds } },
        select: {
          id: true,
          title: true,
          description: true,
          district: true,
          city: true,
          listing_type: true,
          square_meters: true,
          property_type: true,
        },
      }),
    ]);
    if (!properties.length) return false;

    const newBatchId = await this.submitFamilyBatch({
      configId: run.config_id,
      familyId: run.ai_title_family_id,
      familyName: meta.family_name ?? family?.name ?? 'title family',
      instructions: family?.instructions ?? null,
      model: meta.model ?? family?.model ?? null,
      sourceLanguage: meta.source_language ?? ContentLanguage.EN,
      writingLanguage: meta.writing_language ?? ContentLanguage.EN,
      targetLanguages: meta.target_languages,
      apiKey,
      userId: meta.user_id,
      crawlRunId: run.crawl_run_id,
      changeTypesByPropertyId: meta.change_types_by_property_id ?? {},
      retryCount: retryCount + 1,
      items: properties.map((property) => ({
        userPropertyId: property.id,
        title: property.title,
        description: property.description,
        facts: {
          district: property.district,
          city: property.city,
          listing_type: property.listing_type,
          square_meters: property.square_meters?.toString() ?? null,
          property_type: property.property_type,
        },
      })),
    });

    if (!newBatchId) return false;

    this.logger.warn(
      `Title batch ${batchId} failed with a transient file-propagation race; resubmitted as ${newBatchId} (retry ${retryCount + 1}/${AiTitleBatchService.MAX_TRANSIENT_RETRIES})`,
    );
    return true;
  }

  async findByOpenAiBatchId(batchId: string) {
    return this.prisma.aiBatchRun.findUnique({
      where: { openai_batch_id: batchId },
    });
  }
}
