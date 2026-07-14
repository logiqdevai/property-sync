import type { AuthType, IntegrationType } from "@/features/integration-targets/interfaces/integration-targets.interfaces";

export type { AuthType, IntegrationType };

export interface AvailableIntegrationTarget {
  id: string;
  integration_type: IntegrationType;
  auth_type: AuthType;
  base_url: string | null;
  allow_multiple: boolean;
  is_visible: boolean;
  is_enabled: boolean;
  is_connected: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaskedUserIntegrationConnection {
  id: string;
  integration_target_id: string;
  user_id: string;
  api_key_secret: string | null;
  email: string | null;
  username: string | null;
  password: string | null;
  has_api_key_secret: boolean;
  has_password: boolean;
  has_config: boolean;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  integration_target: {
    id: string;
    integration_type: IntegrationType;
    auth_type: AuthType;
    base_url: string | null;
    allow_multiple: boolean;
    is_visible: boolean;
    is_enabled: boolean;
  };
}

export interface CreateConnectionPayload {
  integration_target_id: string;
  api_key_secret?: string;
  email?: string;
  username?: string;
  password?: string;
  config?: Record<string, unknown>;
}

export interface UpdateConnectionPayload {
  api_key_secret?: string;
  email?: string;
  username?: string;
  password?: string;
  config?: Record<string, unknown>;
}
