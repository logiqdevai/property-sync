import { z } from "zod";
import {
  AuthTypes,
  isAiIntegrationType,
  type AuthType,
  type IntegrationType,
} from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import { isMaskedSecretValue } from "@/lib/masked-secret.utils";

export type MaskedCredentialValues = {
  email?: string | null;
  username?: string | null;
  password?: string | null;
  api_key_secret?: string | null;
  webhook_key?: string | null;
};

const optionalWebhookKeyField = {
  webhook_key: z.string().optional().or(z.literal("")),
};

const requiredWebhookKeyField = {
  webhook_key: z.string().min(1, "Webhook signing secret is required"),
};

const bearerTokenBase = z.object({
  auth_type: z.literal(AuthTypes.BEARER_TOKEN),
  api_key_secret: z.string().min(1, "Bearer token is required"),
});

const apiKeyBase = z.object({
  auth_type: z.literal(AuthTypes.API_KEY),
  api_key_secret: z.string().min(1, "API key is required"),
});

const bearerTokenSchema = bearerTokenBase.extend(optionalWebhookKeyField);
const apiKeySchema = apiKeyBase.extend(optionalWebhookKeyField);
const aiBearerTokenSchema = bearerTokenBase.extend(requiredWebhookKeyField);
const aiApiKeySchema = apiKeyBase.extend(requiredWebhookKeyField);

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

export function getEditFormDefaultValues(
  authType: AuthType,
  credentials: MaskedCredentialValues,
): ConnectCredentialsFormValues {
  switch (authType) {
    case AuthTypes.EMAIL_PASSWORD:
      return {
        auth_type: AuthTypes.EMAIL_PASSWORD,
        email: credentials.email ?? "",
        password: "",
      };
    case AuthTypes.USERNAME_PASSWORD:
      return {
        auth_type: AuthTypes.USERNAME_PASSWORD,
        username: credentials.username ?? "",
        password: "",
      };
    case AuthTypes.BEARER_TOKEN:
      return {
        auth_type: AuthTypes.BEARER_TOKEN,
        api_key_secret: "",
        webhook_key: "",
      };
    case AuthTypes.API_KEY:
      return {
        auth_type: AuthTypes.API_KEY,
        api_key_secret: "",
        webhook_key: "",
      };
    case AuthTypes.OAUTH:
      return {
        auth_type: AuthTypes.OAUTH,
        configJson: "",
      };
    default:
      return {
        auth_type: AuthTypes.API_KEY,
        api_key_secret: "",
        webhook_key: "",
      };
  }
}

export function getConnectCredentialsSchema(
  authType: AuthType,
  integrationType?: IntegrationType,
) {
  const includeWebhook = integrationType && isAiIntegrationType(integrationType);

  switch (authType) {
    case AuthTypes.EMAIL_PASSWORD:
      return emailPasswordSchema;
    case AuthTypes.USERNAME_PASSWORD:
      return usernamePasswordSchema;
    case AuthTypes.BEARER_TOKEN:
      return includeWebhook
        ? aiBearerTokenSchema
        : bearerTokenSchema.omit({ webhook_key: true });
    case AuthTypes.API_KEY:
      return includeWebhook ? aiApiKeySchema : apiKeySchema.omit({ webhook_key: true });
    case AuthTypes.OAUTH:
      return oauthSchema;
    default:
      return includeWebhook ? aiApiKeySchema : apiKeySchema.omit({ webhook_key: true });
  }
}

export function mapConnectFormToPayload(
  targetId: string,
  values: ConnectCredentialsFormValues,
): {
  integration_target_id: string;
  api_key_secret?: string;
  webhook_key?: string;
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
      return {
        ...base,
        api_key_secret: values.api_key_secret,
        ...("webhook_key" in values && values.webhook_key
          ? { webhook_key: values.webhook_key }
          : {}),
      };
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
  webhook_key?: string;
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
        ...(values.password && !isMaskedSecretValue(values.password)
          ? { password: values.password }
          : {}),
      };
    case AuthTypes.USERNAME_PASSWORD:
      return {
        ...(values.username ? { username: values.username } : {}),
        ...(values.password && !isMaskedSecretValue(values.password)
          ? { password: values.password }
          : {}),
      };
    case AuthTypes.BEARER_TOKEN:
    case AuthTypes.API_KEY: {
      const payload: {
        api_key_secret?: string;
        webhook_key?: string;
      } = {};

      if (
        values.api_key_secret &&
        !isMaskedSecretValue(values.api_key_secret)
      ) {
        payload.api_key_secret = values.api_key_secret;
      }

      if (
        "webhook_key" in values &&
        values.webhook_key &&
        !isMaskedSecretValue(values.webhook_key)
      ) {
        payload.webhook_key = values.webhook_key;
      }

      return payload;
    }
    case AuthTypes.OAUTH:
      return values.configJson
        ? { config: JSON.parse(values.configJson) as Record<string, unknown> }
        : {};
    default:
      return {};
  }
}
