import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateTrackerAdminSettingsDto {
  @ApiProperty({ required: false, minimum: 1, example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  concurrent_insertions?: number;

  @ApiProperty({ required: false, minimum: 0, example: 300 })
  @IsOptional()
  @IsInt()
  @Min(0)
  insertion_interval_seconds?: number;

  @ApiProperty({
    required: false,
    nullable: true,
    minimum: 1,
    description:
      'Max listings to insert into the linked CMS. Null clears the cap (unlimited).',
    example: 100,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  max_properties?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  use_ai_batching?: boolean;

  @ApiProperty({
    required: false,
    type: [String],
    description:
      'Substrings removed from title/description before creating the user property',
    example: ['Agency footer text', 'Call us at'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  text_truncate_pieces?: string[];
}
