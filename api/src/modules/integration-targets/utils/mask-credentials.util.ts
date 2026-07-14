import { Prisma } from 'generated/prisma';

export type UserIntegrationRecord = {
  id: string;
  integration_target_id: string;
  user_id: string;
  api_key_secret: string | null;
  email: string | null;
  username: string | null;
  password: string | null;
  config: Prisma.JsonValue | null;
  is_active: boolean;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
};

export type MaskedUserIntegration = Omit<
  UserIntegrationRecord,
  'config'
> & {
  has_api_key_secret: boolean;
  has_password: boolean;
  has_config: boolean;
};

function maskSecret(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value.length <= 4) {
    return '••••';
  }
  return `••••${value.slice(-4)}`;
}

export function maskUserIntegration(
  record: UserIntegrationRecord,
): MaskedUserIntegration {
  const { api_key_secret, password, config, ...rest } = record;

  return {
    ...rest,
    api_key_secret: maskSecret(api_key_secret),
    password: maskSecret(password),
    has_api_key_secret: !!api_key_secret,
    has_password: !!password,
    has_config: config !== null && config !== undefined,
  };
}
