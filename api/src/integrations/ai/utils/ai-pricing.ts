import { AiProviders, AiModels } from '../interfaces/ai.interface';

// OpenAI (and Anthropic) Batch APIs price completed batch requests at half
// the synchronous rate in exchange for async (up to 24h) turnaround.
export const BATCH_DISCOUNT_MULTIPLIER = 0.5;

export const AiPricing = {
  [AiProviders.openai]: {
    [AiModels.openai.gpt4o]: { input: 0.0000025, output: 0.00001 },
    [AiModels.openai.gpt4oMini]: { input: 0.00000015, output: 0.0000006 },
    [AiModels.openai.gpt4Turbo]: { input: 0.00001, output: 0.00003 },
    [AiModels.openai.gpt4]: { input: 0.00003, output: 0.00006 },
    [AiModels.openai.gpt35Turbo]: { input: 0.0000005, output: 0.0000015 },
  },

  [AiProviders.grok]: {
    [AiModels.grok.grokPro]: { input: 0.000002, output: 0.000006 },
    [AiModels.grok.grokBeta]: { input: 0.000005, output: 0.000015 },
  },

  [AiProviders.gemini]: {
    [AiModels.gemini.gemini15Pro]: { input: 0.00000125, output: 0.000005 },
    [AiModels.gemini.gemini15Flash]: { input: 0.000000075, output: 0.0000003 },
    [AiModels.gemini.geminiPro]: { input: 0.0000005, output: 0.0000015 },
    [AiModels.gemini.geminiProVision]: { input: 0.0000005, output: 0.0000015 },
  },
} as const;
