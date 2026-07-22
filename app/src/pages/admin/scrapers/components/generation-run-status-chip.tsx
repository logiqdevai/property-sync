import { Chip } from "@heroui/react";
import { GenerationRunStatusFilterOptions } from "@/config/constants/dropdowns/scrapers/generation-run-status-filter.options";
import { getDropdownOptionLabel } from "@/lib/dropdown-option-label.utils";
import { GenerationRunStatuses, type GenerationRunStatus } from "@/features/scraper-generation/interfaces/scraper-generation.interfaces";

const statusColor: Record<GenerationRunStatus, "success" | "default" | "warning" | "danger"> = {
  [GenerationRunStatuses.QUEUED]: "default",
  [GenerationRunStatuses.RUNNING]: "warning",
  [GenerationRunStatuses.AWAITING_REVIEW]: "warning",
  [GenerationRunStatuses.SUCCESS]: "success",
  [GenerationRunStatuses.FAILED]: "danger",
  [GenerationRunStatuses.CANCELLED]: "default",
};

interface GenerationRunStatusChipProps {
  status: GenerationRunStatus;
}

export function GenerationRunStatusChip({ status }: GenerationRunStatusChipProps) {
  return (
    <Chip color={statusColor[status]} size="sm" variant="soft">
      <Chip.Label>{getDropdownOptionLabel(GenerationRunStatusFilterOptions, status)}</Chip.Label>
    </Chip>
  );
}
