import {
  IntegrationTypes,
  type IntegrationType,
} from "@/features/integration-targets/interfaces/integration-targets.interfaces";

export const IntegrationTypeFilterOptions: { id: IntegrationType | "all"; label: string }[] = [
  { id: "all", label: "All types" },
  { id: IntegrationTypes.ESTATEWEB, label: "EstateWeb" },
  { id: IntegrationTypes.OPENAI, label: "OpenAI" },
  { id: IntegrationTypes.ANTHROPIC, label: "Anthropic" },
  { id: IntegrationTypes.GEMINI, label: "Gemini" },
  { id: IntegrationTypes.DEEPSEEK, label: "DeepSeek" },
];
