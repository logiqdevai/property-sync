// Models offered for Gemini translation (checked against Google's models/pricing/deprecations
// pages on 2026-11-14). gemini-2.5-flash was dropped: it shuts down on 2026-12-01.
export const GEMINI_TRANSLATE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
] as const;

export type GeminiTranslateModel = (typeof GEMINI_TRANSLATE_MODELS)[number];

export const DEFAULT_GEMINI_TRANSLATE_MODEL: GeminiTranslateModel =
  'gemini-3.5-flash-lite';

// Paid-tier Standard text rates, USD per token. Output includes thinking tokens (Google bills
// them as output). Entries are ordered newest-first; the first one whose `from` has passed wins.
export const GEMINI_TRANSLATE_PRICING: Record<
  GeminiTranslateModel,
  Array<{ from: string; input: number; output: number }>
> = {
  'gemini-3.5-flash-lite': [{ from: '2000-01-01', input: 0.3e-6, output: 2.5e-6 }],
  'gemini-3.6-flash': [
    { from: '2027-01-01', input: 1.5e-6, output: 7.5e-6 },
    { from: '2000-01-01', input: 0.75e-6, output: 3.75e-6 },
  ],
};

export function getGeminiTranslateRates(
  model: GeminiTranslateModel,
  at: Date = new Date(),
): { input: number; output: number } {
  const entries = GEMINI_TRANSLATE_PRICING[model];
  return entries.find((entry) => at >= new Date(entry.from)) ?? entries[entries.length - 1];
}
