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
import { DEFAULT_OPENAI_NORMALIZATION_MODEL } from '@/modules/properties/constants/normalization.constants';
import { NormalizedAiRow } from '@/modules/properties/utils/property-normalization.utils';
import { JobStatus } from 'generated/prisma';

interface CrawlRunBatchMetadata {
  ai_batch_id?: string;
  ai_batch_status?: string;
  pending_source_property_ids?: string[];
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
    const model = params.model || DEFAULT_OPENAI_NORMALIZATION_MODEL;

    const lines = params.sourceProperties.map((sp) => {
      const input = buildNormalizationInput([sp])[0];
      const body = {
        model,
        messages: [
          { role: 'system', content: NORMALIZATION_STATIC_INSTRUCTIONS },
          {
            role: 'user',
            content: buildNormalizationDynamicPrompt([input]),
          },
        ],
      };

      return JSON.stringify({
        custom_id: sp.id,
        method: 'POST',
        url: '/v1/chat/completions',
        body,
      });
    });

    const inputFileId = await this.aiBatchClient.uploadJsonl(client, lines);
    const batchId = await this.aiBatchClient.createBatch(client, inputFileId, {
      crawl_run_id: params.crawlRunId,
      source_agency_id: params.sourceAgencyId,
    });

    const metadata: CrawlRunBatchMetadata = {
      ai_batch_id: batchId,
      ai_batch_status: 'pending',
      pending_source_property_ids: params.sourceProperties.map((sp) => sp.id),
      user_integration_id: params.userIntegrationId,
      ai_provider: 'OPENAI',
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
    normalized: NormalizedAiRow | null;
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
          normalized: null,
          usage: parsed.response?.body?.usage,
        };
      }

      const arrayMatch = content.match(/\[[\s\S]*\]/);
      const objectMatch = content.match(/\{[\s\S]*\}/);
      let normalized: NormalizedAiRow | null = null;

      if (arrayMatch) {
        const rows = JSON.parse(arrayMatch[0]) as NormalizedAiRow[];
        normalized = rows[0] ?? null;
      } else if (objectMatch) {
        normalized = JSON.parse(objectMatch[0]) as NormalizedAiRow;
      }

      return {
        customId: parsed.custom_id,
        normalized,
        usage: parsed.response?.body?.usage,
      };
    } catch {
      return null;
    }
  }
}
