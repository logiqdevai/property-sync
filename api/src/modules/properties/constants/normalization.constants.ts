export const NORMALIZATION_BATCH_SIZE = 10;

export const LISTING_TYPES = [
  'SALE',
  'RENT',
  'SHORT_TERM_RENT',
  'UNKNOWN',
] as const;

export const PROPERTY_TYPES = [
  'APARTMENT',
  'HOUSE',
  'VILLA',
  'MAISONETTE',
  'STUDIO',
  'LAND',
  'COMMERCIAL',
  'OFFICE',
  'WAREHOUSE',
  'PARKING',
  'OTHER',
  'UNKNOWN',
] as const;

export const DEFAULT_ANTHROPIC_NORMALIZATION_MODEL = 'claude-haiku-4-5-20251001';
export const DEFAULT_OPENAI_NORMALIZATION_MODEL = 'gpt-4o-mini';

export const ANTHROPIC_MODEL_PRICING = {
  input_per_million: 1.0,
  output_per_million: 5.0,
  cache_write_multiplier: 1.25,
  cache_read_multiplier: 0.1,
} as const;

export interface NormalizationUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export function emptyNormalizationUsage(): NormalizationUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
}

export function addAnthropicUsage(
  total: NormalizationUsage,
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  },
): void {
  total.input_tokens += usage.input_tokens ?? 0;
  total.output_tokens += usage.output_tokens ?? 0;
  total.cache_creation_input_tokens += usage.cache_creation_input_tokens ?? 0;
  total.cache_read_input_tokens += usage.cache_read_input_tokens ?? 0;
}

export function buildAnthropicCostReport(
  usage: NormalizationUsage,
  model: string,
  meta: { aiNormalizedCount: number },
) {
  const pricing = ANTHROPIC_MODEL_PRICING;
  const inputCost =
    (usage.input_tokens / 1_000_000) * pricing.input_per_million;
  const outputCost =
    (usage.output_tokens / 1_000_000) * pricing.output_per_million;
  const cacheWriteCost =
    (usage.cache_creation_input_tokens / 1_000_000) *
    pricing.input_per_million *
    pricing.cache_write_multiplier;
  const cacheReadCost =
    (usage.cache_read_input_tokens / 1_000_000) *
    pricing.input_per_million *
    pricing.cache_read_multiplier;
  const totalCost = inputCost + outputCost + cacheWriteCost + cacheReadCost;

  return {
    model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    input_cost: roundUsd(inputCost),
    output_cost: roundUsd(outputCost),
    total_cost: roundUsd(totalCost),
    average_cost_per_property:
      meta.aiNormalizedCount > 0
        ? roundUsd(totalCost / meta.aiNormalizedCount)
        : null,
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
