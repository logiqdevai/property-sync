import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

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

  @ApiProperty({
    required: false,
    description:
      'Hard cap on computer-use steps for this run (cost control). Defaults to 15, max 50.',
    minimum: 1,
    maximum: 50,
    default: 15,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  max_steps?: number;
}
