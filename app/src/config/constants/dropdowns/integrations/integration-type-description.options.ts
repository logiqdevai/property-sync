import {
  IntegrationTypes,
  type IntegrationType,
} from "@/features/integration-targets/interfaces/integration-targets.interfaces";

export const IntegrationTypeDescriptionOptions: { id: IntegrationType; description: string }[] = [
  {
    id: IntegrationTypes.ESTATEWEB,
    description: "Publish normalized property listings to your EstateWeb CMS.",
  },
  {
    id: IntegrationTypes.OPENAI,
    description: "Generate and normalize listing content with your OpenAI API key.",
  },
  {
    id: IntegrationTypes.ANTHROPIC,
    description: "Power listing normalization and scraper generation with Anthropic.",
  },
  {
    id: IntegrationTypes.GEMINI,
    description: "Normalize property listings with your Google Gemini API key.",
  },
  {
    id: IntegrationTypes.DEEPSEEK,
    description: "Normalize property listings with your DeepSeek API key.",
  },
  {
    id: IntegrationTypes.DEWATERMARK,
    description: "Remove watermarks from listing images with your Dewatermark API key.",
  },
];

export function getIntegrationTypeDescription(type: IntegrationType | string): string {
  return (
    IntegrationTypeDescriptionOptions.find((option) => option.id === type)?.description ?? ""
  );
}
