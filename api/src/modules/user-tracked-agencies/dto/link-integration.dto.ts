import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class LinkIntegrationDto {
  @ApiProperty({ description: 'UserIntegration id to link to this tracked agency' })
  @IsUUID()
  user_integration_id: string;
}
