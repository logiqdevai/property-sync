import {
  ActivityOutcomes,
  type ActivityOutcome,
} from "@/features/activity-logs/interfaces/activity-logs.interfaces";

export const ActivityOutcomeFilterOptions: { id: ActivityOutcome | "all"; label: string }[] = [
  { id: "all", label: "All outcomes" },
  { id: ActivityOutcomes.SUCCESS, label: "Success" },
  { id: ActivityOutcomes.FAILURE, label: "Failure" },
];
