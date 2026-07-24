import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsString } from 'class-validator';

export class RemoveWatermarkImagesDto {
  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  image_ids: string[];

  @ApiProperty()
  @IsBoolean()
  replace_crm_images: boolean;
}
