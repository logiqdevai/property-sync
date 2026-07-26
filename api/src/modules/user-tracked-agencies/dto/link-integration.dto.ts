import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class LinkIntegrationDto {
  @ApiProperty({
    description: 'UserIntegration id to link to this tracked agency',
  })
  @IsUUID()
  user_integration_id: string;

  @ApiPropertyOptional({
    description: 'CRM client/contact id for this agency on the linked integration',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  integration_client_id?: number | null;
}
