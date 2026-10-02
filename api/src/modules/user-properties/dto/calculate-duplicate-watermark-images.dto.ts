import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class CalculateDuplicateWatermarkImagesDto {
  @ApiProperty({
    type: [String],
    description: 'Source agency ids to scan for duplicate watermarked images',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  source_agency_ids: string[];
}
