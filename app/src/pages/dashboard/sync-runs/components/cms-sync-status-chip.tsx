import { Chip } from "@heroui/react";
import { CmsSyncStatusFilterOptions } from "@/config/constants/dropdowns/cms-sync-status-filter.options";
import { getDropdownOptionLabel } from "@/lib/dropdown-option-label.utils";
import {
  CmsSyncStatuses,
  type CmsSyncStatus,
} from "@/features/cms-sync-runs/interfaces/cms-sync-runs.interfaces";

const statusColor: Record<CmsSyncStatus, "success" | "default" | "warning" | "danger"> = {
  [CmsSyncStatuses.PENDING]: "default",
  [CmsSyncStatuses.SUCCESS]: "success",
  [CmsSyncStatuses.FAILED]: "danger",
  [CmsSyncStatuses.RETRYING]: "warning",
};

interface CmsSyncStatusChipProps {
  status: CmsSyncStatus;
}

export function CmsSyncStatusChip({ status }: CmsSyncStatusChipProps) {
  return (
    <Chip color={statusColor[status]} size="sm" variant="soft">
      <Chip.Label>{getDropdownOptionLabel(CmsSyncStatusFilterOptions, status)}</Chip.Label>
    </Chip>
  );
}
