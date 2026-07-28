import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class EstateWebSiteSelectionDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  selected: boolean;

  @ApiProperty({ example: 'spitogatos' })
  @IsString()
  name: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  agent_site_id: number;

  @ApiProperty({ enum: [0, 1], example: 0 })
  @Type(() => Number)
  @IsIn([0, 1])
  show_on_slider: 0 | 1;

  @ApiProperty({ enum: [0, 1], example: 0 })
  @Type(() => Number)
  @IsIn([0, 1])
  show_on_first_page: 0 | 1;

  @ApiProperty({ enum: [0, 1], example: 0 })
  @Type(() => Number)
  @IsIn([0, 1])
  show_on_relative_pages: 0 | 1;
}

export class UpdateEstateWebSitesDto {
  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiProperty({
    type: [EstateWebSiteSelectionDto],
    description:
      'Selected EstateWeb publish sites only. Send [] to clear all sites.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EstateWebSiteSelectionDto)
  sites: EstateWebSiteSelectionDto[];
}
