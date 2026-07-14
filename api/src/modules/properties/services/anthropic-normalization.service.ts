import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  NORMALIZATION_BATCH_SIZE,
  NormalizationUsage,
  addAnthropicUsage,
  emptyNormalizationUsage,
} from '../constants/normalization.constants';
import {
  NORMALIZATION_STATIC_INSTRUCTIONS,
  buildNormalizationDynamicPrompt,
  buildNormalizationInput,
} from '../constants/normalization-prompt';
import { NormalizedAiRow } from '../utils/property-normalization.utils';

@Injectable()
export class AnthropicNormalizationService {
  private readonly logger = new Logger(AnthropicNormalizationService.name);

  async normalizeSourceProperties(
    sourceProperties: Array<{
      source_url: string;
      external_id: string | null;
      raw_title: string | null;
      raw_price: string | null;
      raw_location: string | null;
      raw_description: string | null;
    }>,
    apiKey: string,
    model: string,
  ): Promise<{ results: Array<NormalizedAiRow | null>; usage: NormalizationUsage }> {
    const results: Array<NormalizedAiRow | null> = new Array(sourceProperties.length).fill(null);
    const usage = emptyNormalizationUsage();
    const client = new Anthropic({ apiKey });

    for (let i = 0; i < sourceProperties.length; i += NORMALIZATION_BATCH_SIZE) {
      const batch = sourceProperties.slice(i, i + NORMALIZATION_BATCH_SIZE);
      const end = Math.min(i + batch.length, sourceProperties.length);

      try {
        const normalized = await this.normalizeBatch(client, model, batch, usage);
        for (const row of normalized) {
          if (row == null || row.index == null) continue;
          const sp = sourceProperties[i + row.index];
          if (!sp) continue;
          results[i + row.index] = row;
        }
      } catch (batchErr) {
        this.logger.warn(
          `Batch ${i + 1}-${end} failed (${batchErr instanceof Error ? batchErr.message : batchErr}), retrying individually`,
        );
        for (let j = 0; j < batch.length; j++) {
          try {
            const [singleResult] = await this.normalizeBatch(
              client,
              model,
              [batch[j]],
              usage,
            );
            results[i + j] = singleResult ?? null;
          } catch (singleErr) {
            this.logger.error(
              `Row ${i + j + 1} failed (${batch[j].source_url}): ${singleErr instanceof Error ? singleErr.message : singleErr}`,
            );
          }
        }
      }
    }

    return { results, usage };
  }

  private async normalizeBatch(
    client: Anthropic,
    model: string,
    sourceProperties: Array<{
      source_url: string;
      external_id: string | null;
      raw_title: string | null;
      raw_price: string | null;
      raw_location: string | null;
      raw_description: string | null;
    }>,
    usage: NormalizationUsage,
  ): Promise<NormalizedAiRow[]> {
    const input = buildNormalizationInput(sourceProperties);
    const dynamicInput = buildNormalizationDynamicPrompt(input);

    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: NORMALIZATION_STATIC_INSTRUCTIONS,
              cache_control: { type: 'ephemeral' },
            },
            { type: 'text', text: dynamicInput },
          ],
        },
      ],
    });

    addAnthropicUsage(usage, response.usage ?? {});

    const text =
      response.content.find((block) => block.type === 'text')?.text ?? '';
    return this.parseNormalizationArray(text);
  }

  private parseNormalizationArray(text: string): NormalizedAiRow[] {
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      throw new Error(`AI returned no JSON array. Response: ${text.slice(0, 300)}`);
    }

    try {
      return JSON.parse(arrayMatch[0]) as NormalizedAiRow[];
    } catch {
      const objectMatches = arrayMatch[0].match(/\{[\s\S]*?\}(?=\s*[,\]])/g);
      if (!objectMatches) {
        throw new Error('Could not parse AI response as JSON');
      }
      return objectMatches
        .map((segment) => {
          try {
            return JSON.parse(segment) as NormalizedAiRow;
          } catch {
            return null;
          }
        })
        .filter((row): row is NormalizedAiRow => row != null);
    }
  }
}
