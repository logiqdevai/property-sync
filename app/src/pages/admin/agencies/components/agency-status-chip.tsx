import { Chip } from "@heroui/react";
import { AgencyStatusFilterOptions } from "@/config/constants/dropdowns/agency-status-filter.options";
import { getDropdownOptionLabel } from "@/lib/dropdown-option-label.utils";
import type { AgencyStatus } from "@/features/agencies/interfaces/agencies.interfaces";
import { AgencyStatuses } from "@/features/agencies/interfaces/agencies.interfaces";

const statusColor: Record<AgencyStatus, "success" | "default" | "danger"> = {
  [AgencyStatuses.ACTIVE]: "success",
  [AgencyStatuses.DISABLED]: "default",
  [AgencyStatuses.ARCHIVED]: "danger",
};

interface AgencyStatusChipProps {
  status: AgencyStatus;
}

export function AgencyStatusChip({ status }: AgencyStatusChipProps) {
  return (
    <Chip color={statusColor[status]} size="sm" variant="soft">
      <Chip.Label>{getDropdownOptionLabel(AgencyStatusFilterOptions, status)}</Chip.Label>
    </Chip>
  );
}
