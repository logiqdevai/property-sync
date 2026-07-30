import {
  IntegrationTypes,
  type IntegrationType,
} from "@/features/integration-targets/interfaces/integration-targets.interfaces";

export const IntegrationTypeFormOptions: { id: IntegrationType; label: string }[] = [
  { id: IntegrationTypes.ESTATEWEB, label: "EstateWeb CMS" },
  { id: IntegrationTypes.OPENAI, label: "OpenAI" },
  { id: IntegrationTypes.ANTHROPIC, label: "Anthropic" },
  { id: IntegrationTypes.GEMINI, label: "Google Gemini" },
  { id: IntegrationTypes.DEEPSEEK, label: "DeepSeek" },
  { id: IntegrationTypes.DEWATERMARK, label: "Dewatermark" },
  { id: IntegrationTypes.GOOGLE_TRANSLATE, label: "Google Translate" },
  { id: IntegrationTypes.AZURE, label: "Azure Translator" },
];

export function getIntegrationTypeLabel(type: IntegrationType | string): string {
  return IntegrationTypeFormOptions.find((option) => option.id === type)?.label ?? type;
}
