import { Chip } from "@heroui/react";
import { AgencyStatuses, type AgencyStatus } from "@/features/agencies/interfaces/agencies.interfaces";

const statusColor: Record<AgencyStatus, "success" | "default" | "danger"> = {
  [AgencyStatuses.ACTIVE]: "success",
  [AgencyStatuses.DISABLED]: "default",
  [AgencyStatuses.ARCHIVED]: "danger",
};

const statusLabel: Record<AgencyStatus, string> = {
  [AgencyStatuses.ACTIVE]: "Active",
  [AgencyStatuses.DISABLED]: "Disabled",
  [AgencyStatuses.ARCHIVED]: "Archived",
};

interface AgencyStatusChipProps {
  status: AgencyStatus;
}

export function AgencyStatusChip({ status }: AgencyStatusChipProps) {
  return (
    <Chip color={statusColor[status]} size="sm" variant="soft">
      <Chip.Label>{statusLabel[status]}</Chip.Label>
    </Chip>
  );
}
