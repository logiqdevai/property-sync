import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';

export class RemoveWatermarkImagesDto {
  @ApiPropertyOptional({
    type: [String],
    minItems: 1,
    description: 'Specific CRM image ids. Required when image_count is omitted.',
  })
  @ValidateIf((dto: RemoveWatermarkImagesDto) => dto.image_count == null)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  image_ids?: string[];

  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Remove watermarks from the first N CRM images. Required when image_ids is omitted.',
  })
  @ValidateIf(
    (dto: RemoveWatermarkImagesDto) =>
      dto.image_ids == null || dto.image_ids.length === 0,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  image_count?: number;

  @ApiProperty()
  @IsBoolean()
  replace_crm_images: boolean;
}

export class BulkRemoveWatermarkImagesDto {
  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiProperty({
    minimum: 1,
    description: 'Remove watermarks from the first N CRM images per property',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  image_count: number;

  @ApiProperty()
  @IsBoolean()
  replace_crm_images: boolean;
}
