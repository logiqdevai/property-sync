import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateScraperVersionDto {
  @ApiProperty({
    required: false,
    description:
      'Full scraper config for this version. Omit or leave empty to store an empty config object.',
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description: 'Reason for the change / summary of what changed',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
