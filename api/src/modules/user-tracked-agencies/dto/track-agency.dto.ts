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

  @ApiProperty({ required: false, minimum: 1, example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  insertion_interval_minutes?: number;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  text_truncate_pieces?: string[];
}
