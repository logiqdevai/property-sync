import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
} from 'class-validator';

export class UpdateIntegrationImagesDto {
  @ApiProperty({ type: [Number], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  image_ids: number[];

  @ApiProperty({ default: true })
  @IsBoolean()
  show_on_site: boolean;

  @ApiProperty({ default: true })
  @IsBoolean()
  show_on_groups: boolean;

  @ApiProperty({ default: false })
  @IsBoolean()
  show_on_foreign_agents: boolean;
}
