import {
  IntegrationTypes,
  type IntegrationType,
} from "@/features/integration-targets/interfaces/integration-targets.interfaces";

export const IntegrationTypeFormOptions: { id: IntegrationType; label: string }[] = [
  { id: IntegrationTypes.ESTATEWEB, label: "EstateWeb (CMS)" },
  { id: IntegrationTypes.OPENAI, label: "OpenAI" },
  { id: IntegrationTypes.ANTHROPIC, label: "Anthropic" },
  { id: IntegrationTypes.GEMINI, label: "Gemini" },
  { id: IntegrationTypes.DEEPSEEK, label: "DeepSeek" },
];
