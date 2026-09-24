import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, Min } from 'class-validator';

export class ReorderIntegrationImagesDto {
  @ApiProperty({
    type: [Number],
    minItems: 1,
    description: 'CMS image ids in the desired display order (first = cover)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  image_ids: number[];
}
