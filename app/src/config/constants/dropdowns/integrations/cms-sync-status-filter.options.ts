import {
  CmsSyncStatuses,
  type CmsSyncStatus,
} from "@/features/cms-sync-runs/interfaces/cms-sync-runs.interfaces";

export const CmsSyncStatusFilterOptions: { id: CmsSyncStatus | "all"; label: string }[] = [
  { id: "all", label: "All statuses" },
  { id: CmsSyncStatuses.PENDING, label: "Pending" },
  { id: CmsSyncStatuses.SUCCESS, label: "Success" },
  { id: CmsSyncStatuses.FAILED, label: "Failed" },
  { id: CmsSyncStatuses.RETRYING, label: "Retrying" },
  { id: CmsSyncStatuses.CANCELLED, label: "Cancelled" },
];
