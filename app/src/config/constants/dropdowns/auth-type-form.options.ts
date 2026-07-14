import {
  AuthTypes,
  type AuthType,
} from "@/features/integration-targets/interfaces/integration-targets.interfaces";

export const AuthTypeFormOptions: { id: AuthType; label: string }[] = [
  { id: AuthTypes.EMAIL_PASSWORD, label: "Email + password" },
  { id: AuthTypes.USERNAME_PASSWORD, label: "Username + password" },
  { id: AuthTypes.BEARER_TOKEN, label: "Bearer token" },
  { id: AuthTypes.API_KEY, label: "API key" },
  { id: AuthTypes.OAUTH, label: "OAuth" },
];
