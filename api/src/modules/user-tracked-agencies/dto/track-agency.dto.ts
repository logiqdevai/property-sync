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

export class TrackAgencyDto {
  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  track_new_listings?: boolean;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  track_removed_listings?: boolean;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  track_updated_listings?: boolean;

  @ApiProperty({
    required: false,
    default: true,
    description:
      'When true, listing updates are pushed to the CMS automatically. When false, push from the Properties page.',
  })
  @IsOptional()
  @IsBoolean()
  auto_update_to_crm?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  use_ai_batching?: boolean;

  @ApiProperty({ required: false, description: 'PATCH only' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

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

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  text_truncate_pieces?: string[];

  @ApiProperty({
    required: false,
    default: false,
    description: 'When true, remove watermarks from listing images',
  })
  @IsOptional()
  @IsBoolean()
  remove_watermark?: boolean;

  @ApiProperty({
    required: false,
    default: 10,
    minimum: 1,
    description: 'How many images per listing to remove watermarks from',
    example: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  watermark_image_count?: number;
}
