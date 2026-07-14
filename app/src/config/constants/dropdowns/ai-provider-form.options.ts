import {
  AiProviders,
  type AiProvider,
} from "@/features/user-tracked-agencies/interfaces/user-tracked-agencies.interfaces";

export const AiProviderFormOptions: { id: AiProvider; label: string }[] = [
  { id: AiProviders.OPENAI, label: "OpenAI" },
  { id: AiProviders.ANTHROPIC, label: "Anthropic" },
  { id: AiProviders.GEMINI, label: "Gemini" },
];
