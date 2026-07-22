import { Chip } from "@heroui/react";
import { JobStatusFilterOptions } from "@/config/constants/dropdowns/jobs/job-status-filter.options";
import { getDropdownOptionLabel } from "@/lib/dropdown-option-label.utils";
import { JobStatuses, type JobStatus } from "@/features/jobs/interfaces/jobs.interfaces";

const statusColor: Record<JobStatus, "success" | "default" | "warning" | "danger"> = {
  [JobStatuses.WAITING]: "default",
  [JobStatuses.ACTIVE]: "warning",
  [JobStatuses.COMPLETED]: "success",
  [JobStatuses.FAILED]: "danger",
  [JobStatuses.DELAYED]: "warning",
  [JobStatuses.PAUSED]: "default",
  [JobStatuses.STALLED]: "danger",
};

interface JobStatusChipProps {
  status: JobStatus;
}

export function JobStatusChip({ status }: JobStatusChipProps) {
  return (
    <Chip color={statusColor[status]} size="sm" variant="soft">
      <Chip.Label>{getDropdownOptionLabel(JobStatusFilterOptions, status)}</Chip.Label>
    </Chip>
  );
}
