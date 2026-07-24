import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum MigrateIntegrationImagesMode {
  REMAP_SOURCES = 'remap_sources',
  FROM_CRM = 'from_crm',
}

export class MigrateIntegrationImagesDto {
  @ApiProperty({
    enum: MigrateIntegrationImagesMode,
    description:
      'remap_sources: fetch CRM images and remap source_image from property/existing sources. from_crm: fetch CRM images only, discard stored source_image.',
  })
  @IsEnum(MigrateIntegrationImagesMode)
  mode: MigrateIntegrationImagesMode;
}
