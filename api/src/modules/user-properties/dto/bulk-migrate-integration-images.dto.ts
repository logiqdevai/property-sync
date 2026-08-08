import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsEnum, IsUUID } from 'class-validator';
import { MigrateIntegrationImagesMode } from './migrate-integration-images.dto';

export class BulkMigrateIntegrationImagesDto {
  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiProperty({
    enum: MigrateIntegrationImagesMode,
    description:
      'remap_sources: fetch CRM images and remap source_image from property/existing sources. from_crm: fetch CRM images only, discard stored source_image.',
  })
  @IsEnum(MigrateIntegrationImagesMode)
  mode: MigrateIntegrationImagesMode;
}
