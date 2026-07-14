import {
  PropertyStatuses,
  type PropertyStatus,
} from "@/features/properties/interfaces/properties.interfaces";

export const PropertyStatusFilterOptions: { id: PropertyStatus | "all"; label: string }[] = [
  { id: "all", label: "All statuses" },
  ...Object.values(PropertyStatuses).map((status) => ({
    id: status,
    label: status.replace(/_/g, " "),
  })),
];
