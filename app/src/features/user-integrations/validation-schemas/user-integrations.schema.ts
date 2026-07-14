import { z } from "zod";
import { AuthTypes, type AuthType } from "@/features/integration-targets/interfaces/integration-targets.interfaces";

const emailPasswordSchema = z.object({
  auth_type: z.literal(AuthTypes.EMAIL_PASSWORD),
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

const usernamePasswordSchema = z.object({
  auth_type: z.literal(AuthTypes.USERNAME_PASSWORD),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const bearerTokenSchema = z.object({
  auth_type: z.literal(AuthTypes.BEARER_TOKEN),
  api_key_secret: z.string().min(1, "Bearer token is required"),
});

const apiKeySchema = z.object({
  auth_type: z.literal(AuthTypes.API_KEY),
  api_key_secret: z.string().min(1, "API key is required"),
});

const oauthSchema = z.object({
  auth_type: z.literal(AuthTypes.OAUTH),
  configJson: z
    .string()
    .min(1, "OAuth config JSON is required")
    .refine((value) => {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed);
      } catch {
        return false;
      }
    }, "OAuth config must be valid JSON object"),
});

export const connectCredentialsSchema = z.discriminatedUnion("auth_type", [
  emailPasswordSchema,
  usernamePasswordSchema,
  bearerTokenSchema,
  apiKeySchema,
  oauthSchema,
]);

export type ConnectCredentialsFormValues = z.infer<typeof connectCredentialsSchema>;

export function getConnectCredentialsSchema(authType: AuthType) {
  switch (authType) {
    case AuthTypes.EMAIL_PASSWORD:
      return emailPasswordSchema;
    case AuthTypes.USERNAME_PASSWORD:
      return usernamePasswordSchema;
    case AuthTypes.BEARER_TOKEN:
      return bearerTokenSchema;
    case AuthTypes.API_KEY:
      return apiKeySchema;
    case AuthTypes.OAUTH:
      return oauthSchema;
    default:
      return apiKeySchema;
  }
}

export function mapConnectFormToPayload(
  targetId: string,
  values: ConnectCredentialsFormValues,
): {
  integration_target_id: string;
  api_key_secret?: string;
  email?: string;
  username?: string;
  password?: string;
  config?: Record<string, unknown>;
} {
  const base = { integration_target_id: targetId };

  switch (values.auth_type) {
    case AuthTypes.EMAIL_PASSWORD:
      return { ...base, email: values.email, password: values.password };
    case AuthTypes.USERNAME_PASSWORD:
      return { ...base, username: values.username, password: values.password };
    case AuthTypes.BEARER_TOKEN:
    case AuthTypes.API_KEY:
      return { ...base, api_key_secret: values.api_key_secret };
    case AuthTypes.OAUTH:
      return { ...base, config: JSON.parse(values.configJson) as Record<string, unknown> };
    default:
      return base;
  }
}

export function mapEditFormToPayload(
  values: Partial<ConnectCredentialsFormValues>,
): {
  api_key_secret?: string;
  email?: string;
  username?: string;
  password?: string;
  config?: Record<string, unknown>;
} {
  if (!values.auth_type) {
    return {};
  }

  switch (values.auth_type) {
    case AuthTypes.EMAIL_PASSWORD:
      return {
        ...(values.email ? { email: values.email } : {}),
        ...(values.password ? { password: values.password } : {}),
      };
    case AuthTypes.USERNAME_PASSWORD:
      return {
        ...(values.username ? { username: values.username } : {}),
        ...(values.password ? { password: values.password } : {}),
      };
    case AuthTypes.BEARER_TOKEN:
    case AuthTypes.API_KEY:
      return values.api_key_secret ? { api_key_secret: values.api_key_secret } : {};
    case AuthTypes.OAUTH:
      return values.configJson
        ? { config: JSON.parse(values.configJson) as Record<string, unknown> }
        : {};
    default:
      return {};
  }
}
