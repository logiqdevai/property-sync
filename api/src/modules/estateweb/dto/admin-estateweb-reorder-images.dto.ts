import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';

export class AdminEstateWebReorderImageItemDto {
  @ApiProperty({ example: 1203884, description: 'EstateWeb image id' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id: number;

  @ApiProperty({ example: 1, description: 'New position (1-based)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  zindex: number;
}

export class AdminEstateWebReorderImagesDto {
  @ApiProperty({ type: [AdminEstateWebReorderImageItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AdminEstateWebReorderImageItemDto)
  data: AdminEstateWebReorderImageItemDto[];
}
