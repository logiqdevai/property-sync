import { ApiProperty } from '@nestjs/swagger';

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
}
