import type { IntegrationType } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import { IntegrationTypeFormOptions } from "@/config/constants/dropdowns/integration-type-form.options";

export const IntegrationTypeFilterOptions: { id: IntegrationType | "all"; label: string }[] = [
  { id: "all", label: "All types" },
  ...IntegrationTypeFormOptions,
];
