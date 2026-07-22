import type { AuthType } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import { AuthTypeFormOptions } from "@/config/constants/dropdowns/integrations/auth-type-form.options";

export const AuthTypeFilterOptions: { id: AuthType | "all"; label: string }[] = [
  { id: "all", label: "All auth types" },
  ...AuthTypeFormOptions,
];
