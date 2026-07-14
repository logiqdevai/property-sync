import {
  AuthTypes,
  type AuthType,
} from "@/features/integration-targets/interfaces/integration-targets.interfaces";

export const AuthTypeFilterOptions: { id: AuthType | "all"; label: string }[] = [
  { id: "all", label: "All auth types" },
  { id: AuthTypes.API_KEY, label: "API key" },
  { id: AuthTypes.BEARER_TOKEN, label: "Bearer token" },
  { id: AuthTypes.EMAIL_PASSWORD, label: "Email + password" },
  { id: AuthTypes.USERNAME_PASSWORD, label: "Username + password" },
  { id: AuthTypes.OAUTH, label: "OAuth" },
];
