import { Chip } from "@heroui/react";
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

const statusLabel: Record<JobStatus, string> = {
  [JobStatuses.WAITING]: "Waiting",
  [JobStatuses.ACTIVE]: "Active",
  [JobStatuses.COMPLETED]: "Completed",
  [JobStatuses.FAILED]: "Failed",
  [JobStatuses.DELAYED]: "Delayed",
  [JobStatuses.PAUSED]: "Paused",
  [JobStatuses.STALLED]: "Stalled",
};

interface JobStatusChipProps {
  status: JobStatus;
}

export function JobStatusChip({ status }: JobStatusChipProps) {
  return (
    <Chip color={statusColor[status]} size="sm" variant="soft">
      <Chip.Label>{statusLabel[status]}</Chip.Label>
    </Chip>
  );
}
