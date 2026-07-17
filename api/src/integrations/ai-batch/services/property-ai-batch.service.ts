import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { AI_BATCH_COMPLETE_QUEUE } from '@/core/queues/queues.constants';
import { AiBatchClientService } from './ai-batch-client.service';
import {
  NORMALIZATION_STATIC_INSTRUCTIONS,
  buildNormalizationDynamicPrompt,
  buildNormalizationInput,
} from '@/modules/properties/constants/normalization-prompt';
import { NORMALIZATION_BATCH_SIZE } from '@/modules/properties/constants/normalization.constants';
import { AiDefaults } from '@/integrations/ai/utils/ai.config';
import { NormalizedAiRow } from '@/modules/properties/utils/property-normalization.utils';
import { JobStatus } from 'generated/prisma';

interface CrawlRunBatchMetadata {
  ai_batch_id?: string;
  ai_batch_status?: string;
  pending_source_property_ids?: string[];
  batch_chunks?: string[][];
  user_integration_id?: string;
  ai_provider?: string;
  ai_model?: string;
}

@Injectable()
export class PropertyAiBatchService {
  private readonly logger = new Logger(PropertyAiBatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiBatchClient: AiBatchClientService,
    @InjectQueue(AI_BATCH_COMPLETE_QUEUE)
    private readonly aiBatchCompleteQueue: Queue,
  ) {}

  async submitForCrawlRun(params: {
    crawlRunId: string;
    sourceAgencyId: string;
    sourceProperties: Array<{
      id: string;
      source_url: string;
      external_id: string | null;
      raw_title: string | null;
      raw_price: string | null;
      raw_location: string | null;
      raw_description: string | null;
    }>;
    apiKey: string;
    userIntegrationId: string;
    model: string;
  }): Promise<void> {
    const client = this.aiBatchClient.createClient(params.apiKey);
    const model = params.model || AiDefaults.model;

    const chunks: string[][] = [];
    const lines: string[] = [];

    for (let i = 0; i < params.sourceProperties.length; i += NORMALIZATION_BATCH_SIZE) {
      const chunk = params.sourceProperties.slice(i, i + NORMALIZATION_BATCH_SIZE);
      const chunkIndex = chunks.length;
      chunks.push(chunk.map((sp) => sp.id));

      const input = buildNormalizationInput(chunk);
      const body = {
        model,
        max_tokens: 8192,
        messages: [
          { role: 'system', content: NORMALIZATION_STATIC_INSTRUCTIONS },
          {
            role: 'user',
            content: buildNormalizationDynamicPrompt(input),
          },
        ],
      };

      lines.push(
        JSON.stringify({
          custom_id: `chunk-${chunkIndex}`,
          method: 'POST',
          url: '/v1/chat/completions',
          body,
        }),
      );
    }

    const inputFileId = await this.aiBatchClient.uploadJsonl(client, lines);
    const batchId = await this.aiBatchClient.createBatch(client, inputFileId, {
      crawl_run_id: params.crawlRunId,
      source_agency_id: params.sourceAgencyId,
    });

    const metadata: CrawlRunBatchMetadata = {
      ai_batch_id: batchId,
      ai_batch_status: 'pending',
      pending_source_property_ids: params.sourceProperties.map((sp) => sp.id),
      batch_chunks: chunks,
      user_integration_id: params.userIntegrationId,
      ai_provider: AiDefaults.provider,
      ai_model: model,
    };

    await this.prisma.crawlRun.update({
      where: { id: params.crawlRunId },
      data: { metadata: metadata as object },
    });

    await this.prisma.jobLog.create({
      data: {
        queue_name: 'openai-batch',
        job_id: batchId,
        job_name: 'normalization-batch',
        status: JobStatus.WAITING,
        crawl_run_id: params.crawlRunId,
        payload: { batch_id: batchId, source_count: params.sourceProperties.length },
      },
    });

    this.logger.log(
      `Submitted OpenAI batch ${batchId} for crawl run ${params.crawlRunId} (${params.sourceProperties.length} listings)`,
    );
  }

  async enqueueBatchCompletion(batchId: string, crawlRunId: string): Promise<void> {
    await this.aiBatchCompleteQueue.add('complete', { batchId, crawlRunId });
  }

  parseBatchOutputLine(line: string): {
    customId: string;
    rows: NormalizedAiRow[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } | null {
    try {
      const parsed = JSON.parse(line) as {
        custom_id?: string;
        response?: {
          body?: {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
        };
      };

      if (!parsed.custom_id) return null;
      const content = parsed.response?.body?.choices?.[0]?.message?.content;
      if (!content) {
        return {
          customId: parsed.custom_id,
          rows: [],
          usage: parsed.response?.body?.usage,
        };
      }

      const arrayMatch = content.match(/\[[\s\S]*\]/);
      const objectMatch = content.match(/\{[\s\S]*\}/);
      let rows: NormalizedAiRow[] = [];

      if (arrayMatch) {
        rows = JSON.parse(arrayMatch[0]) as NormalizedAiRow[];
      } else if (objectMatch) {
        rows = [JSON.parse(objectMatch[0]) as NormalizedAiRow];
      }

      return {
        customId: parsed.custom_id,
        rows,
        usage: parsed.response?.body?.usage,
      };
    } catch {
      return null;
    }
  }
}
