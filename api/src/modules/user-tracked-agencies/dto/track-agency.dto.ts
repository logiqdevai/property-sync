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
    default: false,
    description:
      'When true, listing updates are pushed to the CMS automatically. When false, push from the Properties page.',
  })
  @IsOptional()
  @IsBoolean()
  auto_update_to_crm?: boolean;

  @ApiProperty({
    required: false,
    default: true,
    description:
      'When true, CRM updates are pushed only if the source listing content_hash changed (stricter mode).',
  })
  @IsOptional()
  @IsBoolean()
  cms_update_on_hash_only?: boolean;

  @ApiProperty({ required: false, description: 'PATCH only' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ required: false, minimum: 1, example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  concurrent_insertions?: number;

  @ApiProperty({ required: false, minimum: 0, example: 1 })
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
    description: 'When true, enable watermark removal for listing images',
  })
  @IsOptional()
  @IsBoolean()
  remove_watermark?: boolean;

  @ApiProperty({
    required: false,
    default: 1,
    minimum: 1,
    description:
      'How many leading images per listing to remove watermarks from (automatic mode)',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  watermark_image_count?: number;

  @ApiProperty({
    required: false,
    default: false,
    description:
      'When true with remove_watermark, skip automatic removal and publish with no sites so images can be handled manually',
  })
  @IsOptional()
  @IsBoolean()
  watermark_manual_selection?: boolean;
}
