import {
  IntegrationTypes,
  type IntegrationType,
} from "@/features/integration-targets/interfaces/integration-targets.interfaces";

export const IntegrationTypeOptions: { id: IntegrationType; label: string }[] = [
  { id: IntegrationTypes.ESTATEWEB, label: "EstateWeb CMS" },
  { id: IntegrationTypes.OPENAI, label: "OpenAI" },
  { id: IntegrationTypes.ANTHROPIC, label: "Anthropic" },
  { id: IntegrationTypes.GEMINI, label: "Google Gemini" },
  { id: IntegrationTypes.DEEPSEEK, label: "DeepSeek" },
];

export function getIntegrationTypeLabel(type: IntegrationType | string): string {
  return IntegrationTypeOptions.find((option) => option.id === type)?.label ?? type;
}
