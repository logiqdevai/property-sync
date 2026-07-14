import type { AuthType } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import { AuthTypeOptions } from "@/features/integration-targets/utils/auth-type-label.utils";

export const AuthTypeFilterOptions: { id: AuthType | "all"; label: string }[] = [
  { id: "all", label: "All auth types" },
  ...AuthTypeOptions,
];
