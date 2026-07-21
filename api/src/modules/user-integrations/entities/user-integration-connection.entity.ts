import { ApiProperty } from '@nestjs/swagger';
import { AuthType, IntegrationType } from 'generated/prisma';

export class AvailableIntegrationTargetEntity {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: IntegrationType })
  integration_type: IntegrationType;

  @ApiProperty({ enum: AuthType })
  auth_type: AuthType;

  @ApiProperty({ nullable: true })
  base_url: string | null;

  @ApiProperty()
  allow_multiple: boolean;

  @ApiProperty()
  is_visible: boolean;

  @ApiProperty()
  is_enabled: boolean;

  @ApiProperty()
  is_connected: boolean;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}

export class UserIntegrationSettingsEntity {
  @ApiProperty({ nullable: true })
  id: string | null;

  @ApiProperty()
  integration_target_id: string;

  @ApiProperty()
  user_id: string;

  @ApiProperty({ nullable: true, type: Object })
  settings: Record<string, unknown> | null;

  @ApiProperty({ nullable: true })
  created_at: Date | null;

  @ApiProperty({ nullable: true })
  updated_at: Date | null;
}

export class UserIntegrationConnectionEntity {
  @ApiProperty()
  id: string;

  @ApiProperty()
  integration_target_id: string;

  @ApiProperty()
  user_id: string;

  @ApiProperty()
  user_integration_settings_id: string;

  @ApiProperty({ nullable: true })
  api_key_secret: string | null;

  @ApiProperty({ nullable: true })
  webhook_key: string | null;

  @ApiProperty({ nullable: true })
  email: string | null;

  @ApiProperty({ nullable: true })
  username: string | null;

  @ApiProperty({ nullable: true })
  password: string | null;

  @ApiProperty()
  has_api_key_secret: boolean;

  @ApiProperty()
  has_webhook_key: boolean;

  @ApiProperty()
  has_password: boolean;

  @ApiProperty()
  has_config: boolean;

  @ApiProperty()
  is_active: boolean;

  @ApiProperty()
  is_default: boolean;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiProperty()
  integration_target: {
    id: string;
    integration_type: IntegrationType;
    auth_type: AuthType;
    base_url: string | null;
    allow_multiple: boolean;
    is_visible: boolean;
    is_enabled: boolean;
  };

  @ApiProperty({ type: UserIntegrationSettingsEntity })
  settings: UserIntegrationSettingsEntity;
}
