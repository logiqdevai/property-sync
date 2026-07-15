export const IntegrationTypes = {
  ESTATEWEB: "ESTATEWEB",
  OPENAI: "OPENAI",
  ANTHROPIC: "ANTHROPIC",
  GEMINI: "GEMINI",
  DEEPSEEK: "DEEPSEEK",
} as const;

export type IntegrationType = (typeof IntegrationTypes)[keyof typeof IntegrationTypes];

export const AiIntegrationTypeList = [
  IntegrationTypes.OPENAI,
  IntegrationTypes.ANTHROPIC,
  IntegrationTypes.GEMINI,
  IntegrationTypes.DEEPSEEK,
] as const satisfies readonly IntegrationType[];

export function isAiIntegrationType(type: IntegrationType | string): boolean {
  return (AiIntegrationTypeList as readonly string[]).includes(type);
}

export const AuthTypes = {
  EMAIL_PASSWORD: "EMAIL_PASSWORD",
  USERNAME_PASSWORD: "USERNAME_PASSWORD",
  BEARER_TOKEN: "BEARER_TOKEN",
  API_KEY: "API_KEY",
  OAUTH: "OAUTH",
} as const;

export type AuthType = (typeof AuthTypes)[keyof typeof AuthTypes];

export interface IntegrationTarget {
  id: string;
  integration_type: IntegrationType;
  auth_type: AuthType;
  base_url: string | null;
  allow_multiple: boolean;
  is_visible: boolean;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  _count?: {
    user_integrations: number;
  };
}

export interface MaskedUserIntegration {
  id: string;
  integration_target_id: string;
  user_id: string;
  api_key_secret: string | null;
  webhook_key: string | null;
  email: string | null;
  username: string | null;
  password: string | null;
  has_api_key_secret: boolean;
  has_webhook_key: boolean;
  has_password: boolean;
  has_config: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    email: string;
  };
}

export interface IntegrationTargetDetail extends IntegrationTarget {
  user_integrations_count: number;
  user_integrations: MaskedUserIntegration[];
}

export interface CreateIntegrationTargetPayload {
  integration_type: IntegrationType;
  auth_type: AuthType;
  base_url?: string;
  allow_multiple?: boolean;
  is_visible?: boolean;
  is_enabled?: boolean;
}

export interface UpdateIntegrationTargetPayload extends Partial<CreateIntegrationTargetPayload> {}

export interface IntegrationTargetListQuery {
  page?: number;
  limit?: number;
  integration_type?: IntegrationType;
  auth_type?: AuthType;
  is_visible?: boolean;
  is_enabled?: boolean;
}

export interface CreateUserIntegrationAccountPayload {
  user_id: string;
  api_key_secret?: string;
  email?: string;
  username?: string;
  password?: string;
  config?: Record<string, unknown>;
}

export interface UpdateUserIntegrationAccountPayload {
  is_active?: boolean;
  api_key_secret?: string;
  email?: string;
  username?: string;
  password?: string;
  config?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}
