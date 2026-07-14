import { Chip } from "@heroui/react";
import { GenerationRunStatuses, type GenerationRunStatus } from "../interfaces/scraper-generation.interfaces";

const statusColor: Record<GenerationRunStatus, "success" | "default" | "warning" | "danger"> = {
  [GenerationRunStatuses.QUEUED]: "default",
  [GenerationRunStatuses.RUNNING]: "warning",
  [GenerationRunStatuses.AWAITING_REVIEW]: "warning",
  [GenerationRunStatuses.SUCCESS]: "success",
  [GenerationRunStatuses.FAILED]: "danger",
  [GenerationRunStatuses.CANCELLED]: "default",
};

const statusLabel: Record<GenerationRunStatus, string> = {
  [GenerationRunStatuses.QUEUED]: "Queued",
  [GenerationRunStatuses.RUNNING]: "Running",
  [GenerationRunStatuses.AWAITING_REVIEW]: "Awaiting review",
  [GenerationRunStatuses.SUCCESS]: "Success",
  [GenerationRunStatuses.FAILED]: "Failed",
  [GenerationRunStatuses.CANCELLED]: "Cancelled",
};

interface GenerationRunStatusChipProps {
  status: GenerationRunStatus;
}

export function GenerationRunStatusChip({ status }: GenerationRunStatusChipProps) {
  return (
    <Chip color={statusColor[status]} size="sm" variant="soft">
      <Chip.Label>{statusLabel[status]}</Chip.Label>
    </Chip>
  );
}
