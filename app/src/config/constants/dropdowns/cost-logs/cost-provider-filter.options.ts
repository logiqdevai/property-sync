import {
  CostProviders,
  type CostProvider,
} from "@/features/cost-logs/interfaces/cost-logs.interfaces";

export const CostProviderFilterOptions: { id: CostProvider | "all"; label: string }[] = [
  { id: "all", label: "All providers" },
  { id: CostProviders.OPENAI, label: "OpenAI" },
  { id: CostProviders.GOOGLE_TRANSLATE, label: "Google Translate" },
  { id: CostProviders.AZURE, label: "Azure Translator" },
  { id: CostProviders.DEWATERMARK, label: "Dewatermark" },
];
