import { MODEL_PRICING, NORMALIZATION_MODEL } from './config.js';

export function emptyUsage() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
}

export function addUsage(total, response) {
  const usage = response?.usage ?? {};
  total.input_tokens += usage.input_tokens ?? 0;
  total.output_tokens += usage.output_tokens ?? 0;
  total.cache_creation_input_tokens += usage.cache_creation_input_tokens ?? 0;
  total.cache_read_input_tokens += usage.cache_read_input_tokens ?? 0;
}

export function buildCostReport(usage, meta = {}) {
  const {
    totalProperties = 0,
    totalSourceProperties = totalProperties,
    aiNormalizedCount = totalProperties,
    cacheHitCount = 0,
  } = meta;

  const input_cost = (usage.input_tokens / 1_000_000) * MODEL_PRICING.input_per_million;
  const output_cost = (usage.output_tokens / 1_000_000) * MODEL_PRICING.output_per_million;
  const cache_write_cost = ((usage.cache_creation_input_tokens ?? 0) / 1_000_000)
    * MODEL_PRICING.input_per_million * MODEL_PRICING.cache_write_multiplier;
  const cache_read_cost = ((usage.cache_read_input_tokens ?? 0) / 1_000_000)
    * MODEL_PRICING.input_per_million * MODEL_PRICING.cache_read_multiplier;
  const total_cost = input_cost + output_cost + cache_write_cost + cache_read_cost;

  return {
    model: NORMALIZATION_MODEL,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_tokens: usage.cache_read_input_tokens ?? 0,
    input_cost: roundUsd(input_cost),
    output_cost: roundUsd(output_cost),
    cache_write_cost: roundUsd(cache_write_cost),
    cache_read_cost: roundUsd(cache_read_cost),
    total_cost: roundUsd(total_cost),
    total_properties: totalProperties,
    total_source_properties: totalSourceProperties,
    ai_normalized_count: aiNormalizedCount,
    cache_hit_count: cacheHitCount,
    average_cost_per_property: aiNormalizedCount > 0
      ? roundUsd(total_cost / aiNormalizedCount)
      : 0,
  };
}

function roundUsd(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
