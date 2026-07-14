import type { IntegrationType } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import { IntegrationTypeOptions } from "@/features/integration-targets/utils/integration-type-label.utils";

export const IntegrationTypeFilterOptions: { id: IntegrationType | "all"; label: string }[] = [
  { id: "all", label: "All types" },
  ...IntegrationTypeOptions,
];
