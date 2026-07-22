import type { PropertyStatus } from "@/features/properties/interfaces/properties.interfaces";
import { PropertyStatusFormOptions } from "@/config/constants/dropdowns/properties/property-status-form.options";

export const PropertyStatusFilterOptions: { id: PropertyStatus | "all"; label: string }[] = [
  { id: "all", label: "All statuses" },
  ...PropertyStatusFormOptions,
];
