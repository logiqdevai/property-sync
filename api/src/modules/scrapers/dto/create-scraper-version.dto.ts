import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateScraperVersionDto {
  @ApiProperty({ description: 'Full scraper config for this version' })
  @IsObject()
  config: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description: 'Reason for the change / summary of what changed',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
