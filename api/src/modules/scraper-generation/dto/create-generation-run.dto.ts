import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateGenerationRunDto {
  @ApiProperty({ description: 'Source agency to generate/fix a scraper for' })
  @IsUUID()
  source_agency_id: string;

  @ApiProperty({
    required: false,
    description: 'Set when this run is fixing/updating an existing scraper',
  })
  @IsOptional()
  @IsUUID()
  scraper_id?: string;

  @ApiProperty({
    required: false,
    description: 'Goal/instructions given to the model',
  })
  @IsOptional()
  @IsString()
  prompt?: string;
}
