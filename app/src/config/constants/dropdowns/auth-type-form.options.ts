import type { AuthType } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import { AuthTypeOptions } from "@/features/integration-targets/utils/auth-type-label.utils";

export const AuthTypeFormOptions: { id: AuthType; label: string }[] = AuthTypeOptions;
