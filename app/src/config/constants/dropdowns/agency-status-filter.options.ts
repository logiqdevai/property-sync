import {
  AgencyStatuses,
  type AgencyStatus,
} from "@/features/agencies/interfaces/agencies.interfaces";

export const AgencyStatusFilterOptions: { id: AgencyStatus | "all"; label: string }[] = [
  { id: "all", label: "All statuses" },
  { id: AgencyStatuses.ACTIVE, label: "Active" },
  { id: AgencyStatuses.DISABLED, label: "Disabled" },
  { id: AgencyStatuses.ARCHIVED, label: "Archived" },
];
