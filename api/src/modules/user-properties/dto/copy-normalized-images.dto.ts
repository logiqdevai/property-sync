import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class CopyNormalizedImagesDto {
  @ApiProperty({ type: [Number], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  image_indexes: number[];

  @ApiPropertyOptional({
    description:
      'Run watermark removal on each selected image before copying it and uploading it to the CMS.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  remove_watermark?: boolean;
}
