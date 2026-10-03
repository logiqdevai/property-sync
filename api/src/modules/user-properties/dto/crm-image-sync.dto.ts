import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsOptional, IsString } from 'class-validator';

export class CrmImageSyncDto {
  @ApiProperty({
    type: [String],
    description:
      'Source agency ids whose properties should have exactly their "images to keep" on the CRM',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  source_agency_ids: string[];

  @ApiProperty({
    type: [String],
    required: false,
    description: 'Only sync these properties (within the selected agencies)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  user_property_ids?: string[];
}
