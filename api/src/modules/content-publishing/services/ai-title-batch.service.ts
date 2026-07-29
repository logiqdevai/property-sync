import { Injectable, Logger } from '@nestjs/common';
import {
  AiBatchRunKind,
  AiBatchRunStatus,
  ContentLanguage,
  ContentType,
  JobStatus,
} from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { AiBatchClientService } from '@/integrations/ai-batch/services/ai-batch-client.service';
import { AiDefaults } from '@/integrations/ai/utils/ai.config';
import { OPENAI_BATCH_QUEUE } from '@/core/queues/queues.constants';
import {
  AI_TITLE_SYSTEM_PROMPT,
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
  ) {}

  async submitFamilyBatch(params: {
    configId: string;
    familyId: string;
    familyName: string;
    instructions?: string | null;
    model?: string | null;
    sourceLanguage: ContentLanguage;
    targetLanguages: ContentLanguage[];
    apiKey: string;
    items: Array<{
      userPropertyId: string;
      title: string;
      description: string | null;
    }>;
  }): Promise<string | null> {
    if (!params.items.length || !params.targetLanguages.length) return null;

    const client = this.aiBatchClient.createClient(params.apiKey);
    const model = params.model || AiDefaults.model;
    const lines = params.items.map((item) => {
      const prompt = buildAiTitleUserPrompt({
        sourceLanguage: params.sourceLanguage,
        targetLanguages: params.targetLanguages,
        title: item.title,
        description: item.description,
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
        user_property_ids: params.items.map((i) => i.userPropertyId),
        metadata: {
          target_languages: params.targetLanguages,
          source_language: params.sourceLanguage,
          family_name: params.familyName,
          model,
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
    };
    const targetLanguages = meta.target_languages ?? [];

    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      let parsed: {
        custom_id?: string;
        response?: { body?: { choices?: Array<{ message?: { content?: string } }> } };
      };
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const userPropertyId = parsed.custom_id;
      const content =
        parsed.response?.body?.choices?.[0]?.message?.content ?? '';
      if (!userPropertyId || !content) continue;

      const titles = this.aiTitleFamilyService.parseTitlesResponse(
        content,
        targetLanguages,
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

    await this.prisma.aiBatchRun.update({
      where: { id: run.id },
      data: { status: AiBatchRunStatus.COMPLETED },
    });

    await this.prisma.jobLog.updateMany({
      where: { queue_name: OPENAI_BATCH_QUEUE, job_id: batchId },
      data: { status: JobStatus.COMPLETED },
    });
  }

  async markFailed(batchId: string, message: string): Promise<void> {
    await this.prisma.aiBatchRun.updateMany({
      where: { openai_batch_id: batchId },
      data: { status: AiBatchRunStatus.FAILED, error_message: message },
    });
    await this.prisma.jobLog.updateMany({
      where: { queue_name: OPENAI_BATCH_QUEUE, job_id: batchId },
      data: { status: JobStatus.FAILED, error_message: message },
    });
  }

  async findByOpenAiBatchId(batchId: string) {
    return this.prisma.aiBatchRun.findUnique({
      where: { openai_batch_id: batchId },
    });
  }
}
