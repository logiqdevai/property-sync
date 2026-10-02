import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class CalculateStaleCrmImagesDto {
  @ApiProperty({
    type: [String],
    description:
      'Source agency ids to scan for CRM images whose content no longer matches the local (already-updated) image at the same position',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  source_agency_ids: string[];
}
