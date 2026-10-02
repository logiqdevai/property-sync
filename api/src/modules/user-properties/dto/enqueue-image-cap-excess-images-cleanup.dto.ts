import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ImageCapExcessImagesCleanupItemDto {
  @ApiProperty({ example: 'd86ead3f-9ef0-4c2e-8ac0-a46c91a0999b' })
  @IsString()
  user_property_id: string;

  @ApiProperty({ example: 1229693, description: 'EstateWeb image id to delete' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  crm_image_id: number;
}

export class EnqueueImageCapExcessImagesCleanupDto {
  @ApiProperty({ type: [ImageCapExcessImagesCleanupItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImageCapExcessImagesCleanupItemDto)
  items: ImageCapExcessImagesCleanupItemDto[];
}
