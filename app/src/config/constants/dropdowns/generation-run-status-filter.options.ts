import {
  GenerationRunStatuses,
  type GenerationRunStatus,
} from "@/features/scraper-generation/interfaces/scraper-generation.interfaces";

export const GenerationRunStatusFilterOptions: { id: GenerationRunStatus | "all"; label: string }[] = [
  { id: "all", label: "All statuses" },
  { id: GenerationRunStatuses.QUEUED, label: "Queued" },
  { id: GenerationRunStatuses.RUNNING, label: "Running" },
  { id: GenerationRunStatuses.AWAITING_REVIEW, label: "Awaiting review" },
  { id: GenerationRunStatuses.SUCCESS, label: "Success" },
  { id: GenerationRunStatuses.FAILED, label: "Failed" },
  { id: GenerationRunStatuses.CANCELLED, label: "Cancelled" },
];
