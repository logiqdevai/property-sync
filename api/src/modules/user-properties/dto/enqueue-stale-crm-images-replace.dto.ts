import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class StaleCrmImageReplaceItemDto {
  @ApiProperty({ example: 'd86ead3f-9ef0-4c2e-8ac0-a46c91a0999b' })
  @IsString()
  user_property_id: string;

  @ApiProperty({ example: 1249791, description: 'EstateWeb image id to replace' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  crm_image_id: number;

  @ApiProperty({
    example: 'https://storage.googleapis.com/.../watermark-removed-....jpg',
    description: 'The current local image to upload in place of the stale CRM image',
  })
  @IsString()
  new_source_image: string;

  @ApiProperty({ example: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position: number;

  @ApiProperty()
  @IsBoolean()
  show_on_site: boolean;

  @ApiProperty()
  @IsBoolean()
  show_on_groups: boolean;

  @ApiProperty()
  @IsBoolean()
  show_on_foreign_agents: boolean;
}

export class EnqueueStaleCrmImagesReplaceDto {
  @ApiProperty({ type: [StaleCrmImageReplaceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StaleCrmImageReplaceItemDto)
  items: StaleCrmImageReplaceItemDto[];
}
