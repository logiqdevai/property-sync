import { ApiProperty } from '@nestjs/swagger';
import { UserIntegrationSettingsData } from '@/modules/user-integrations/interfaces/user-integration-settings.interface';

export class UserIntegrationSettingsEntity {
  @ApiProperty({ nullable: true })
  id: string | null;

  @ApiProperty()
  integration_target_id: string;

  @ApiProperty()
  user_id: string;

  @ApiProperty({
    nullable: true,
    type: Object,
    example: {
      estateweb_default_sites: [
        {
          selected: true,
          name: '1. re1.gr',
          agent_site_id: 1002,
          show_on_slider: 0,
          show_on_first_page: 0,
          show_on_relative_pages: 1,
        },
      ],
      estateweb_ad_languages: [1, 2],
    },
  })
  settings: UserIntegrationSettingsData | null;

  @ApiProperty({ nullable: true })
  created_at: Date | null;

  @ApiProperty({ nullable: true })
  updated_at: Date | null;
}

export class MaskedUserIntegrationEntity {
  @ApiProperty()
  id: string;

  @ApiProperty()
  integration_target_id: string;

  @ApiProperty()
  user_id: string;

  @ApiProperty({ nullable: true, description: 'Masked secret tail only' })
  api_key_secret: string | null;

  @ApiProperty({ nullable: true })
  email: string | null;

  @ApiProperty({ nullable: true })
  username: string | null;

  @ApiProperty({ nullable: true, description: 'Masked secret tail only' })
  password: string | null;

  @ApiProperty()
  has_api_key_secret: boolean;

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

  @ApiProperty({
    required: false,
    example: { id: 'uuid', email: 'user@example.com' },
  })
  user?: {
    id: string;
    email: string;
  };

  @ApiProperty({ type: UserIntegrationSettingsEntity, required: false })
  settings?: UserIntegrationSettingsEntity;
}
