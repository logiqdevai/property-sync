import type { IntegrationType } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import { IntegrationTypeOptions } from "@/features/integration-targets/utils/integration-type-label.utils";

export const IntegrationTypeFormOptions: { id: IntegrationType; label: string }[] =
  IntegrationTypeOptions;
