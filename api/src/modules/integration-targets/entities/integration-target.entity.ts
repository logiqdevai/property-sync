import { ApiProperty } from '@nestjs/swagger';
import { AuthType, IntegrationType } from 'generated/prisma';

export class IntegrationTarget {
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
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiProperty({
    required: false,
    description: 'Present on list responses',
    example: { user_integrations: 3 },
  })
  _count?: {
    user_integrations: number;
  };
}
