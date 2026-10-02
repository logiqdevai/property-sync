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

export class DuplicateWatermarkCleanupItemDto {
  @ApiProperty({ example: 'd86ead3f-9ef0-4c2e-8ac0-a46c91a0999b' })
  @IsString()
  user_property_id: string;

  @ApiProperty({ example: 1229693, description: 'EstateWeb image id to delete' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  crm_image_id: number;
}

export class EnqueueDuplicateWatermarkCleanupDto {
  @ApiProperty({ type: [DuplicateWatermarkCleanupItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DuplicateWatermarkCleanupItemDto)
  items: DuplicateWatermarkCleanupItemDto[];
}
