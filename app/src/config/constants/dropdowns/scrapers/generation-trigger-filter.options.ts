import {
  GenerationTriggers,
  type GenerationTrigger,
} from "@/features/scraper-generation/interfaces/scraper-generation.interfaces";

export const GenerationTriggerFilterOptions: { id: GenerationTrigger | "all"; label: string }[] = [
  { id: "all", label: "All triggers" },
  { id: GenerationTriggers.MANUAL, label: "Manual" },
  { id: GenerationTriggers.SELF_HEAL, label: "Self-heal" },
  { id: GenerationTriggers.SCHEDULED, label: "Scheduled" },
];
