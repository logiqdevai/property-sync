import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class CalculateImageCapExcessImagesDto {
  @ApiProperty({
    type: [String],
    description: 'Source agency ids to scan for excess CRM images beyond the local image cap',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  source_agency_ids: string[];
}
