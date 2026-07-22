import {
  JobStatuses,
  type JobStatus,
} from "@/features/jobs/interfaces/jobs.interfaces";

export const JobStatusFilterOptions: { id: JobStatus | "all"; label: string }[] = [
  { id: "all", label: "All statuses" },
  { id: JobStatuses.WAITING, label: "Waiting" },
  { id: JobStatuses.ACTIVE, label: "Active" },
  { id: JobStatuses.COMPLETED, label: "Completed" },
  { id: JobStatuses.FAILED, label: "Failed" },
  { id: JobStatuses.DELAYED, label: "Delayed" },
  { id: JobStatuses.PAUSED, label: "Paused" },
  { id: JobStatuses.STALLED, label: "Stalled" },
];
