import { MODEL_PRICING, NORMALIZATION_MODEL } from './config.js';

export function emptyUsage() {
  return { input_tokens: 0, output_tokens: 0 };
}

export function addUsage(total, response) {
  const usage = response?.usage ?? {};
  total.input_tokens += usage.input_tokens ?? 0;
  total.output_tokens += usage.output_tokens ?? 0;
}

export function buildCostReport(usage, totalProperties) {
  const input_cost = (usage.input_tokens / 1_000_000) * MODEL_PRICING.input_per_million;
  const output_cost = (usage.output_tokens / 1_000_000) * MODEL_PRICING.output_per_million;
  const total_cost = input_cost + output_cost;

  return {
    model: NORMALIZATION_MODEL,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    input_cost: roundUsd(input_cost),
    output_cost: roundUsd(output_cost),
    total_cost: roundUsd(total_cost),
    total_properties: totalProperties,
    average_cost_per_property: totalProperties > 0
      ? roundUsd(total_cost / totalProperties)
      : 0,
  };
}

function roundUsd(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
